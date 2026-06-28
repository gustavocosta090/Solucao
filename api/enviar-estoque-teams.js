// api/enviar-estoque-teams.js — posta a Programação de Estoque num canal do Teams
// build: 2026-06-25a
// POST { path, periodo } (Authorization: Bearer <sessão Supabase>)
// Cria um link organizacional do PDF no SharePoint e posta um Adaptive Card no fluxo
// (Power Automate "Post to a channel when a webhook request is received") definido em TEAMS_WEBHOOK_URL.

import { getToken, getSiteId, fetchComRetry } from './_sharepoint.js';

const SUPABASE_URL = 'https://kxtjqudpnmdqkzqhyhmz.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4dGpxdWRwbm1kcWt6cWh5aG16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NDYzMzEsImV4cCI6MjA5NTIyMjMzMX0.tba066RGNwDbXaNEy3w_OHbblll_bky6Dx10mXnxVQ0';

const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL || '';

async function validarSessao(req){
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/i,'').trim();
  if (!token) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  return r.json();
}

export default async function handler(req, res){
  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://solucaotecnica.vercel.app';
  const origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', origin === allowedOrigin ? origin : allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  // Sem webhook configurado ainda: não é erro, só não posta (evita toast de erro antes do setup)
  if (!TEAMS_WEBHOOK_URL) return res.status(200).json({ ok: true, skipped: true, motivo: 'TEAMS_WEBHOOK_URL não configurada' });

  const { path, periodo } = req.body || {};
  if (!path || String(path).includes('..')) return res.status(400).json({ error: 'path inválido' });
  const per = periodo ? String(periodo) : '';

  try {
    const user = await validarSessao(req);
    if (!user?.id) return res.status(401).json({ error: 'Sessão inválida ou expirada' });

    // 1) Link organizacional (somente leitura) do PDF no SharePoint
    let link = null;
    try {
      const token  = await getToken();
      const siteId = await getSiteId(token);
      const enc = String(path).split('/').map(encodeURIComponent).join('/');
      const r = await fetchComRetry(
        `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${enc}:/createLink`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'view', scope: 'organization' }) },
        { timeout: 12000 }
      );
      const d = await r.json();
      link = d?.link?.webUrl || null;
    } catch (e) { console.warn('[estoque-teams] createLink falhou:', e.message); }

    // 2) Adaptive Card
    const card = {
      type: 'AdaptiveCard',
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      version: '1.4',
      body: [
        { type: 'TextBlock', text: '📦 Programação de Atendimento', weight: 'Bolder', size: 'Large', wrap: true },
        ...(per ? [{ type: 'TextBlock', text: `Semana de ${per}`, isSubtle: true, spacing: 'None', wrap: true }] : []),
        { type: 'TextBlock', text: link
            ? 'A programação semanal já está disponível. Toque no botão abaixo para abrir o PDF.'
            : 'A programação semanal já está disponível (verifique no SharePoint).', wrap: true, spacing: 'Medium' },
      ],
      ...(link ? { actions: [{ type: 'Action.OpenUrl', title: 'Abrir PDF da semana', url: link }] } : {}),
    };

    const payload = {
      type: 'message',
      attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: card }],
    };

    const tr = await fetch(TEAMS_WEBHOOK_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    if (!tr.ok) throw new Error('webhook Teams ' + tr.status + ': ' + await tr.text());

    return res.status(200).json({ ok: true, link: !!link });

  } catch (e) {
    console.error('[api/enviar-estoque-teams]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
