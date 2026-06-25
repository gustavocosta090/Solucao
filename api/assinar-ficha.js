// api/assinar-ficha.js — registra a assinatura pública de uma ficha (sem login)
// build: 2026-06-25a
// POST { token, assinatura(dataURL/base64 png), selfie(dataURL/base64 jpg) }
// Valida token + status pendente + não expirada (uso único), sobe as imagens ao
// SharePoint (pasta Fichas/Assinaturas) e marca a ficha como assinada com trilha de auditoria.

import { getToken, getSiteId } from './_sharepoint.js';

const SUPABASE_URL = 'https://kxtjqudpnmdqkzqhyhmz.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4dGpxdWRwbm1kcWt6cWh5aG16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NDYzMzEsImV4cCI6MjA5NTIyMjMzMX0.tba066RGNwDbXaNEy3w_OHbblll_bky6Dx10mXnxVQ0';

function soBase64(dataUrl) { return String(dataUrl || '').replace(/^data:[^;]+;base64,/, ''); }

export default async function handler(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://solucaotecnica.vercel.app';
  const origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', origin === allowedOrigin ? origin : allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { token, assinatura, selfie } = req.body || {};
  const tok = String(token || '').trim().toLowerCase();
  if (!/^[0-9a-f-]{10,40}$/.test(tok))   return res.status(400).json({ error: 'token inválido' });
  if (!assinatura || !selfie)            return res.status(400).json({ error: 'assinatura e selfie são obrigatórias' });

  const assBuf = Buffer.from(soBase64(assinatura), 'base64');
  const selBuf = Buffer.from(soBase64(selfie), 'base64');
  if (!assBuf.length || !selBuf.length)  return res.status(400).json({ error: 'imagens inválidas' });
  if (assBuf.length > 3_000_000 || selBuf.length > 4_000_000) return res.status(413).json({ error: 'imagem muito grande' });

  try {
    // 1) Busca a ficha e valida o estado
    const fr = await fetch(
      `${SUPABASE_URL}/rest/v1/fichas_assinatura?token=eq.${tok}&select=id,status,expira_em`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    const rows = await fr.json();
    const f = Array.isArray(rows) && rows[0];
    if (!f)                    return res.status(404).json({ error: 'Ficha não encontrada' });
    if (f.status === 'assinada') return res.status(409).json({ error: 'Esta ficha já foi assinada.' });
    if (f.expira_em && new Date(f.expira_em) < new Date()) return res.status(410).json({ error: 'Link expirado.' });

    // 2) Sobe as imagens ao SharePoint (PUT por caminho cria as pastas automaticamente)
    const tkn    = await getToken();
    const siteId = await getSiteId(tkn);
    async function put(path, buf, ct) {
      const enc = path.split('/').map(encodeURIComponent).join('/');
      const r = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${enc}:/content`,
        { method: 'PUT', headers: { Authorization: `Bearer ${tkn}`, 'Content-Type': ct }, body: buf }
      );
      if (!r.ok) throw new Error('SharePoint ' + r.status + ': ' + await r.text());
      return `/api/foto?path=${encodeURIComponent(path)}`;
    }
    const base   = 'Fichas/Assinaturas';
    const assUrl = await put(`${base}/ficha-${f.id}-assinatura.png`, assBuf, 'image/png');
    const selUrl = await put(`${base}/ficha-${f.id}-selfie.jpg`, selBuf, 'image/jpeg');

    // 3) Marca como assinada — filtro status=pendente garante uso único (assinatura concorrente = 0 linhas)
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
    const ua = String(req.headers['user-agent'] || '').slice(0, 400);
    const patch = await fetch(
      `${SUPABASE_URL}/rest/v1/fichas_assinatura?token=eq.${tok}&status=eq.pendente`,
      {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json', Prefer: 'return=representation',
        },
        body: JSON.stringify({
          status: 'assinada', assinatura_url: assUrl, selfie_url: selUrl,
          assinado_em: new Date().toISOString(), assinante_ip: ip, assinante_ua: ua,
        }),
      }
    );
    const updated = await patch.json();
    if (!Array.isArray(updated) || !updated.length) return res.status(409).json({ error: 'Ficha já assinada ou indisponível.' });

    return res.status(200).json({ ok: true });

  } catch (e) {
    console.error('[api/assinar-ficha]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
