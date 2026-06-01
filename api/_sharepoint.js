// api/_sharepoint.js — autenticação compartilhada SharePoint/Graph API
// build: 2026-06-01b
// Arquivo privado (prefixo _), não exposto como rota pelo Vercel.

let _cachedSiteId   = null;
let _cachedToken    = null;
let _tokenExpiresAt = 0;

async function fetchComTimeout(url, options = {}, ms = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`Timeout ao chamar ${url}`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function getToken() {
  if (_cachedToken && Date.now() < _tokenExpiresAt - 60_000) return _cachedToken;

  const res = await fetchComTimeout(
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
  return _cachedToken;
}

export async function getSiteId(token) {
  if (_cachedSiteId) return _cachedSiteId;

  // Sanitiza variáveis de ambiente (aceita URL completa ou só host/path)
  let host = (process.env.MS_SHAREPOINT_HOST || '')
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .trim();

  let sitePath = (process.env.MS_SHAREPOINT_SITE_PATH || '/')
    .replace(/^https?:\/\/[^/]*/i, '')
    .replace(/\?.*$/, '')
    .replace(/\/Forms\/.*$/i, '')
    .trim();
  if (!sitePath.startsWith('/')) sitePath = '/' + sitePath;

  // Tentativa 1: URL direta
  const r1 = await fetchComTimeout(
    `https://graph.microsoft.com/v1.0/sites/${host}:${sitePath}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const d1 = await r1.json();
  if (d1.id) { _cachedSiteId = d1.id; return _cachedSiteId; }

  // Tentativa 2: busca por nome
  const siteName = sitePath.split('/').filter(Boolean).pop();
  const r2 = await fetchComTimeout(
    `https://graph.microsoft.com/v1.0/sites?search=${encodeURIComponent(siteName)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const d2   = await r2.json();
  const found = (d2.value || []).find(s =>
    s.webUrl?.toLowerCase().includes(siteName.toLowerCase())
  );
  if (found?.id) { _cachedSiteId = found.id; return _cachedSiteId; }

  throw new Error(
    `Site SharePoint não encontrado. ` +
    `Host: "${host}", Path: "${sitePath}". ` +
    `T1: ${d1.error?.code}. ` +
    `T2: ${d2.error?.code || d2.value?.length + ' sites'}`
  );
}
