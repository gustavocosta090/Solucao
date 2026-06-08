// SAOS-AUDIT: build 2026-06-01 pós-auditoria
// utils.js — Solução Técnica, build 2026-06-01j
// Utilitários compartilhados. Carregado após @supabase/supabase-js via <script src="utils.js">.

// ─── Supabase client ────────────────────────────────────────────
const SUPABASE_URL = 'https://kxtjqudpnmdqkzqhyhmz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4dGpxdWRwbm1kcWt6cWh5aG16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NDYzMzEsImV4cCI6MjA5NTIyMjMzMX0.tba066RGNwDbXaNEy3w_OHbblll_bky6Dx10mXnxVQ0';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Redireciona para login quando a sessão expirar ou o usuário for deslogado
db.auth.onAuthStateChange(function(event, session) {
  if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
    var path = (location.pathname || '').split('/').pop() || '';
    if (path !== 'login.html' && path !== '') {
      window.location.href = 'login.html';
    }
  }
});

// Captura erros JS e promises não tratadas — loga estruturado e exibe toast amigável
function _logClientError(tipo, msg, detail) {
  var entry = { ts: new Date().toISOString(), tipo: tipo, msg: msg, detail: detail,
                page: location.pathname.split('/').pop() };
  console.error('[SAOS]', JSON.stringify(entry));
}

window.addEventListener('unhandledrejection', function(e) {
  var msg = (e.reason && e.reason.message) ? e.reason.message : String(e.reason || 'Erro desconhecido');
  _logClientError('unhandledrejection', msg, e.reason?.stack || null);
  // Não exibe toast para erros de rede comuns (evita spam durante reconexão)
  if (msg.includes('NetworkError') || msg.includes('Failed to fetch')) return;
  if (typeof showToast === 'function') showToast('Erro inesperado: ' + msg, 'error');
});

window.addEventListener('error', function(e) {
  _logClientError('uncaught', e.message, e.filename + ':' + e.lineno);
});

// ─── Escape HTML ────────────────────────────────────────────────
function escHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
const esc = escHtml; // alias usado em vistoria.html

// ─── Debounce ───────────────────────────────────────────────────
function debounce(fn, delay) {
  delay = delay !== undefined ? delay : 300;
  var t;
  return function() {
    var args = arguments;
    clearTimeout(t);
    t = setTimeout(function() { fn.apply(null, args); }, delay);
  };
}

// ─── Auto-refresh colaborativo ───────────────────────────────────
// Recarrega dados quando: tab volta ao foco (após 30s oculta) OU polling a cada N segundos
// Uso: iniciarAutoRefresh(carregarAgenda, 60000) — intervalo em ms (padrão 60s)
function iniciarAutoRefresh(callbackFn, intervaloMs) {
  intervaloMs = intervaloMs || 60000;
  var _ultimaAtt = Date.now();
  var _interval  = null;
  var _toast     = null;

  function _mostrarToastRefresh() {
    // Remove toast anterior se existir
    if (_toast && _toast.parentNode) _toast.parentNode.removeChild(_toast);
    _toast = document.createElement('div');
    _toast.style.cssText = [
      'position:fixed','bottom:72px','left:50%','transform:translateX(-50%)',
      'background:var(--surface-1)','border:1px solid var(--border-strong)',
      'color:var(--primary)','font-size:12px','font-weight:600','font-family:Inter,system-ui,sans-serif',
      'padding:7px 16px','border-radius:20px','z-index:9990','pointer-events:none',
      'display:flex','align-items:center','gap:8px','white-space:nowrap',
      'box-shadow:var(--shadow-soft,0 4px 16px rgba(0,0,0,0.25))',
    ].join(';');
    _toast.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation:spin .7s linear infinite"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.18-4.56"/></svg> Atualizando...';
    document.body.appendChild(_toast);
    setTimeout(function(){ if(_toast&&_toast.parentNode) _toast.parentNode.removeChild(_toast); }, 2000);
  }

  function _refresh() {
    _ultimaAtt = Date.now();
    _mostrarToastRefresh();
    try { callbackFn(); } catch(e) { console.warn('[autoRefresh]', e.message); }
  }

  // Page Visibility: atualiza ao voltar para a aba (se ficou > 30s oculta)
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible' && Date.now() - _ultimaAtt > 30000) {
      _refresh();
    }
  });

  // Window focus: atualiza ao focar a janela (se ficou > 30s sem foco)
  window.addEventListener('focus', function() {
    if (Date.now() - _ultimaAtt > 30000) {
      _refresh();
    }
  });

  // Polling como fallback
  _interval = setInterval(function() {
    if (document.visibilityState === 'visible') {
      callbackFn();
      _ultimaAtt = Date.now();
    }
  }, intervaloMs);

  // Retorna função para parar se necessário
  return function() {
    clearInterval(_interval);
    document.removeEventListener('visibilitychange', _refresh);
    window.removeEventListener('focus', _refresh);
  };
}

// ─── Tema: Legado (dark) ↔ Clássico (light/blue) ────────────────
(function _injetarCSSClassico() {
  if (document.getElementById('saos-classico-css')) return;
  var s = document.createElement('style');
  s.id = 'saos-classico-css';
  // Usa especificidade :root[data-tema="classico"] para vencer !important do app-shell.css
  s.textContent = [
    /* ── Variáveis raiz ── */
    ':root[data-tema="classico"]{',
    '--bg:#F3F6FA!important;--surface-1:#FFFFFF!important;--surface-2:#F8FAFC!important;--surface-3:#EEF3F8!important;',
    '--primary:#2563EB!important;--primary-hover:#1D4ED8!important;--primary-muted:rgba(37,99,235,0.1)!important;',
    '--secondary:#64748B!important;--success:#16A34A!important;--warning:#D97706!important;--danger:#DC2626!important;--info:#2563EB!important;',
    '--text-1:#0F172A!important;--text-2:#475569!important;--text-3:#7C8A9A!important;',
    '--border:rgba(15,23,42,0.10)!important;--border-strong:rgba(15,23,42,0.18)!important;--border-hover:rgba(15,23,42,0.26)!important;',
    '--border-focus:rgba(37,99,235,0.4)!important;',
    '--field-bg:#FFFFFF!important;--field-border:rgba(15,23,42,0.15)!important;--field-placeholder:#94A3B8!important;',
    '--row-bg:#FFFFFF!important;--row-hover:#F8FAFC!important;--overlay-bg:rgba(15,23,42,0.50)!important;--shadow-soft:0 14px 36px rgba(15,23,42,0.08)!important;',
    '}',
    /* ── Body e overlay ── */
    ':root[data-tema="classico"] body{background:#F3F6FA!important;}',
    ':root[data-tema="classico"] body::before{display:none!important;}',
    /* ── Sidebar clara (topbar vira coluna no app-shell) ── */
    ':root[data-tema="classico"] .topbar{background:#FFFFFF!important;border-right:1px solid rgba(0,0,0,0.08)!important;box-shadow:2px 0 16px rgba(0,0,0,0.06)!important;}',
    ':root[data-tema="classico"] .topbar-logo::before{filter:none!important;opacity:1!important;}',
    ':root[data-tema="classico"] .topbar-greeting{background:rgba(37,99,235,0.05)!important;border-color:rgba(37,99,235,0.15)!important;color:#334155!important;}',
    ':root[data-tema="classico"] .topbar-links a{color:#475569!important;background:transparent!important;border-color:transparent!important;}',
    ':root[data-tema="classico"] .topbar-links a:hover{color:#0F172A!important;background:rgba(0,0,0,0.04)!important;border-color:rgba(0,0,0,0.08)!important;}',
    ':root[data-tema="classico"] .topbar-links a.active{color:#1D4ED8!important;',
    'background:linear-gradient(135deg,rgba(37,99,235,0.1),rgba(37,99,235,0.04))!important;',
    'border-color:rgba(37,99,235,0.25)!important;box-shadow:inset 3px 0 0 #2563EB!important;}',
    ':root[data-tema="classico"] .topbar-links a.nav-sair{color:#DC2626!important;border-color:rgba(220,38,38,0.2)!important;background:rgba(220,38,38,0.05)!important;}',
    /* ── Cards agenda ── */
    ':root[data-tema="classico"] .card-ag{background:#FFFFFF!important;}',
    ':root[data-tema="classico"] .card-confirmado{background:rgba(37,99,235,0.05)!important;border-color:#2563EB!important;}',
    ':root[data-tema="classico"] .card-nao_confirmado{background:rgba(245,158,11,0.07)!important;border-color:#F59E0B!important;}',
    ':root[data-tema="classico"] .card-viagem{background:rgba(22,163,74,0.05)!important;border-color:#16A34A!important;}',
    ':root[data-tema="classico"] .ag-hora{color:#2563EB!important;}',
    ':root[data-tema="classico"] .ag-detalhes{border-top-color:rgba(0,0,0,0.1)!important;}',
    ':root[data-tema="classico"] .ag-label{color:#475569!important;}',
    ':root[data-tema="classico"] .ag-val{color:#64748B!important;}',
    ':root[data-tema="classico"] .tec-label{color:#2563EB!important;border-bottom-color:rgba(37,99,235,0.15)!important;}',
    /* ── Grade swim lanes ── */
    ':root[data-tema="classico"] .sh{background:#EAF0F6!important;border-bottom-color:rgba(15,23,42,0.1)!important;}',
    ':root[data-tema="classico"] .sc{background:#FFFFFF!important;border-color:rgba(0,0,0,0.06)!important;}',
    ':root[data-tema="classico"] .grade{border-color:rgba(0,0,0,0.1)!important;}',
    ':root[data-tema="classico"] .dia-data.hoje{color:#2563EB!important;}',
    ':root[data-tema="classico"] .badge-confirmado{background:rgba(37,99,235,0.12)!important;color:#1D4ED8!important;}',
    /* ── Scrollbar clássico ── */
    ':root[data-tema="classico"] *{scrollbar-color:rgba(37,99,235,0.3) transparent!important;}',
    /* ── Botões da agenda — paleta unificada azul ── */
    /* Filtro equipe ativo */
    ':root[data-tema="classico"] .filtro-btn{color:#475569!important;border-color:rgba(0,0,0,0.12)!important;}',
    ':root[data-tema="classico"] .filtro-btn:hover{color:#0F172A!important;border-color:rgba(0,0,0,0.2)!important;}',
    ':root[data-tema="classico"] .filtro-btn.ativo{background:rgba(37,99,235,0.1)!important;border-color:rgba(37,99,235,0.35)!important;color:#1D4ED8!important;}',
    /* Exportar SharePoint */
    ':root[data-tema="classico"] .btn-exportar-sp{background:rgba(37,99,235,0.07)!important;border-color:rgba(37,99,235,0.25)!important;color:#2563EB!important;}',
    ':root[data-tema="classico"] .btn-exportar-sp:hover{background:rgba(37,99,235,0.14)!important;border-color:rgba(37,99,235,0.45)!important;}',
    /* Disponibilidades */
    ':root[data-tema="classico"] .btn-disp{background:rgba(37,99,235,0.07)!important;border-color:rgba(37,99,235,0.25)!important;color:#2563EB!important;}',
    ':root[data-tema="classico"] .btn-disp:hover{background:rgba(37,99,235,0.14)!important;border-color:rgba(37,99,235,0.45)!important;}',
    /* Prog. Semanal — mantém roxo mas mais suave */
    ':root[data-tema="classico"] .btn-semana-tec{background:rgba(109,40,217,0.07)!important;border-color:rgba(109,40,217,0.25)!important;color:#6D28D9!important;}',
    ':root[data-tema="classico"] .btn-semana-tec:hover{background:rgba(109,40,217,0.13)!important;border-color:rgba(109,40,217,0.45)!important;}',
    /* Disparar dia — WhatsApp verde, mantém */
    ':root[data-tema="classico"] .btn-whatsapp{background:rgba(37,211,102,0.07)!important;border-color:rgba(37,211,102,0.28)!important;color:#16A34A!important;}',
    ':root[data-tema="classico"] .btn-whatsapp:hover{background:rgba(37,211,102,0.14)!important;border-color:rgba(37,211,102,0.48)!important;}',
    /* Prog. Estoque — laranja suave */
    ':root[data-tema="classico"] #btn-estoque{background:rgba(234,88,12,0.07)!important;border-color:rgba(234,88,12,0.25)!important;color:#C2410C!important;}',
    ':root[data-tema="classico"] #btn-estoque:hover{background:rgba(234,88,12,0.13)!important;}',
    /* Bloqueios — vermelho suave */
    ':root[data-tema="classico"] .btn-bloqueio{background:rgba(220,38,38,0.07)!important;border-color:rgba(220,38,38,0.25)!important;color:#DC2626!important;}',
    ':root[data-tema="classico"] .btn-bloqueio:hover{background:rgba(220,38,38,0.13)!important;border-color:rgba(220,38,38,0.45)!important;}',
    /* Novo agendamento — azul sólido (usa --primary já sobrescrito) */
    ':root[data-tema="classico"] .btn-novo{background:#2563EB!important;color:#FFFFFF!important;}',
    /* Date picker — claro */
    ':root[data-tema="classico"] .input-data-dispatch{background:#FFFFFF!important;border-color:rgba(0,0,0,0.15)!important;color:#0F172A!important;}',
    ':root[data-tema="classico"] .input-data-dispatch::-webkit-calendar-picker-indicator{filter:none!important;}',
    /* Icones dos headers da grade — escuros */
    ':root[data-tema="classico"] .btn-lock,.btn-nota,.btn-add,.btn-dispatch-dia{color:#64748B!important;}',
    /* ── Correções globais do tema claro ── */
    ':root[data-tema="classico"] input,:root[data-tema="classico"] select,:root[data-tema="classico"] textarea{background:#FFFFFF!important;border-color:rgba(15,23,42,0.15)!important;color:#0F172A!important;box-shadow:0 1px 2px rgba(15,23,42,0.04)!important;}',
    ':root[data-tema="classico"] input::placeholder,:root[data-tema="classico"] textarea::placeholder{color:#94A3B8!important;}',
    ':root[data-tema="classico"] input:focus,:root[data-tema="classico"] select:focus,:root[data-tema="classico"] textarea:focus{border-color:rgba(37,99,235,0.42)!important;box-shadow:0 0 0 3px rgba(37,99,235,0.10),0 1px 2px rgba(15,23,42,0.04)!important;}',
    ':root[data-tema="classico"] .card,:root[data-tema="classico"] .modal,:root[data-tema="classico"] .panel,:root[data-tema="classico"] .table-card,:root[data-tema="classico"] .filters-card,:root[data-tema="classico"] .lista-grid,:root[data-tema="classico"] .table-container{background:#FFFFFF!important;border-color:rgba(15,23,42,0.10)!important;box-shadow:0 14px 36px rgba(15,23,42,0.08)!important;}',
    ':root[data-tema="classico"] tbody tr{background:#FFFFFF!important;}',
    ':root[data-tema="classico"] tbody tr:hover{background:#F8FAFC!important;}',
    ':root[data-tema="classico"] tbody td{border-color:rgba(15,23,42,0.08)!important;}',
    ':root[data-tema="classico"] .btn-primary,:root[data-tema="classico"] .btn-salvar,:root[data-tema="classico"] .btn-login,:root[data-tema="classico"] button[type="submit"]{background:#2563EB!important;color:#FFFFFF!important;box-shadow:0 10px 22px rgba(37,99,235,0.16)!important;}',
    ':root[data-tema="classico"] .btn-secondary,:root[data-tema="classico"] .btn-exportar,:root[data-tema="classico"] .btn-ver,:root[data-tema="classico"] .chip,:root[data-tema="classico"] .tab-btn{background:#FFFFFF!important;color:#475569!important;border-color:rgba(15,23,42,0.10)!important;}',
    ':root[data-tema="classico"] .overlay,:root[data-tema="classico"] .modal-overlay{background:rgba(15,23,42,0.50)!important;}',

    /* ── Botão toggle ── */
    '.btn-tema-toggle{display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,0.06);border:1px solid rgba(221,232,240,0.14);border-radius:20px;padding:4px 12px;font-size:11px;font-weight:700;color:#BAC4CC;cursor:pointer;font-family:inherit;transition:background .15s,color .15s,border-color .15s;white-space:nowrap;letter-spacing:0;}',
    '.btn-tema-toggle:hover{background:rgba(255,255,255,0.10);border-color:rgba(221,232,240,0.22);color:#fff;}',
    ':root[data-tema="classico"] .btn-tema-toggle{background:rgba(37,99,235,0.1);border-color:rgba(37,99,235,0.28);color:#2563EB;}',
    ':root[data-tema="classico"] .btn-tema-toggle:hover{background:rgba(37,99,235,0.18);}',
  ].join('');
  document.head.appendChild(s);
})();

function applyTheme() {
  var tema = localStorage.getItem('saos-tema') || 'legado';
  document.documentElement.dataset.tema = tema;
  // mantém data-theme=dark para compatibilidade de variáveis nos HTMLs individuais
  document.documentElement.dataset.theme = tema === 'classico' ? 'light' : 'dark';
}

function toggleTema() {
  var atual = localStorage.getItem('saos-tema') || 'legado';
  var novo  = atual === 'legado' ? 'classico' : 'legado';
  localStorage.setItem('saos-tema', novo);
  applyTheme();
  // Atualiza label do botão
  var btns = document.querySelectorAll('.btn-tema-toggle');
  btns.forEach(function(btn) { btn.textContent = novo === 'classico' ? 'Clássico › Legado' : 'Legado › Clássico'; });
}

function ciclarTema() { toggleTema(); }

window.addEventListener('DOMContentLoaded', function() {
  applyTheme();
  initAppShell();
});

function initAppShell() {
  var path = (location.pathname || '').split('/').pop() || '';
  if (path === 'login.html' || document.querySelector('.login-card')) {
    document.body.classList.add('login-modernized');
  }

  document.querySelectorAll('.topbar-logo').forEach(function(el) {
    el.setAttribute('aria-label', 'Solução Técnica');
  });

  if (!document.querySelector('meta[name="theme-color"]')) {
    var meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#0A0A0A';
    document.head.appendChild(meta);
  }
}

// ─── Toast ──────────────────────────────────────────────────────
function showToast(mensagem, tipo, duracao) {
  tipo    = tipo    || 'info';
  duracao = duracao || 3500;

  var container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    // role="status" announces politely; role="alert" overrides for errors
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'false');
    container.setAttribute('style', [
      'position:fixed', 'bottom:24px', 'right:24px',
      'display:flex', 'flex-direction:column-reverse', 'gap:8px',
      'z-index:9999', 'pointer-events:none', 'max-width:360px',
    ].join(';'));
    document.body.appendChild(container);
  }
  // Errors warrant assertive announcement
  container.setAttribute('aria-live', tipo === 'error' ? 'assertive' : 'polite');

  var temaClaro = document.documentElement.dataset.tema === 'classico'
    || document.documentElement.dataset.theme === 'light';
  var paleta = temaClaro ? {
    success: { bg: '#ECFDF3', border: '#BBF7D0', color: '#166534', icon: '✓' },
    error:   { bg: '#FEF2F2', border: '#FECACA', color: '#B91C1C', icon: '✕' },
    warning: { bg: '#FFFBEB', border: '#FDE68A', color: '#92400E', icon: '!' },
    info:    { bg: '#EFF6FF', border: '#BFDBFE', color: '#1D4ED8', icon: 'i' },
  } : {
    success: { bg: 'rgba(56,213,143,0.13)', border: 'rgba(56,213,143,0.38)', color: '#38D58F', icon: '✓' },
    error:   { bg: 'rgba(255,107,107,0.13)', border: 'rgba(255,107,107,0.38)', color: '#FF8A8A', icon: '✕' },
    warning: { bg: 'rgba(245,184,65,0.13)', border: 'rgba(245,184,65,0.38)', color: '#F5B841', icon: '!' },
    info:    { bg: 'rgba(124,140,255,0.13)', border: 'rgba(124,140,255,0.30)', color: '#A8B2FF', icon: 'i' },
  };
  var c = paleta[tipo] || paleta.info;

  var toast = document.createElement('div');
  toast.setAttribute('style', [
    'background:'      + c.bg,
    'border:1px solid '+ c.border,
    'color:'           + c.color,
    'padding:10px 16px',
    'border-radius:8px',
    'font-size:13px',
    'font-weight:500',
    'font-family:Inter,system-ui,sans-serif',
    'backdrop-filter:blur(8px)',
    '-webkit-backdrop-filter:blur(8px)',
    'pointer-events:auto',
    'line-height:1.4',
    'display:flex',
    'align-items:flex-start',
    'gap:8px',
    'box-shadow:' + (temaClaro ? '0 12px 28px rgba(15,23,42,0.12)' : '0 12px 28px rgba(0,0,0,0.38)'),
    'opacity:0',
    'transform:translateY(8px)',
    'transition:opacity 0.2s,transform 0.2s',
    'cursor:pointer',
  ].join(';'));

  toast.innerHTML = '<span style="font-weight:700;flex-shrink:0;">' + c.icon + '</span>'
    + '<span>' + escHtml(mensagem) + '</span>';

  container.appendChild(toast);

  // Animar entrada
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });
  });

  function remover() {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 220);
  }

  var timer = setTimeout(remover, duracao);
  toast.addEventListener('click', function() { clearTimeout(timer); remover(); });
}

// ─── Modal de alerta (substitui alert() nativo) ─────────────────
function alertModal(titulo, mensagem, tipo) {
  tipo = tipo || 'aviso';
  var ICONE = { info:'ℹ️', aviso:'⚠️', erro:'🚫', sucesso:'✅' };
  var temaClaro = document.documentElement.dataset.tema === 'classico'
    || document.documentElement.dataset.theme === 'light';
  var COR = temaClaro ? {
    info:   { borda:'#BFDBFE', bg:'#EFF6FF', txt:'#1D4ED8' },
    aviso:  { borda:'#FDE68A', bg:'#FFFBEB', txt:'#92400E' },
    erro:   { borda:'#FECACA', bg:'#FEF2F2', txt:'#B91C1C' },
    sucesso:{ borda:'#BBF7D0', bg:'#ECFDF3', txt:'#166534' },
  } : {
    info:   { borda:'rgba(124,140,255,.3)', bg:'rgba(124,140,255,.1)', txt:'#A8B2FF' },
    aviso:  { borda:'rgba(245,184,65,.3)', bg:'rgba(245,184,65,.1)', txt:'#F5B841' },
    erro:   { borda:'rgba(255,107,107,.3)', bg:'rgba(255,107,107,.1)', txt:'#FF8A8A' },
    sucesso:{ borda:'rgba(56,213,143,.3)', bg:'rgba(56,213,143,.1)', txt:'#38D58F' },
  };
  var c = COR[tipo] || COR.aviso;
  return new Promise(function(resolve) {
    var existing = document.getElementById('alert-modal-overlay');
    if (existing) existing.remove();
    var overlay = document.createElement('div');
    overlay.id = 'alert-modal-overlay';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('style', [
      'position:fixed','inset:0',
      'background:var(--overlay-bg,rgba(0,0,0,0.72))',
      'display:flex','align-items:center','justify-content:center',
      'z-index:9999','padding:20px',
      'backdrop-filter:blur(6px)','-webkit-backdrop-filter:blur(6px)',
    ].join(';'));
    overlay.innerHTML =
      '<div style="background:var(--surface-1);border:1px solid var(--border-strong);border-radius:14px;padding:28px;max-width:420px;width:100%;box-shadow:var(--shadow-soft,0 24px 64px rgba(0,0,0,0.35));">'
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">'
      + '<span style="font-size:22px;line-height:1">' + (ICONE[tipo]||ICONE.aviso) + '</span>'
      + '<h3 style="font-size:15px;font-weight:700;color:var(--text-1);margin:0">' + escHtml(titulo) + '</h3>'
      + '</div>'
      + '<p style="font-size:13px;color:var(--text-2);margin:0 0 22px;line-height:1.65;white-space:pre-line">' + escHtml(mensagem) + '</p>'
      + '<div style="display:flex;justify-content:flex-end">'
      + '<button id="am-ok" style="padding:9px 28px;background:'+c.bg+';border:1px solid '+c.borda+';border-radius:7px;color:'+c.txt+';cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;">OK</button>'
      + '</div></div>';
    document.body.appendChild(overlay);
    var btn = overlay.querySelector('#am-ok');
    setTimeout(function(){ if(btn) btn.focus(); }, 0);
    function fechar() { overlay.remove(); resolve(); }
    btn.addEventListener('click', fechar);
    overlay.addEventListener('keydown', function(e){ if(e.key==='Escape'||e.key==='Enter') fechar(); });
  });
}

// ─── Modal de confirmação ────────────────────────────────────────
function confirmModal(mensagem, onConfirm, onCancel) {
  var existing = document.getElementById('confirm-modal-overlay');
  if (existing) existing.parentNode.removeChild(existing);

  var overlay = document.createElement('div');
  overlay.id = 'confirm-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'cm-msg');
  overlay.setAttribute('style', [
    'position:fixed', 'inset:0',
    'background:var(--overlay-bg,rgba(0,0,0,0.65))',
    'display:flex', 'align-items:center', 'justify-content:center',
    'z-index:9998', 'padding:20px',
    'backdrop-filter:blur(4px)',
    '-webkit-backdrop-filter:blur(4px)',
  ].join(';'));

  overlay.innerHTML =
    '<div style="background:var(--surface-1);border:1px solid var(--border-strong);border-radius:12px;padding:24px;max-width:400px;width:100%;box-shadow:var(--shadow-soft,0 20px 60px rgba(0,0,0,0.35));">'
    + '<p id="cm-msg" style="font-size:14px;color:var(--text-1);line-height:1.6;margin-bottom:20px;">' + escHtml(mensagem) + '</p>'
    + '<div style="display:flex;gap:8px;justify-content:flex-end;">'
    + '<button id="cm-cancelar" style="padding:8px 18px;background:transparent;border:1px solid var(--border-strong);border-radius:6px;color:var(--text-2);cursor:pointer;font-size:13px;font-weight:500;font-family:Inter,system-ui,sans-serif;">Cancelar</button>'
    + '<button id="cm-confirmar" style="padding:8px 18px;background:color-mix(in srgb,var(--danger,#EF4444) 12%,transparent);border:1px solid color-mix(in srgb,var(--danger,#EF4444) 28%,transparent);border-radius:6px;color:var(--danger,#EF4444);cursor:pointer;font-size:13px;font-weight:600;font-family:Inter,system-ui,sans-serif;">Confirmar</button>'
    + '</div></div>';

  document.body.appendChild(overlay);

  // Move foco para o botão Cancelar (opção segura por padrão)
  var prevFocus = document.activeElement;
  var btnCancelar = overlay.querySelector('#cm-cancelar');
  setTimeout(function() { if (btnCancelar) btnCancelar.focus(); }, 0);

  function fechar() {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    // Devolve foco ao elemento que o tinha antes
    if (prevFocus && prevFocus.focus) prevFocus.focus();
  }

  overlay.querySelector('#cm-cancelar').addEventListener('click', function() {
    fechar();
    if (typeof onCancel === 'function') onCancel();
  });

  overlay.querySelector('#cm-confirmar').addEventListener('click', function() {
    fechar();
    if (typeof onConfirm === 'function') onConfirm();
  });

  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) {
      fechar();
      if (typeof onCancel === 'function') onCancel();
    }
  });

  // Fechar com Escape
  function onKey(e) {
    if (e.key === 'Escape') {
      document.removeEventListener('keydown', onKey);
      fechar();
      if (typeof onCancel === 'function') onCancel();
    }
  }
  document.addEventListener('keydown', onKey);
}

// ─── Estado de carregamento de botão ────────────────────────────
function setLoading(btn, loading, textoSalvo) {
  if (loading) {
    btn.disabled = true;
    btn.dataset.textoOriginal = textoSalvo || btn.innerHTML;
    btn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:6px;">'
      + '<span style="width:12px;height:12px;border:2px solid rgba(0,0,0,0.25);border-top-color:currentColor;border-radius:50%;animation:spin 0.65s linear infinite;display:inline-block;flex-shrink:0;"></span>'
      + 'Salvando…</span>';
  } else {
    btn.disabled = false;
    btn.innerHTML = textoSalvo || btn.dataset.textoOriginal || 'Salvar';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

// ─── Mobile nav — hambúrguer + drawer ───────────────────────────
function _injetarCSSMob() {
  if (document.getElementById('saos-mob-css')) return;
  var s = document.createElement('style');
  s.id = 'saos-mob-css';
  s.textContent =
    /* Botão hambúrguer — fica à direita na topbar, só aparece no mobile */
    '#nav-ham{display:none;background:none;border:none;color:var(--text-1,#fff);cursor:pointer;' +
    'padding:9px;border-radius:8px;flex-shrink:0;margin-left:auto;transition:background .15s;line-height:0}' +
    '#nav-ham:hover{background:color-mix(in srgb,var(--text-1) 8%,transparent)}' +

    /* Overlay escuro atrás do drawer */
    '.mob-ov{display:none;position:fixed;inset:0;z-index:9990;background:var(--overlay-bg,rgba(0,0,0,.72));' +
    'backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}' +
    '.mob-ov.open{display:flex;justify-content:flex-end}' +

    /* Drawer lateral deslizante da direita */
    '.mob-drawer{width:min(300px,86vw);height:100%;background:var(--surface-1);' +
    'border-left:1px solid var(--border);display:flex;flex-direction:column;' +
    'overflow-y:auto;overscroll-behavior:contain;animation:_sdIn .22s ease}' +
    '@keyframes _sdIn{from{transform:translateX(100%)}to{transform:translateX(0)}}' +

    /* Cabeçalho do drawer */
    '.mob-dhead{display:flex;align-items:center;justify-content:space-between;' +
    'padding:20px 20px 16px;border-bottom:1px solid var(--border);flex-shrink:0}' +
    '.mob-dhead span{font-size:15px;font-weight:700;color:var(--text-1);letter-spacing:0}' +
    '.mob-dclose{background:none;border:none;color:var(--text-3);cursor:pointer;' +
    'padding:6px;border-radius:6px;font-size:22px;line-height:1;transition:background .15s,color .15s}' +
    '.mob-dclose:hover{color:var(--text-1);background:color-mix(in srgb,var(--text-1) 8%,transparent)}' +

    /* Links de navegação dentro do drawer */
    '.mob-dnav{display:flex;flex-direction:column;padding:10px 0 32px;flex:1}' +
    '.mob-dnav a{display:block;padding:14px 24px;color:var(--text-2);text-decoration:none;' +
    'font-size:15px;font-weight:500;border-left:3px solid transparent;' +
    'transition:background .12s,color .12s,border-color .12s}' +
    '.mob-dnav a:hover{background:color-mix(in srgb,var(--text-1) 6%,transparent);color:var(--text-1)}' +
    '.mob-dnav a.active{color:var(--primary);border-left-color:var(--primary);background:var(--primary-muted);font-weight:600}' +
    '.mob-dnav a.nav-sair{color:var(--danger,#EF4444);border-top:1px solid var(--border);' +
    'margin-top:10px;padding-top:16px}' +
    '.mob-dnav a.nav-sair:hover{color:var(--danger,#EF4444);background:color-mix(in srgb,var(--danger,#EF4444) 9%,transparent)}' +

    /* Ativa hambúrguer e esconde a nav no breakpoint do app-shell (860px) */
    '@media(max-width:860px){' +
    '#nav-ham{display:inline-flex!important;align-items:center;justify-content:center}' +
    '.topbar-links{display:none!important}' +
    '}';
  document.head.appendChild(s);
}

function _abrirMobNav() {
  var ov = document.getElementById('mob-nav-ov');
  if (!ov) return;
  ov.classList.add('open');
  document.getElementById('nav-ham') && document.getElementById('nav-ham').setAttribute('aria-expanded','true');
  document.body.style.overflow = 'hidden';
}

function _fecharMobNav() {
  var ov = document.getElementById('mob-nav-ov');
  if (!ov) return;
  ov.classList.remove('open');
  document.getElementById('nav-ham') && document.getElementById('nav-ham').setAttribute('aria-expanded','false');
  document.body.style.overflow = '';
}

// ─── Topbar universal ───────────────────────────────────────────
function renderTopbar(nome, role, paginaAtiva) {
  var h = new Date().getHours();
  var s = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  var greetEl = document.getElementById('topbar-greeting');
  if (greetEl && nome) {
    var temaAtual = localStorage.getItem('saos-tema') || 'legado';
    var labelBtn  = temaAtual === 'classico' ? 'Clássico › Legado' : 'Legado › Clássico';
    greetEl.innerHTML =
      '<span>' + (s + ', ' + nome) + '</span>' +
      '<button class="btn-tema-toggle" onclick="toggleTema()" style="margin-left:10px;">' + labelBtn + '</button>';
  }

  // 'agendamento' tem as mesmas permissões que 'coordenador'
  var links = [
    { href: 'obras.html',                label: 'Obras',                  id: 'obras',                roles: ['tecnico','auxiliar','supervisor','coordenador','agendamento','gerente_comercial','projetista','coordenador_projetos','vistoriador','lider','estoque'] },
    { href: 'agenda.html',               label: 'Agenda Técnica',         id: 'agenda',               roles: ['supervisor','coordenador','agendamento','tecnico','auxiliar','gerente_comercial','projetista','coordenador_projetos','lider','estoque'] },
    { href: 'agenda_plantao.html',       label: 'Agenda de Plantão',      id: 'agenda-plantao',       roles: ['supervisor','coordenador','agendamento','tecnico','auxiliar','gerente_comercial','projetista','coordenador_projetos','lider'] },
    { href: 'agenda_vistorias.html',     label: 'Agenda de Vistorias',    id: 'agenda-vistorias',     roles: ['tecnico','auxiliar','supervisor','coordenador','agendamento','gerente_comercial','projetista','coordenador_projetos','vistoriador','lider'] },
    { href: 'assistencia.html',          label: 'Assistências',           id: 'assistencia',          roles: ['agendamento','supervisor','coordenador','lider'] },
    { href: 'vistoria.html',             label: 'Minhas Vistorias',       id: 'vistoria',             roles: ['vistoriador'] },
    { href: 'vistoria.html',             label: 'Relatórios de Vistoria', id: 'relatorios-vistoria',  roles: [] },
    { href: 'os.html',                   label: 'Fazer OS',               id: 'os',                   roles: ['tecnico','auxiliar','lider'] },
    { href: 'supervisor.html',           label: 'Supervisor',             id: 'supervisor',           roles: ['supervisor','coordenador','agendamento','coordenador_projetos','lider'] },
    { href: 'pendencias.html',           label: 'Pendências',             id: 'pendencias',           roles: ['supervisor','coordenador','agendamento','lider'] },
    { href: 'viagens.html',              label: 'Viagens',                id: 'viagens',              roles: ['supervisor','coordenador','agendamento','lider'] },
    { href: 'solicitacoes.html',         label: 'Solicitações',           id: 'solicitacoes',         roles: ['coordenador','agendamento'] },
    { href: 'admin.html',                label: 'Admin',                  id: 'admin',                roles: ['coordenador','agendamento'] },
    { href: 'tecnico_dashboard.html',    label: 'Minhas OSs',             id: 'minhas-os',            roles: ['tecnico','auxiliar','lider'] },
    { href: 'gerente_comercial.html',    label: 'Comercial',              id: 'comercial',            roles: ['gerente_comercial'] },
    { href: 'projetista.html',           label: 'Meu Painel',             id: 'projetista',           roles: ['projetista'] },
    { href: 'coordenador_projetos.html', label: 'Projetos',               id: 'coordenador-projetos', roles: ['coordenador_projetos'] },
    { href: 'dashboard.html',            label: 'Painel Executivo',       id: 'dashboard',            roles: ['supervisor','coordenador','agendamento','gerente_comercial','coordenador_projetos','projetista','vistoriador','lider','estoque'] },
  ];

  // ── Desktop nav ──
  var nav = document.getElementById('topbar-nav');
  if (!nav) return;
  nav.setAttribute('aria-label', 'Navegação principal');

  var linksVisiveis = links.filter(function(l) { return l.roles.indexOf(role) !== -1; });
  var linksHtml = linksVisiveis.map(function(l) {
    var ativo = l.id === paginaAtiva;
    return '<a href="' + l.href + '"'
      + (ativo ? ' class="active" aria-current="page"' : '')
      + '>' + l.label + '</a>';
  }).join('') + '<a href="#" class="nav-sair" onclick="logout()" aria-label="Sair da conta">Sair</a>';

  nav.innerHTML = linksHtml;

  // ── Mobile: injetar CSS + botão hambúrguer + drawer ──
  _injetarCSSMob();

  // Botão hambúrguer — adiciona uma vez na topbar
  if (!document.getElementById('nav-ham')) {
    var ham = document.createElement('button');
    ham.id = 'nav-ham';
    ham.setAttribute('aria-label', 'Abrir menu');
    ham.setAttribute('aria-expanded', 'false');
    ham.setAttribute('aria-haspopup', 'dialog');
    ham.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
      '<line x1="3" y1="6" x2="21" y2="6"/>' +
      '<line x1="3" y1="12" x2="21" y2="12"/>' +
      '<line x1="3" y1="18" x2="21" y2="18"/>' +
      '</svg>';
    ham.addEventListener('click', _abrirMobNav);
    var tb = document.querySelector('.topbar');
    if (tb) tb.appendChild(ham);
  }

  // Drawer — recria sempre para atualizar os links após login
  var existOv = document.getElementById('mob-nav-ov');
  if (existOv) existOv.parentNode.removeChild(existOv);

  var ov = document.createElement('div');
  ov.id = 'mob-nav-ov';
  ov.className = 'mob-ov';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.setAttribute('aria-label', 'Menu de navegação');

  ov.innerHTML =
    '<div class="mob-drawer">' +
    '<div class="mob-dhead">' +
    '<span>Solução Técnica</span>' +
    '<button class="mob-dclose" onclick="_fecharMobNav()" aria-label="Fechar menu">✕</button>' +
    '</div>' +
    '<nav class="mob-dnav" aria-label="Menu principal">' +
    linksHtml.replace(/class="nav-sair"/g, 'class="nav-sair"') +
    '</nav>' +
    '</div>';

  // Fecha ao clicar no backdrop
  ov.addEventListener('click', function(e) { if (e.target === ov) _fecharMobNav(); });

  document.body.appendChild(ov);

  // Fecha com Escape
  document.addEventListener('keydown', function(e) { if (e.key === 'Escape') _fecharMobNav(); });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ─── Query Cache ────────────────────────────────────────────────
// Armazena resultados em memória + sessionStorage com TTL.
// sessionStorage persiste durante a navegação entre páginas da mesma aba.
// Uso: const data = await cachedQuery('key', 300, () => db.from(...).then(r => r.data));
var _qCache = Object.create(null);
var _CACHE_PREFIX = 'saos_qc_';

async function cachedQuery(key, ttlSeconds, queryFn) {
  var now   = Date.now();
  var ttlMs = (ttlSeconds || 300) * 1000;

  // 1. Checar memória (mais rápido, zero parse)
  var mem = _qCache[key];
  if (mem && now < mem.expires) return mem.data;

  // 2. Checar sessionStorage (sobrevive a navegação entre páginas)
  try {
    var raw = sessionStorage.getItem(_CACHE_PREFIX + key);
    if (raw) {
      var entry = JSON.parse(raw);
      if (now < entry.expires) {
        _qCache[key] = entry; // reaquecer memória
        return entry.data;
      }
    }
  } catch(e) { /* quota ou parse error — ignora */ }

  // 3. Buscar do servidor
  var data = await queryFn();
  var obj  = { data: data, expires: now + ttlMs };
  _qCache[key] = obj;
  try { sessionStorage.setItem(_CACHE_PREFIX + key, JSON.stringify(obj)); } catch(e) {}
  return data;
}

// Invalida uma entrada específica do cache (ou todo o cache se key omitida).
function invalidateCache(key) {
  if (key) {
    delete _qCache[key];
    try { sessionStorage.removeItem(_CACHE_PREFIX + key); } catch(e) {}
  } else {
    _qCache = Object.create(null);
    try {
      Object.keys(sessionStorage)
        .filter(function(k) { return k.indexOf(_CACHE_PREFIX) === 0; })
        .forEach(function(k) { sessionStorage.removeItem(k); });
    } catch(e) {}
  }
}

// ─── Logout ─────────────────────────────────────────────────────
async function logout() {
  await db.auth.signOut();
  window.location.href = 'login.html';
}
