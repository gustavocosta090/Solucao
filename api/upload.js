// api/upload.js — Vercel Serverless Function

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
  if (!data.access_token) throw new Error('Token error: ' + JSON.stringify(data));

  _cachedToken    = data.access_token;
  _tokenExpiresAt = Date.now() + data.expires_in * 1000;
  console.log('[upload] token obtido, expira em', data.expires_in, 's');
  return _cachedToken;
}

async function getSiteId(token) {
  if (_cachedSiteId) return _cachedSiteId;

  // Sanitiza as variáveis — remove https://, barras extras, query strings
  let host     = (process.env.MS_SHAREPOINT_HOST || '')
    .replace(/^https?:\/\//i, '')   // remove https://
    .replace(/\/.*$/, '')           // remove qualquer caminho
    .trim();
  let sitePath = (process.env.MS_SHAREPOINT_SITE_PATH || '/')
    .replace(/^https?:\/\/[^/]*/i, '')  // remove https://host se presente
    .replace(/\?.*$/, '')               // remove query string
    .replace(/\/Forms\/.*$/, '')        // remove /Forms/AllItems.aspx etc
    .trim();
  if (!sitePath.startsWith('/')) sitePath = '/' + sitePath;

  console.log('[upload] host:', host, '| sitePath:', sitePath);

  // Tentativa 1: URL direta com caminho
  const url1 = `https://graph.microsoft.com/v1.0/sites/${host}:${sitePath}`;
  console.log('[upload] tentando site URL:', url1);
  const r1   = await fetch(url1, { headers: { Authorization: `Bearer ${token}` } });
  const d1   = await r1.json();
  console.log('[upload] resposta tentativa 1:', JSON.stringify(d1).slice(0, 300));

  if (d1.id) {
    _cachedSiteId = d1.id;
    return _cachedSiteId;
  }

  // Tentativa 2: busca pelo nome do site
  const siteName = sitePath.split('/').filter(Boolean).pop(); // "TecnicaSolucaocba"
  const url2     = `https://graph.microsoft.com/v1.0/sites?search=${encodeURIComponent(siteName)}`;
  console.log('[upload] tentando busca por nome:', url2);
  const r2 = await fetch(url2, { headers: { Authorization: `Bearer ${token}` } });
  const d2 = await r2.json();
  console.log('[upload] resposta tentativa 2:', JSON.stringify(d2).slice(0, 300));

  const found = (d2.value || []).find(s =>
    s.webUrl?.toLowerCase().includes(siteName.toLowerCase())
  );
  if (found?.id) {
    console.log('[upload] site encontrado por busca:', found.webUrl, '→', found.id);
    _cachedSiteId = found.id;
    return _cachedSiteId;
  }

  // Tentativa 3: site raiz (útil pra debug)
  const url3 = `https://graph.microsoft.com/v1.0/sites/${host}`;
  console.log('[upload] tentando site raiz:', url3);
  const r3 = await fetch(url3, { headers: { Authorization: `Bearer ${token}` } });
  const d3 = await r3.json();
  console.log('[upload] resposta raiz:', JSON.stringify(d3).slice(0, 300));

  throw new Error(
    `Site não encontrado após 3 tentativas. ` +
    `T1: ${d1.error?.code}/${d1.error?.message}. ` +
    `T2: ${d2.error?.code || (d2.value?.length + ' sites')}. ` +
    `T3: ${d3.error?.code || d3.webUrl}`
  );
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { path: folderPath, filename, contentType } = req.body || {};
  if (!folderPath || !filename) {
    return res.status(400).json({ error: 'path e filename obrigatórios' });
  }

  try {
    const token  = await getToken();
    const siteId = await getSiteId(token);

    const fullPath    = `${folderPath}/${filename}`;
    const encodedPath = fullPath.split('/').map(encodeURIComponent).join('/');

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
    if (!sessData.uploadUrl) {
      throw new Error('Sessão de upload falhou: ' + JSON.stringify(sessData));
    }

    return res.status(200).json({ uploadUrl: sessData.uploadUrl });

  } catch (e) {
    console.error('[api/upload] erro final:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
