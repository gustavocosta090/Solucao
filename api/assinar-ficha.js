// api/assinar-ficha.js — registra a assinatura pública de uma ficha (sem login)
// build: 2026-06-25c
// POST { token, assinatura(dataURL png), selfie(dataURL jpg), pdf(base64) }
// Valida token + pendente + não expirada (uso único), sobe assinatura/selfie/PDF ao
// SharePoint em PASTA POR COLABORADOR (nomes com data), envia o PDF por e-mail e marca assinada.

import { getToken, getSiteId } from './_sharepoint.js';

const SUPABASE_URL = 'https://kxtjqudpnmdqkzqhyhmz.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4dGpxdWRwbm1kcWt6cWh5aG16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NDYzMzEsImV4cCI6MjA5NTIyMjMzMX0.tba066RGNwDbXaNEy3w_OHbblll_bky6Dx10mXnxVQ0';

// Sender precisa ser mailbox real licenciado (ordens@ é lista, não serve). Destinatário provisório.
const MAIL_SENDER   = process.env.MS_MAIL_SENDER   || 'agendatecnica@solucaotecnica.com.br';
const FICHA_MAIL_TO = process.env.MS_FICHA_MAIL_TO || 'gustavo.martins@solucaotecnica.com.br';

function soBase64(dataUrl) { return String(dataUrl || '').replace(/^data:[^;]+;base64,/, ''); }
function escH(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
// Sanitiza nome para pasta/arquivo do SharePoint (mantém acentos e espaços; remove proibidos)
function limparNome(n){ return String(n||'').replace(/[\\/:*?"<>|#%~]/g,' ').replace(/\s+/g,' ').trim().slice(0,60); }
function dataBR(){ return new Date().toLocaleDateString('pt-BR', { timeZone:'America/Sao_Paulo' }).replace(/\//g,'-'); }

export default async function handler(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://solucaotecnica.vercel.app';
  const origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', origin === allowedOrigin ? origin : allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { token, assinatura, selfie, pdf } = req.body || {};
  const tok = String(token || '').trim().toLowerCase();
  if (!/^[0-9a-f-]{10,40}$/.test(tok))   return res.status(400).json({ error: 'token inválido' });
  if (!assinatura || !selfie)            return res.status(400).json({ error: 'assinatura e selfie são obrigatórias' });

  const assBuf = Buffer.from(soBase64(assinatura), 'base64');
  const selBuf = Buffer.from(soBase64(selfie), 'base64');
  const pdfBuf = pdf ? Buffer.from(soBase64(pdf), 'base64') : null;
  if (!assBuf.length || !selBuf.length)  return res.status(400).json({ error: 'imagens inválidas' });
  if (assBuf.length > 3_000_000 || selBuf.length > 4_000_000 || (pdfBuf && pdfBuf.length > 4_000_000))
    return res.status(413).json({ error: 'arquivo muito grande' });

  try {
    // 1) Busca a ficha e valida o estado
    const fr = await fetch(
      `${SUPABASE_URL}/rest/v1/fichas_assinatura?token=eq.${tok}&select=id,tipo,colaborador_nome,funcao,empresa,status,expira_em`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    const rows = await fr.json();
    const f = Array.isArray(rows) && rows[0];
    if (!f)                      return res.status(404).json({ error: 'Ficha não encontrada' });
    if (f.status === 'assinada') return res.status(409).json({ error: 'Esta ficha já foi assinada.' });
    if (f.expira_em && new Date(f.expira_em) < new Date()) return res.status(410).json({ error: 'Link expirado.' });

    const tipoLabel = f.tipo === 'epi' ? 'EPI' : 'Uniforme';
    const dataStr   = dataBR();
    const pasta     = `Fichas/${limparNome(f.colaborador_nome) || 'colaborador'}`;
    const baseNome  = `Ficha ${tipoLabel} ${dataStr}`;

    // 2) Sobe os arquivos ao SharePoint (PUT por caminho cria as pastas automaticamente)
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
    const assUrl = await put(`${pasta}/${baseNome} Assinatura.png`, assBuf, 'image/png');
    const selUrl = await put(`${pasta}/${baseNome} Foto.jpg`, selBuf, 'image/jpeg');
    let pdfUrl = null;
    if (pdfBuf) pdfUrl = await put(`${pasta}/${baseNome}.pdf`, pdfBuf, 'application/pdf');

    // 3) Envia o PDF por e-mail (best-effort — não derruba a assinatura se o e-mail falhar)
    try {
      const html =
        `<div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a">` +
        `<p>Uma ficha de <strong>${escH(tipoLabel)}</strong> foi assinada eletronicamente.</p>` +
        `<table style="border-collapse:collapse;font-size:14px">` +
        `<tr><td style="padding:2px 10px 2px 0;color:#64748b">Colaborador</td><td><strong>${escH(f.colaborador_nome)}</strong></td></tr>` +
        `<tr><td style="padding:2px 10px 2px 0;color:#64748b">Função</td><td>${escH(f.funcao || '-')}</td></tr>` +
        `<tr><td style="padding:2px 10px 2px 0;color:#64748b">Empresa</td><td>${escH(f.empresa || '-')}</td></tr>` +
        `<tr><td style="padding:2px 10px 2px 0;color:#64748b">Data</td><td>${escH(dataStr)}</td></tr>` +
        `</table>` +
        `<p style="color:#64748b">${pdfBuf ? 'O documento assinado segue em anexo.' : 'O PDF não foi gerado no envio; gere pelo sistema (módulo RH > Fichas).'}</p>` +
        `</div>`;
      const message = {
        message: {
          subject: `Ficha de ${tipoLabel} assinada - ${f.colaborador_nome}`,
          body: { contentType: 'HTML', content: html },
          toRecipients: [{ emailAddress: { address: FICHA_MAIL_TO } }],
          attachments: pdfBuf ? [{
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: `${baseNome}.pdf`,
            contentType: 'application/pdf',
            contentBytes: pdfBuf.toString('base64'),
          }] : [],
        },
        saveToSentItems: true,
      };
      const mr = await fetch(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(MAIL_SENDER)}/sendMail`,
        { method: 'POST', headers: { Authorization: `Bearer ${tkn}`, 'Content-Type': 'application/json' }, body: JSON.stringify(message) }
      );
      if (!mr.ok && mr.status !== 202) console.error('[assinar-ficha] sendMail', mr.status, await mr.text());
    } catch (e) { console.error('[assinar-ficha] email falhou:', e.message); }

    // 4) Marca como assinada — filtro status=pendente garante uso único
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
          status: 'assinada', assinatura_url: assUrl, selfie_url: selUrl, pdf_url: pdfUrl,
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
