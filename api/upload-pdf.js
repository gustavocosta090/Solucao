// api/upload-pdf.js — upload de PDF direto via Graph API (server-side, sem CORS)
// POST { path, filename, contentBase64 } → { filePath }

import { getToken, getSiteId } from './_sharepoint.js';

const SUPABASE_URL     = 'https://kxtjqudpnmdqkzqhyhmz.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4dGpxdWRwbm1kcWt6cWh5aG16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NDYzMzEsImV4cCI6MjA5NTIyMjMzMX0.tba066RGNwDbXaNEy3w_OHbblll_bky6Dx10mXnxVQ0';

async function validarSessao(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

function caminhoSeguro(path, filename) {
  if (!path || !filename) return false;
  if (path.includes('..') || filename.includes('..')) return false;
  if (/[\\:*?"<>|#%~]/.test(filename)) return false;
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext === 'pdf';
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

  const { path: folderPath, filename, contentBase64 } = req.body || {};

  if (!folderPath || !filename || !contentBase64) {
    return res.status(400).json({ error: 'path, filename e contentBase64 são obrigatórios' });
  }
  if (!caminhoSeguro(folderPath, filename)) {
    return res.status(400).json({ error: 'Caminho ou nome de arquivo inválido' });
  }

  try {
    const user = await validarSessao(req);
    if (!user?.id) return res.status(401).json({ error: 'Sessão inválida ou expirada' });

    const token    = await getToken();
    const siteId   = await getSiteId(token);
    const filePath = `${folderPath}/${filename}`;
    const encoded  = filePath.split('/').map(encodeURIComponent).join('/');

    // Converte base64 para buffer
    const pdfBuffer = Buffer.from(contentBase64, 'base64');

    // PUT direto via Graph API (para arquivos < 4MB — PDFs de agenda cabem fácil)
    const putRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encoded}:/content`,
      {
        method:  'PUT',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/pdf',
        },
        body: pdfBuffer,
      }
    );

    if (!putRes.ok) {
      const err = await putRes.json().catch(() => ({}));
      throw new Error(`Graph API falhou: ${putRes.status} — ${JSON.stringify(err)}`);
    }

    return res.status(200).json({ filePath });

  } catch (e) {
    console.error('[api/upload-pdf]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
