// api/enviar-os-email.js — envia e-mail de OS finalizada via Microsoft Graph (Mail.Send)
// build: 2026-06-17 — e-mail redesenhado (logo + layout claro)
// POST { numeroOS, cliente, tecnico, data, tipoServico, planejado, realizado,
//        pdfBase64, fotosFolder, qtdFotos } → envia para ordens@solucaotecnica.com.br
// PDF vai anexado; fotos/vídeos vão como LINK organizacional da pasta no SharePoint.

import { getToken, getSiteId, fetchComRetry } from './_sharepoint.js';

const SUPABASE_URL      = 'https://kxtjqudpnmdqkzqhyhmz.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4dGpxdWRwbm1kcWt6cWh5aG16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NDYzMzEsImV4cCI6MjA5NTIyMjMzMX0.tba066RGNwDbXaNEy3w_OHbblll_bky6Dx10mXnxVQ0';

const MAIL_TO     = process.env.MS_MAIL_TO     || 'ordens@solucaotecnica.com.br';
const MAIL_SENDER = process.env.MS_MAIL_SENDER || 'ordens@solucaotecnica.com.br';

const SITE_URL = (process.env.SITE_URL || 'https://solucaotecnica.vercel.app').replace(/\/$/, '');
const LOGO_URL = `${SITE_URL}/logosolucao.png`;

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

    const tipoTxt = b.tipoServico === 'assistencia' ? 'Assistência'
      : (b.tipoServico === 'plantao' ? 'Plantão' : 'Execução');
    const linha = (lbl, val) => val ? `<tr>
        <td style="padding:9px 14px;border-bottom:1px solid #eef0f2;color:#7a7a86;font-weight:600;font-size:13px;white-space:nowrap;vertical-align:top;width:140px">${esc(lbl)}</td>
        <td style="padding:9px 14px;border-bottom:1px solid #eef0f2;color:#1a1a1e;font-size:13px;vertical-align:top">${esc(val)}</td>
      </tr>` : '';
    const html = `
<div style="background:#f4f5f7;padding:24px 0;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="640" align="center" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;margin:0 auto;background:#ffffff;border:1px solid #e6e8eb;border-radius:10px;overflow:hidden">
    <tr><td style="padding:24px 28px 18px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle"><img src="${LOGO_URL}" alt="Solução Automação" height="32" style="display:block;height:32px;border:0"></td>
        <td style="vertical-align:middle;text-align:right">
          <div style="font-size:11px;font-weight:700;letter-spacing:.5px;color:#8a8a96">ORDEM DE SERVIÇO</div>
          <div style="font-size:18px;font-weight:700;color:#1a1a1e">${esc(b.numeroOS)}</div>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="height:4px;background:#3ECF8E;font-size:0;line-height:0">&nbsp;</td></tr>
    <tr><td style="padding:22px 28px 6px">
      <div style="font-size:11px;color:#8a8a96;font-weight:700;letter-spacing:.4px">CLIENTE</div>
      <div style="font-size:20px;font-weight:700;color:#1a1a1e;margin:2px 0 6px">${esc(b.cliente || '—')}</div>
      <span style="display:inline-block;background:rgba(62,207,142,.12);color:#1f9d68;font-size:12px;font-weight:700;padding:3px 11px;border-radius:20px">${esc(tipoTxt)}</span>
    </td></tr>
    <tr><td style="padding:14px 28px 4px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eef0f2;border-radius:8px;border-collapse:separate;overflow:hidden">
        ${linha('Técnico', b.tecnico)}
        ${linha('Data', b.data)}
        ${linha('Serviço planejado', b.planejado)}
        ${linha('Serviços realizados', b.realizado)}
      </table>
    </td></tr>
    <tr><td style="padding:18px 28px 4px">
      <span style="display:inline-block;background:#f4f5f7;border:1px solid #e6e8eb;border-radius:8px;padding:10px 14px;font-size:13px;color:#1a1a1e">&#128206; <strong>PDF da OS</strong> em anexo</span>
    </td></tr>
    ${linkMidia
      ? `<tr><td style="padding:10px 28px 4px">
           <a href="${esc(linkMidia)}" style="display:inline-block;background:#3ECF8E;color:#06301f;font-size:14px;font-weight:700;text-decoration:none;padding:11px 22px;border-radius:8px">Ver ${b.qtdFotos} foto(s) / vídeo(s)</a>
         </td></tr>`
      : (b.qtdFotos > 0 ? `<tr><td style="padding:10px 28px 4px;font-size:13px;color:#9a9aa2">Mídias enviadas ao SharePoint (link indisponível).</td></tr>` : '')}
    <tr><td style="padding:18px 28px 24px">
      <div style="border-top:1px solid #eef0f2;padding-top:14px;font-size:11px;color:#a0a0aa">Enviado automaticamente pelo SAOS · Solução Automação</div>
    </td></tr>
  </table>
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
