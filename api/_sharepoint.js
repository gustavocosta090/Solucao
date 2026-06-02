// SAOS-AUDIT: build 2026-06-01 pós-auditoria
// api/_sharepoint.js — autenticação compartilhada SharePoint/Graph API
// build: 2026-06-01c
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

// Retry com backoff exponencial para erros transientes do Graph API (429, 502, 503)
// maxRetries = número de tentativas extras após a primeira
export async function fetchComRetry(url, options = {}, { timeout = 15000, maxRetries = 3, baseDelay = 500 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetchComTimeout(url, options, timeout);

      // Sucesso ou erro definitivo (4xx exceto 429) — não retenta
      if (res.ok || (res.status < 500 && res.status !== 429)) return res;

      // 429: respeita Retry-After se presente
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '0', 10);
        const delay = (retryAfter > 0 ? retryAfter * 1000 : baseDelay * 2 ** attempt);
        if (attempt < maxRetries) await new Promise(r => setTimeout(r, delay));
        lastErr = new Error(`Graph API 429 — throttled`);
        continue;
      }

      // 502/503: backoff exponencial
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, baseDelay * 2 ** attempt));
      lastErr = new Error(`Graph API ${res.status}`);

    } catch (e) {
      lastErr = e;
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, baseDelay * 2 ** attempt));
    }
  }
  logErr('fetchComRetry', `Esgotadas ${maxRetries + 1} tentativas`, { url: url.split('?')[0], message: lastErr?.message });
  throw lastErr;
}

function logErr(fn, msg, extra = {}) {
  console.error(JSON.stringify({ ts: new Date().toISOString(), fn, msg, ...extra }));
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
  if (!data.access_token) {
    logErr('getToken', 'Falha ao obter token MS', { error: data.error, desc: data.error_description });
    throw new Error('Falha de autenticação com Microsoft Graph');
  }

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

  logErr('getSiteId', 'Site SharePoint não encontrado', {
    host, sitePath,
    t1: d1.error?.code,
    t2: d2.error?.code || `${d2.value?.length ?? 0} sites encontrados`,
  });
  throw new Error(`Site SharePoint não encontrado. Host: "${host}", Path: "${sitePath}"`);
}
