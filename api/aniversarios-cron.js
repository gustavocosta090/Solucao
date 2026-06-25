// api/aniversarios-cron.js — aviso automático de aniversariantes (Vercel Cron)
// build: 2026-06-25b — fontes Roboto embarcadas (fonts/*.ttf); antes o fetch de CDN dava 404 e o texto sumia
// Roda 1x/dia às 5h de Cuiabá (schedule "0 9 * * *" UTC). Em cada execução:
//   - HOJE: gera o CARD oficial (arte + foto + nome/função/mensagem) e anexa por e-mail.
//           Sem foto => entra um AVISO no corpo (suba a foto no RH) em vez do card.
//   - AMANHÃ: envia só um e-mail de VÉSPERA avisando (sem card).
// Proteção: header Authorization: Bearer <CRON_SECRET> (a Vercel envia sozinho) ou ?token=<CRON_SECRET>.
// Teste manual: GET /api/aniversarios-cron?token=SEGREDO&dry=1  (mostra quem entraria, não envia)
//               &data=AAAA-MM-DD simula "hoje"; &only=hoje|amanha limita.

import { getToken, getSiteId } from './_sharepoint.js';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const maxDuration = 60;

const SUPABASE_URL = 'https://kxtjqudpnmdqkzqhyhmz.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4dGpxdWRwbm1kcWt6cWh5aG16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NDYzMzEsImV4cCI6MjA5NTIyMjMzMX0.tba066RGNwDbXaNEy3w_OHbblll_bky6Dx10mXnxVQ0';

const SITE_URL     = process.env.SITE_URL       || 'https://solucaotecnica.vercel.app';
const MAIL_SENDER  = process.env.MS_MAIL_SENDER  || 'agendatecnica@solucaotecnica.com.br';
const ANIV_MAIL_TO = process.env.MS_ANIV_MAIL_TO || 'gustavo.martins@solucaotecnica.com.br';
const MENSAGEM_PADRAO = 'Nós do Grupo Solução te desejamos um feliz aniversário! Que seu dia seja repleto de alegrias.';

// ── Helpers de texto ──────────────────────────────────────────────
function escH(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function nomeCurto(n){ const p=(n||'').trim().split(/\s+/).filter(Boolean); return p.length<=1?p.join(' '):p[0]+' '+p[p.length-1]; }
function iniciais(n){ const p=(n||'').trim().split(/\s+/); return ((p[0]||'')[0]||'?').toUpperCase()+((p[1]||'')[0]||'').toUpperCase(); }
function limparArq(n){ return String(n||'').replace(/[\\/:*?"<>|#%~]/g,' ').replace(/\s+/g,' ').trim().slice(0,60) || 'colaborador'; }

// dia/mês em America/Cuiaba com deslocamento de dias
function mdComOffset(offsetDays, baseISO){
  const base = baseISO ? new Date(baseISO + 'T12:00:00Z') : new Date();
  const d = new Date(base.getTime() + offsetDays*86400000);
  const s = d.toLocaleDateString('en-CA', { timeZone:'America/Cuiaba' }); // YYYY-MM-DD
  const [y,m,dia] = s.split('-').map(Number);
  return { m, d: dia, label: `${String(dia).padStart(2,'0')}/${String(m).padStart(2,'0')}` };
}
function anivMD(dataAniversario){ // "2000-MM-DD" -> {m,d}
  const m = String(dataAniversario||'').match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? { m:+m[1], d:+m[2] } : null;
}

// ── Fontes (Roboto) embarcadas no repo (fonts/*.ttf) ──────────────
// Registradas com alias "Roboto"; o peso (400/500/700) vem do OS/2 de cada arquivo.
// new URL(..., import.meta.url) faz a Vercel incluir os .ttf no bundle da função.
let _fontsReady = false;
function ensureFonts(){
  if (_fontsReady) return;
  for (const file of ['Roboto-Regular.ttf', 'Roboto-Medium.ttf', 'Roboto-Bold.ttf']) {
    try {
      const p = fileURLToPath(new URL('../fonts/' + file, import.meta.url));
      GlobalFonts.register(readFileSync(p), 'Roboto');
    } catch (e) { console.error('[aniv-cron] fonte', file, e.message); }
  }
  _fontsReady = true;
}

// ── Canvas helpers (porta de rh.html _cardAniversario) ────────────
function roundRect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
function fotoCover(ctx,img,x,y,w,h){ const s=Math.max(w/img.width,h/img.height); const dw=img.width*s,dh=img.height*s; ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh); }
function wrap(ctx,texto,x,y,maxW,lh){ const ps=String(texto).split(' '); let linha=''; for(const p of ps){ const t=linha?linha+' '+p:p; if(ctx.measureText(t).width>maxW && linha){ ctx.fillText(linha,x,y); linha=p; y+=lh; } else linha=t; } if(linha) ctx.fillText(linha,x,y); }

let _bgCache = null;
async function carregarArte(){
  if (_bgCache !== null) return _bgCache;
  try { const r = await fetch(`${SITE_URL}/card-aniversario.jpg`); if (r.ok) { _bgCache = await loadImage(Buffer.from(await r.arrayBuffer())); return _bgCache; } }
  catch (e) { console.error('[aniv-cron] arte falhou:', e.message); }
  _bgCache = null; return null;
}

// Baixa a foto do colaborador (foto_url = "/api/foto?path=...") direto do SharePoint
async function carregarFoto(fotoUrl, tkn, siteId){
  const m = String(fotoUrl||'').match(/[?&]path=([^&]+)/);
  if (!m) return null;
  const path = decodeURIComponent(m[1]);
  const enc = path.split('/').map(encodeURIComponent).join('/');
  try {
    const r = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${enc}:/content`,
      { headers: { Authorization: `Bearer ${tkn}` }, redirect: 'follow' });
    if (!r.ok) return null;
    return await loadImage(Buffer.from(await r.arrayBuffer()));
  } catch (e) { return null; }
}

async function gerarCard(colab, bg, tkn, siteId){
  const W = bg ? (bg.naturalWidth || bg.width || 1080) : 1080;
  const H = bg ? (bg.naturalHeight || bg.height || 1920) : 1920;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  if (bg) ctx.drawImage(bg, 0, 0, W, H);
  else { ctx.fillStyle = '#f2f2f2'; ctx.fillRect(0,0,W,H); }

  // Moldura branca + foto (retângulo arredondado), igual ao sistema
  const fw=0.545*W, fh=0.392*H, fx=(W-fw)/2, fy=0.242*H, frad=0.010*W, borda=0.018*W;
  ctx.save();
  ctx.shadowColor='rgba(0,0,0,0.22)'; ctx.shadowBlur=0.035*W; ctx.shadowOffsetY=0.012*W;
  ctx.fillStyle='#FFFFFF'; roundRect(ctx,fx,fy,fw,fh,frad); ctx.fill();
  ctx.restore();

  const px=fx+borda, py=fy+borda, pw=fw-2*borda, ph=fh-2*borda, pr=Math.max(0,frad-borda*0.5);
  ctx.save(); roundRect(ctx,px,py,pw,ph,pr); ctx.clip();
  const img = await carregarFoto(colab.foto_url, tkn, siteId);
  if (img) fotoCover(ctx,img,px,py,pw,ph);
  else { ctx.fillStyle='#2e4046'; ctx.fillRect(px,py,pw,ph); ctx.fillStyle='#7d9099'; ctx.font='800 120px Roboto'; ctx.textAlign='center'; ctx.fillText(iniciais(colab.nome||'?'),W/2,py+ph/2+42); }
  ctx.restore();

  ctx.textAlign='center';
  ctx.fillStyle='#2B2B2B'; ctx.font='700 '+Math.round(0.046*W)+'px Roboto';
  ctx.fillText(nomeCurto(colab.nome) || 'Colaborador', W/2, 0.695*H);
  if (colab.cargo){ ctx.fillStyle='#6b6b6b'; ctx.font='500 '+Math.round(0.030*W)+'px Roboto'; ctx.fillText(colab.cargo, W/2, 0.726*H); }
  ctx.fillStyle='#5a5a5a'; ctx.font='400 '+Math.round(0.027*W)+'px Roboto';
  wrap(ctx, MENSAGEM_PADRAO, W/2, 0.765*H, W*0.72, Math.round(0.037*W));

  return await canvas.encode('jpeg', 88); // JPEG p/ caber em e-mail (sendMail < 4MB)
}

// ── E-mail ────────────────────────────────────────────────────────
async function enviarEmail(tkn, subject, html, attachments){
  const message = {
    message: {
      subject,
      body: { contentType:'HTML', content: html },
      toRecipients: [{ emailAddress: { address: ANIV_MAIL_TO } }],
      attachments: (attachments||[]).map(a => ({
        '@odata.type':'#microsoft.graph.fileAttachment',
        name: a.name, contentType: a.contentType, contentBytes: a.buffer.toString('base64'),
      })),
    },
    saveToSentItems: true,
  };
  const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(MAIL_SENDER)}/sendMail`,
    { method:'POST', headers:{ Authorization:`Bearer ${tkn}`, 'Content-Type':'application/json' }, body: JSON.stringify(message) });
  if (!r.ok && r.status !== 202) throw new Error('sendMail '+r.status+': '+await r.text());
}

export default async function handler(req, res){
  // Auth: header (cron) ou ?token= (teste manual)
  const secret = process.env.CRON_SECRET || '';
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i,'').trim();
  const qToken = String(req.query.token || '').trim();
  if (!secret) return res.status(500).json({ error: 'Configure a env CRON_SECRET no Vercel.' });
  if (auth !== secret && qToken !== secret) return res.status(401).json({ error: 'não autorizado' });

  const dry  = String(req.query.dry || '') === '1';
  const only = String(req.query.only || '').toLowerCase();
  const baseISO = /^\d{4}-\d{2}-\d{2}$/.test(req.query.data || '') ? req.query.data : null;

  const hoje   = mdComOffset(0, baseISO);
  const amanha = mdComOffset(1, baseISO);

  try {
    // Busca colaboradores ativos com aniversário cadastrado
    const r = await fetch(`${SUPABASE_URL}/rest/v1/colaboradores?select=id,nome,cargo,empresa,foto_url,data_aniversario,ativo&data_aniversario=not.is.null`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } });
    if (!r.ok) return res.status(500).json({ error: 'Erro ao buscar colaboradores' });
    const todos = (await r.json()).filter(c => c.ativo !== false);

    const doDia = (alvo) => todos.filter(c => { const md = anivMD(c.data_aniversario); return md && md.m===alvo.m && md.d===alvo.d; });
    const listaHoje   = (only==='amanha') ? [] : doDia(hoje);
    const listaAmanha = (only==='hoje')   ? [] : doDia(amanha);

    if (dry) {
      return res.status(200).json({
        hoje: hoje.label, amanha: amanha.label,
        cards_hoje: listaHoje.map(c => ({ nome: c.nome, tem_foto: !!c.foto_url })),
        aviso_amanha: listaAmanha.map(c => ({ nome: c.nome })),
        destinatario: ANIV_MAIL_TO,
      });
    }

    const tkn = await getToken();
    const resultado = { enviou_dia: false, enviou_vespera: false, cards: 0, sem_foto: 0 };

    // 1) CARD DO DIA
    if (listaHoje.length) {
      ensureFonts();
      const bg = await carregarArte();
      const siteId = await getSiteId(tkn);
      const anexos = [];
      const semFoto = [];
      const comFoto = [];
      for (const c of listaHoje) {
        if (!c.foto_url) { semFoto.push(c); continue; }
        try {
          const buf = await gerarCard(c, bg, tkn, siteId);
          anexos.push({ name: `Card Aniversario ${limparArq(c.nome)} ${hoje.label.replace('/','-')}.jpg`, contentType:'image/jpeg', buffer: buf });
          comFoto.push(c);
        } catch (e) { console.error('[aniv-cron] card falhou', c.nome, e.message); semFoto.push(c); }
      }
      const linhas = [
        ...comFoto.map(c => `<li><strong>${escH(nomeCurto(c.nome))}</strong>${c.cargo?` — ${escH(c.cargo)}`:''} <span style="color:#16a34a">(card em anexo)</span></li>`),
        ...semFoto.map(c => `<li><strong>${escH(nomeCurto(c.nome))}</strong>${c.cargo?` — ${escH(c.cargo)}`:''} <span style="color:#dc2626">— SEM FOTO: suba a foto no RH para gerar o card</span></li>`),
      ].join('');
      const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a">
        <p>🎂 <strong>Aniversariante(s) de hoje (${escH(hoje.label)})</strong> — card(s) em anexo, prontos para enviar no grupo.</p>
        <ul>${linhas}</ul></div>`;
      await enviarEmail(tkn, `🎂 Aniversariante(s) de hoje — ${hoje.label}`, html, anexos);
      resultado.enviou_dia = true; resultado.cards = anexos.length; resultado.sem_foto = semFoto.length;
    }

    // 2) VÉSPERA (só aviso, sem card)
    if (listaAmanha.length) {
      const linhas = listaAmanha.map(c => `<li><strong>${escH(nomeCurto(c.nome))}</strong>${c.cargo?` — ${escH(c.cargo)}`:''}${c.foto_url?'':' <span style="color:#dc2626">(sem foto cadastrada)</span>'}</li>`).join('');
      const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a">
        <p>📅 <strong>Amanhã (${escH(amanha.label)}) faz aniversário:</strong></p>
        <ul>${linhas}</ul>
        <p style="color:#64748b">O card pronto chega amanhã de manhã. Quem estiver sem foto, aproveite para subir no RH.</p></div>`;
      await enviarEmail(tkn, `📅 Amanhã faz aniversário — ${amanha.label}`, html, []);
      resultado.enviou_vespera = true;
    }

    return res.status(200).json({ ok:true, hoje: hoje.label, amanha: amanha.label, ...resultado });

  } catch (e) {
    console.error('[api/aniversarios-cron]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
