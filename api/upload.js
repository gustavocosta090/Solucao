// api/upload.js — Vercel Serverless Function
//
// Recebe: POST { path, filename, contentType }
// Autentica com Microsoft 365 via client_credentials (segredo nunca vai pro browser)
// Cria upload session no SharePoint e retorna { uploadUrl }
// O browser faz o PUT diretamente para uploadUrl (URL pré-autenticada, sem auth header)
//
// Variáveis de ambiente necessárias no Vercel:
//   MS_TENANT_ID          — ID do locatário Azure AD
//   MS_CLIENT_ID          — ID do aplicativo Azure AD
//   MS_CLIENT_SECRET      — Segredo do aplicativo
//   MS_SHAREPOINT_HOST    — ex: suaempresa.sharepoint.com
//   MS_SHAREPOINT_SITE_PATH — ex: /sites/operacoes  (ou / para o site raiz)

let _cachedSiteId   = null;
let _cachedToken    = null;
let _tokenExpiresAt = 0;

async function getToken() {
  if (_cachedToken && Date.now() < _tokenExpiresAt - 60_000) return _cachedToken;

  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     process.env.MS_CLIENT_ID,
        client_secret: process.env.MS_CLIENT_SECRET,
        scope:         'https://graph.microsoft.com/.default',
      }),
    }
  );

  const data = await res.json();
  if (!data.access_token) throw new Error('Falha ao obter token Microsoft: ' + JSON.stringify(data));

  _cachedToken    = data.access_token;
  _tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return _cachedToken;
}

async function getSiteId(token) {
  if (_cachedSiteId) return _cachedSiteId;

  const host     = process.env.MS_SHAREPOINT_HOST;
  const sitePath = process.env.MS_SHAREPOINT_SITE_PATH || '/';
  const url      = `https://graph.microsoft.com/v1.0/sites/${host}:${sitePath}`;

  const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!data.id) throw new Error('Site SharePoint não encontrado: ' + JSON.stringify(data));

  _cachedSiteId = data.id;
  return _cachedSiteId;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { path: folderPath, filename, contentType } = req.body || {};
  if (!folderPath || !filename) {
    return res.status(400).json({ error: 'Campos obrigatórios: path, filename' });
  }

  try {
    const token  = await getToken();
    const siteId = await getSiteId(token);

    // Caminho completo dentro da biblioteca de documentos do SharePoint
    const fullPath    = `${folderPath}/${filename}`;
    const encodedPath = fullPath.split('/').map(encodeURIComponent).join('/');

    const sessRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodedPath}:/createUploadSession`,
      {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          item: {
            '@microsoft.graph.conflictBehavior': 'replace',
            name: filename,
          },
        }),
      }
    );

    const sessData = await sessRes.json();
    if (!sessData.uploadUrl) {
      throw new Error('Erro ao criar sessão de upload: ' + JSON.stringify(sessData));
    }

    return res.status(200).json({ uploadUrl: sessData.uploadUrl });

  } catch (e) {
    console.error('[api/upload] erro:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
