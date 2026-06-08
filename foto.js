// SAOS-AUDIT: build 2026-06-01 pós-auditoria
// api/foto.js — proxy de imagens/arquivos do SharePoint
// build: 2026-06-08a — aceita token via query ?t= (tags <img>/<video> autenticam)
// GET /api/foto?path=Ordens%20de%20Servi%C3%A7o%2Fcliente%2Farquivo.jpg&t=<jwt>
// Busca o arquivo server-side e entrega pro browser. Requer sessão Supabase válida.

import { getToken, getSiteId, fetchComRetry } from './_sharepoint.js';

// ── Rate limiter in-memory (best-effort em serverless) ────────────────────────
// 100 requisições por minuto por usuário — protege contra scraping de fotos
const _fotoRate   = new Map();
const FOTO_MAX    = 100;
const FOTO_WINDOW = 60_000;

function checkFotoRateLimit(userId) {
  const now  = Date.now();
  const slot = _fotoRate.get(userId) || { count: 0, windowStart: now };
  if (now - slot.windowStart > FOTO_WINDOW) { slot.count = 1; slot.windowStart = now; }
  else slot.count++;
  _fotoRate.set(userId, slot);
  return slot.count <= FOTO_MAX;
}

const SUPABASE_URL      = 'https://kxtjqudpnmdqkzqhyhmz.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4dGpxdWRwbm1kcWt6cWh5aG16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NDYzMzEsImV4cCI6MjA5NTIyMjMzMX0.tba066RGNwDbXaNEy3w_OHbblll_bky6Dx10mXnxVQ0';

async function validarSessaoSupabase(req) {
  const auth     = req.headers.authorization || '';
  // Aceita token via header (fetch) OU via query ?t= (tags <img>/<video> não enviam header)
  const tokenJwt = (auth.replace(/^Bearer\s+/i, '').trim()) || String(req.query.t || '').trim();
  if (!tokenJwt) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${tokenJwt}` },
  });
  if (!res.ok) return null;
  return res.json();
}

function caminhoFotoSeguro(filePath) {
  const path = String(filePath || '').trim();
  if (path.includes('..')) return false;
  if (/[\\:*?"<>|#%~]/.test(path)) return false;

  const partes = path.split('/').filter(Boolean);
  const nomeArquivo = partes[partes.length - 1] || '';
  const ext = nomeArquivo.split('.').pop()?.toLowerCase();

  // Agenda Técnica (raiz própria): Agenda Tecnica/AAAA/Mês/[arquivo].pdf
  if (path.startsWith('Agenda Tecnica/')) {
    if (partes.length < 4) return false;
    return ext === 'pdf';
  }

  // Todos os outros caminhos devem estar em Obras e Clientes AAAA/
  if (!path.startsWith('Obras e Clientes ')) return false;
  if (partes.length < 4) return false;

  const nomeArquivoExts = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'pdf', 'mp4', 'mov', 'avi', 'webm'];
  const backupExts      = ['zip', 'json', 'xml', 'cfg', 'conf', 'txt', 'xlsx', 'csv', 'tar', 'gz', 'bak', '7z'];

  // Caminhos de cliente: Obras e Clientes AAAA/[Cliente]/[area]/...
  const area = partes[2];
  if (!['Fotos', 'Ordens de Serviço', 'Relatórios de Vistoria', 'Arquivos de Backups'].includes(area)) return false;
  if (area === 'Arquivos de Backups') return [...nomeArquivoExts, ...backupExts].includes(ext);
  return nomeArquivoExts.includes(ext);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const filePath = req.query.path;
  if (!filePath) return res.status(400).send('path obrigatório');
  if (!caminhoFotoSeguro(filePath)) return res.status(400).send('path inválido');

  const user = await validarSessaoSupabase(req);
  if (!user?.id) return res.status(401).send('Sessão inválida ou expirada');

  if (!checkFotoRateLimit(user.id)) {
    return res.status(429).send('Limite de requisições atingido. Aguarde 1 minuto.');
  }

  try {
    const token  = await getToken();
    const siteId = await getSiteId(token);

    const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');

    // Vídeos: redirect para URL de download do SharePoint CDN (evita buffering de arquivos grandes)
    const nomeArquivo = filePath.split('/').pop() || '';
    const ext = nomeArquivo.split('.').pop()?.toLowerCase();
    const isVideo = ['mp4', 'mov', 'avi', 'webm'].includes(ext);

    if (isVideo) {
      const metaRes = await fetchComRetry(
        `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodedPath}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!metaRes.ok) return res.status(metaRes.status).send('Arquivo não encontrado');
      const meta = await metaRes.json();
      const downloadUrl = meta['@microsoft.graph.downloadUrl'];
      if (!downloadUrl) return res.status(404).send('URL de download não disponível');
      // Redirect direto para o CDN do SharePoint (URL pré-autenticada, expira em ~1h)
      res.setHeader('Cache-Control', 'no-store');
      return res.redirect(302, downloadUrl);
    }

    // Imagens e PDFs: stream direto — não carrega o arquivo inteiro em RAM
    const fileRes = await fetchComRetry(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodedPath}:/content`,
      {
        headers:  { Authorization: `Bearer ${token}` },
        redirect: 'follow',
      }
    );

    if (!fileRes.ok) {
      console.error('[api/foto] arquivo não encontrado:', filePath, fileRes.status);
      return res.status(fileRes.status).send('Arquivo não encontrado');
    }

    const contentType   = fileRes.headers.get('content-type')   || 'image/jpeg';
    const contentLength = fileRes.headers.get('content-length');

    res.setHeader('Content-Type',  contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    const { Readable } = await import('node:stream');
    Readable.fromWeb(fileRes.body).pipe(res);

  } catch (e) {
    console.error('[api/foto]', e.message);
    return res.status(500).send(e.message);
  }
}
