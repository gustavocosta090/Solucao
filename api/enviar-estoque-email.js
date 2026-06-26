// api/enviar-estoque-email.js — envia o PDF da Programação de Estoque por e-mail
// build: 2026-06-25a
// POST { contentBase64, filename, periodo } (Authorization: Bearer <sessão Supabase>)
// Destinatários vêm da env MS_ESTOQUE_MAIL_TO (separados por vírgula/;) — NUNCA do cliente.

import { getToken } from './_sharepoint.js';

const SUPABASE_URL = 'https://kxtjqudpnmdqkzqhyhmz.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4dGpxdWRwbm1kcWt6cWh5aG16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NDYzMzEsImV4cCI6MjA5NTIyMjMzMX0.tba066RGNwDbXaNEy3w_OHbblll_bky6Dx10mXnxVQ0';

const MAIL_SENDER    = process.env.MS_MAIL_SENDER    || 'agendatecnica@solucaotecnica.com.br';
const ESTOQUE_MAIL_TO = process.env.MS_ESTOQUE_MAIL_TO || ''; // 5 e-mails separados por vírgula/;

function escH(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

// Saudação conforme a hora do envio (fuso de Cuiabá)
function saudacao(){
  const h = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Cuiaba', hour: '2-digit', hour12: false }).format(new Date()), 10);
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

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

  const { contentBase64, filename, periodo } = req.body || {};
  if (!contentBase64 || !filename) return res.status(400).json({ error: 'contentBase64 e filename são obrigatórios' });

  const destinatarios = ESTOQUE_MAIL_TO.split(/[,;\s]+/).map(s => s.trim()).filter(s => s.includes('@'));
  if (!destinatarios.length) return res.status(500).json({ error: 'Configure a env MS_ESTOQUE_MAIL_TO com os e-mails (separados por vírgula).' });

  try {
    const user = await validarSessao(req);
    if (!user?.id) return res.status(401).json({ error: 'Sessão inválida ou expirada' });

    const buf = Buffer.from(contentBase64, 'base64');
    if (!buf.length)            return res.status(400).json({ error: 'PDF inválido' });
    if (buf.length > 3_500_000) return res.status(413).json({ error: 'PDF muito grande para anexo' });

    const tkn = await getToken();
    const per = periodo ? String(periodo) : '';
    const saud = saudacao();
    const html =
      `<div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a;line-height:1.55">` +
      `<p>${saud}, segue a programação de atendimento para a semana ${escH(per)}. Qualquer dúvida, estou à disposição.</p>` +
      `<p style="font-weight:bold">PROGRAMAÇÃO SUJEITA A ALTERAÇÕES. EM CASO DE ALTERAÇÕES, INFORMAREMOS VIA TEAMS E REENCAMINHAREMOS ESTE E-MAIL.</p>` +
      `<p>Obrigado.</p>` +
      `<div style="margin-top:26px;padding-top:12px;border-top:1px solid #e2e8f0">` +
        `<p style="margin:0;font-size:12px;color:#94a3b8">Enviado automaticamente via ` +
        `<span style="color:#16a34a;font-weight:bold;letter-spacing:.6px">SAOS</span>` +
        ` &middot; <span style="color:#64748b">Sistema de Agendas e Ordens de Serviço</span></p>` +
      `</div></div>`;

    const message = {
      message: {
        subject: `PROGRAMAÇÃO DE ATENDIMENTO PARA A SEMANA DE ${per}`,
        body: { contentType: 'HTML', content: html },
        toRecipients: destinatarios.map(address => ({ emailAddress: { address } })),
        attachments: [{
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: filename, contentType: 'application/pdf', contentBytes: contentBase64,
        }],
      },
      saveToSentItems: true,
    };

    const mr = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(MAIL_SENDER)}/sendMail`,
      { method: 'POST', headers: { Authorization: `Bearer ${tkn}`, 'Content-Type': 'application/json' }, body: JSON.stringify(message) });
    if (!mr.ok && mr.status !== 202) throw new Error('sendMail ' + mr.status + ': ' + await mr.text());

    return res.status(200).json({ ok: true, enviados: destinatarios.length });

  } catch (e) {
    console.error('[api/enviar-estoque-email]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
