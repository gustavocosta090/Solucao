// api/foto.js — proxy de imagens/arquivos do SharePoint
// GET /api/foto?path=Ordens%20de%20Servi%C3%A7o%2Fcliente%2Farquivo.jpg
// Busca o arquivo server-side (sem autenticação do usuário) e entrega pro browser.

import { getToken, getSiteId } from './_sharepoint.js';

function caminhoFotoSeguro(filePath) {
  const path = String(filePath || '').trim();
  if (!path.startsWith('Obras e Clientes ')) return false;
  if (path.includes('..')) return false;
  if (/[\\:*?"<>|#%~]/.test(path)) return false;

  const partes = path.split('/').filter(Boolean);
  if (partes.length < 5) return false;

  const area = partes[2];
  const nomeArquivo = partes[partes.length - 1] || '';
  const ext = nomeArquivo.split('.').pop()?.toLowerCase();

  if (!['Fotos', 'Ordens de Serviço'].includes(area)) return false;
  return ['jpg', 'jpeg', 'png', 'webp', 'heic', 'pdf'].includes(ext);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const filePath = req.query.path;
  if (!filePath) return res.status(400).send('path obrigatório');
  if (!caminhoFotoSeguro(filePath)) return res.status(400).send('path inválido');

  try {
    const token  = await getToken();
    const siteId = await getSiteId(token);

    const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');

    const fileRes = await fetch(
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

    const contentType = fileRes.headers.get('content-type') || 'image/jpeg';
    const buffer      = Buffer.from(await fileRes.arrayBuffer());

    res.setHeader('Content-Type',   contentType);
    res.setHeader('Cache-Control',  'public, max-age=86400, immutable'); // cache 24h no browser
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);

  } catch (e) {
    console.error('[api/foto]', e.message);
    return res.status(500).send(e.message);
  }
}
