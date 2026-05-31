// api/upload.js — cria sessão de upload no SharePoint
// POST { path, filename, contentType } → { uploadUrl, filePath }
// O browser faz o PUT direto para uploadUrl (pré-autenticada, sem auth header)

import { getToken, getSiteId } from './_sharepoint.js';

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

function caminhoSeguro(folderPath, filename) {
  const path = String(folderPath || '');
  const name = String(filename || '');
  if (!path.startsWith('Obras e Clientes ')) return false;
  if (path.includes('..') || name.includes('..')) return false;
  if (/[\\:*?"<>|#%~]/.test(name)) return false;
  return true;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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
