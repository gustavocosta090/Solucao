// api/enviar-os-email.js — envia e-mail de OS finalizada via Microsoft Graph (Mail.Send)
// build: 2026-06-13a
// POST { numeroOS, cliente, tecnico, data, tipoServico, planejado, realizado,
//        pdfBase64, fotosFolder, qtdFotos } → envia para ordens@solucaotecnica.com.br
// PDF vai anexado; fotos/vídeos vão como LINK organizacional da pasta no SharePoint.

import { getToken, getSiteId, fetchComRetry } from './_sharepoint.js';

const SUPABASE_URL      = 'https://kxtjqudpnmdqkzqhyhmz.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4dGpxdWRwbm1kcWt6cWh5aG16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NDYzMzEsImV4cCI6MjA5NTIyMjMzMX0.tba066RGNwDbXaNEy3w_OHbblll_bky6Dx10mXnxVQ0';

const MAIL_TO     = process.env.MS_MAIL_TO     || 'ordens@solucaotecnica.com.br';
const MAIL_SENDER = process.env.MS_MAIL_SENDER || 'ordens@solucaotecnica.com.br';

async function validarSessao(req) {
  const auth = req.headers.authorization || '';
  const jwt = auth.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${jwt}` },
  });
  return r.ok ? r.json() : null;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const b = req.body || {};
  if (!b.numeroOS) return res.status(400).json({ error: 'numeroOS obrigatório' });

  try {
    const user = await validarSessao(req);
    if (!user?.id) return res.status(401).json({ error: 'Sessão inválida ou expirada' });

    const token  = await getToken();

    // Link organizacional para a pasta de fotos/vídeos (se houver mídia)
    let linkMidia = null;
    if (b.fotosFolder && b.qtdFotos > 0) {
      try {
        const siteId = await getSiteId(token);
        const enc = b.fotosFolder.split('/').map(encodeURIComponent).join('/');
        const r = await fetchComRetry(
          `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${enc}:/createLink`,
          { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'view', scope: 'organization' }) },
          { timeout: 12000 }
        );
        const d = await r.json();
        linkMidia = d?.link?.webUrl || null;
      } catch (e) { console.warn('[os-email] createLink falhou:', e.message); }
    }

    const linha = (lbl, val) => val ? `<tr><td style="padding:4px 10px;color:#666;font-weight:600;white-space:nowrap;vertical-align:top">${esc(lbl)}</td><td style="padding:4px 10px;color:#111">${esc(val)}</td></tr>` : '';
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:640px">
        <h2 style="margin:0 0 4px">Ordem de Serviço ${esc(b.numeroOS)}</h2>
        <p style="margin:0 0 16px;color:#666">Cliente: <strong>${esc(b.cliente || '—')}</strong></p>
        <table style="border-collapse:collapse;font-size:14px">
          ${linha('Técnico', b.tecnico)}
          ${linha('Data', b.data)}
          ${linha('Tipo', b.tipoServico === 'assistencia' ? 'Assistência' : (b.tipoServico === 'plantao' ? 'Plantão' : 'Execução'))}
          ${linha('Serviço planejado', b.planejado)}
          ${linha('Serviços realizados', b.realizado)}
        </table>
        <p style="margin:18px 0 6px;font-size:14px">PDF da OS em anexo.</p>
        ${linkMidia
          ? `<p style="margin:6px 0;font-size:14px">📷 ${b.qtdFotos} foto(s)/vídeo(s): <a href="${esc(linkMidia)}">abrir pasta no SharePoint</a></p>`
          : (b.qtdFotos > 0 ? `<p style="margin:6px 0;font-size:13px;color:#999">Mídias enviadas ao SharePoint (link indisponível).</p>` : '')}
        <hr style="border:none;border-top:1px solid #eee;margin:18px 0">
        <p style="font-size:12px;color:#999">Enviado automaticamente pelo SAOS — Solução Técnica.</p>
      </div>`;

    const attachments = [];
    if (b.pdfBase64) {
      attachments.push({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: `OS ${b.numeroOS} - ${(b.cliente || 'cliente').replace(/[\\/:*?"<>|]/g, '')}.pdf`.slice(0, 120),
        contentType: 'application/pdf',
        contentBytes: b.pdfBase64,
      });
    }

    const sendRes = await fetchComRetry(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(MAIL_SENDER)}/sendMail`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            subject: `OS ${b.numeroOS} - ${b.cliente || 'Cliente'}`,
            body: { contentType: 'HTML', content: html },
            toRecipients: [{ emailAddress: { address: MAIL_TO } }],
            attachments,
          },
          saveToSentItems: true,
        }) },
      { timeout: 20000 }
    );

    if (!sendRes.ok && sendRes.status !== 202) {
      const txt = await sendRes.text().catch(() => '');
      throw new Error(`Graph sendMail ${sendRes.status}: ${txt}`);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[api/enviar-os-email]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
