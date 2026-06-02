// SAOS-AUDIT: build 2026-06-01 pós-auditoria
// api/upload.js — cria sessão de upload no SharePoint
// build: 2026-06-01i
// POST { path, filename, contentType } → { uploadUrl, filePath }
// O browser faz o PUT direto para uploadUrl (pré-autenticada, sem auth header)

import { getToken, getSiteId, fetchComRetry } from './_sharepoint.js';

// ── Rate limiter in-memory (best-effort em serverless) ────────────────────────
// Janela deslizante de 60s, máx 20 uploads por usuário
const _uploadRate = new Map(); // userId → { count, windowStart }
const RATE_MAX    = 20;
const RATE_WINDOW = 60_000; // 60 s

function checkRateLimit(userId) {
  const now  = Date.now();
  const slot = _uploadRate.get(userId) || { count: 0, windowStart: now };

  if (now - slot.windowStart > RATE_WINDOW) {
    // Janela expirou — reseta
    slot.count       = 1;
    slot.windowStart = now;
  } else {
    slot.count++;
  }

  _uploadRate.set(userId, slot);
  return slot.count <= RATE_MAX;
}

const SUPABASE_URL = 'https://kxtjqudpnmdqkzqhyhmz.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4dGpxdWRwbm1kcWt6cWh5aG16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NDYzMzEsImV4cCI6MjA5NTIyMjMzMX0.tba066RGNwDbXaNEy3w_OHbblll_bky6Dx10mXnxVQ0';

async function validarSessaoSupabase(req) {
  const auth = req.headers.authorization || '';
  const tokenJwt = auth.replace(/^Bearer\s+/i, '').trim();
  if (!tokenJwt) return null;

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${tokenJwt}`,
    },
  });

  if (!userRes.ok) return null;
  return userRes.json();
}

const EXT_FOTOS   = new Set(['jpg','jpeg','png','webp','heic','mp4','mov','avi','webm']);
const EXT_BACKUP  = new Set(['zip','json','xml','cfg','conf','txt','xlsx','csv','pdf','tar','gz','bak','7z']);
const EXT_AGENDA  = new Set(['pdf']);

function caminhoSeguro(folderPath, filename) {
  // Normaliza unicode para evitar bypass via homoglifos (ex: ＜ em vez de <)
  const path = String(folderPath || '').normalize('NFC');
  const name = String(filename  || '').normalize('NFC');

  // Limites de comprimento
  if (path.length > 400 || name.length > 200) return false;

  if (path.includes('..') || name.includes('..')) return false;
  if (/[\\:*?"<>|#%~]/.test(name)) return false;

  // Rejeita nomes de arquivo reservados no Windows (case-insensitive)
  const base = name.split('.')[0].toUpperCase();
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(base)) return false;

  const ext = name.split('.').pop()?.toLowerCase() || '';

  // Agenda Técnica: aceita apenas PDF
  if (path.startsWith('Agenda Tecnica/')) return EXT_AGENDA.has(ext);

  // Obras e Clientes: tipo de arquivo depende da subpasta
  if (path.startsWith('Obras e Clientes ')) {
    const partes = path.split('/').filter(Boolean);
    const area   = partes[2] || '';
    if (area === 'Arquivos de Backups')      return EXT_BACKUP.has(ext) || EXT_FOTOS.has(ext);
    if (area === 'Relatórios de Vistoria')   return EXT_AGENDA.has(ext); // apenas PDF
    return EXT_FOTOS.has(ext);
  }

  return false;
}

export default async function handler(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://solucaotecnica.vercel.app';
  const origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin',  origin === allowedOrigin ? origin : allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { path: folderPath, filename } = req.body || {};
  if (!folderPath || !filename) {
    return res.status(400).json({ error: 'path e filename obrigatórios' });
  }
  if (!caminhoSeguro(folderPath, filename)) {
    return res.status(400).json({ error: 'Caminho ou nome de arquivo inválido' });
  }

  try {
    const user = await validarSessaoSupabase(req);
    if (!user?.id) return res.status(401).json({ error: 'Sessão inválida ou expirada' });

    if (!checkRateLimit(user.id)) {
      return res.status(429).json({ error: 'Limite de uploads atingido. Aguarde 1 minuto.' });
    }

    const token    = await getToken();
    const siteId   = await getSiteId(token);
    const filePath = `${folderPath}/${filename}`;

    const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');

    const sessRes = await fetchComRetry(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodedPath}:/createUploadSession`,
      {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          item: { '@microsoft.graph.conflictBehavior': 'replace', name: filename },
        }),
      }
    );

    const sessData = await sessRes.json();
    if (!sessData.uploadUrl) throw new Error('Sessão falhou: ' + JSON.stringify(sessData));

    // filePath é usado pelo browser para construir a URL do proxy /api/foto
    return res.status(200).json({ uploadUrl: sessData.uploadUrl, filePath });

  } catch (e) {
    console.error('[api/upload]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
