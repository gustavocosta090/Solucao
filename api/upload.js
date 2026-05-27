// api/upload.js — cria sessão de upload no SharePoint
// POST { path, filename, contentType } → { uploadUrl, filePath }
// O browser faz o PUT direto para uploadUrl (pré-autenticada, sem auth header)

import { getToken, getSiteId } from './_sharepoint.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { path: folderPath, filename } = req.body || {};
  if (!folderPath || !filename) {
    return res.status(400).json({ error: 'path e filename obrigatórios' });
  }

  try {
    const token    = await getToken();
    const siteId   = await getSiteId(token);
    const filePath = `${folderPath}/${filename}`;

    const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');

    const sessRes = await fetch(
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
