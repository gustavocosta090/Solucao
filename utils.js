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

// ─── Tema ───────────────────────────────────────────────────────
function applyTheme(tema) {
  localStorage.setItem('tema', tema);
  document.documentElement.dataset.theme = tema;
  var icons  = { dark: '🌙', light: '☀️', auto: '🖥️' };
  var labels = { dark: 'Modo escuro', light: 'Modo claro', auto: 'Automático' };
  var btn = document.getElementById('tema-btn');
  if (btn) {
    btn.textContent = icons[tema];
    btn.title = labels[tema];
    btn.setAttribute('aria-label', labels[tema]);
  }
}

function ciclarTema() {
  applyTheme({ auto: 'dark', dark: 'light', light: 'auto' }[localStorage.getItem('tema') || 'auto']);
}

// Inicializar ícone do tema quando DOM estiver pronto
window.addEventListener('DOMContentLoaded', function() {
  applyTheme(localStorage.getItem('tema') || 'auto');
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

  var paleta = {
    success: { bg: 'rgba(62,207,142,0.13)',  border: 'rgba(62,207,142,0.4)',  color: '#3ECF8E', icon: '✓' },
    error:   { bg: 'rgba(239,68,68,0.13)',   border: 'rgba(239,68,68,0.4)',   color: '#F87171', icon: '✕' },
    warning: { bg: 'rgba(245,158,11,0.13)',  border: 'rgba(245,158,11,0.4)',  color: '#FCD34D', icon: '!' },
    info:    { bg: 'rgba(255,255,255,0.09)', border: 'rgba(255,255,255,0.18)',color: '#A1A1AA', icon: 'i' },
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
    'box-shadow:0 4px 16px rgba(0,0,0,0.4)',
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
    'background:rgba(0,0,0,0.65)',
    'display:flex', 'align-items:center', 'justify-content:center',
    'z-index:9998', 'padding:20px',
    'backdrop-filter:blur(4px)',
    '-webkit-backdrop-filter:blur(4px)',
  ].join(';'));

  overlay.innerHTML =
    '<div style="background:#161616;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:24px;max-width:400px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.6);">'
    + '<p id="cm-msg" style="font-size:14px;color:#FFFFFF;line-height:1.6;margin-bottom:20px;">' + escHtml(mensagem) + '</p>'
    + '<div style="display:flex;gap:8px;justify-content:flex-end;">'
    + '<button id="cm-cancelar" style="padding:8px 18px;background:transparent;border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:#A1A1AA;cursor:pointer;font-size:13px;font-weight:500;font-family:Inter,system-ui,sans-serif;">Cancelar</button>'
    + '<button id="cm-confirmar" style="padding:8px 18px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.25);border-radius:6px;color:#F87171;cursor:pointer;font-size:13px;font-weight:600;font-family:Inter,system-ui,sans-serif;">Confirmar</button>'
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
    '#nav-ham:hover{background:rgba(255,255,255,.09)}' +

    /* Overlay escuro atrás do drawer */
    '.mob-ov{display:none;position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,.72);' +
    'backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}' +
    '.mob-ov.open{display:flex;justify-content:flex-end}' +

    /* Drawer lateral deslizante da direita */
    '.mob-drawer{width:min(300px,86vw);height:100%;background:#111;' +
    'border-left:1px solid rgba(255,255,255,.08);display:flex;flex-direction:column;' +
    'overflow-y:auto;overscroll-behavior:contain;animation:_sdIn .22s ease}' +
    '@keyframes _sdIn{from{transform:translateX(100%)}to{transform:translateX(0)}}' +

    /* Cabeçalho do drawer */
    '.mob-dhead{display:flex;align-items:center;justify-content:space-between;' +
    'padding:20px 20px 16px;border-bottom:1px solid rgba(255,255,255,.07);flex-shrink:0}' +
    '.mob-dhead span{font-size:15px;font-weight:700;color:#fff;letter-spacing:-.2px}' +
    '.mob-dclose{background:none;border:none;color:rgba(255,255,255,.5);cursor:pointer;' +
    'padding:6px;border-radius:6px;font-size:22px;line-height:1;transition:background .15s,color .15s}' +
    '.mob-dclose:hover{color:#fff;background:rgba(255,255,255,.08)}' +

    /* Links de navegação dentro do drawer */
    '.mob-dnav{display:flex;flex-direction:column;padding:10px 0 32px;flex:1}' +
    '.mob-dnav a{display:block;padding:14px 24px;color:rgba(255,255,255,.65);text-decoration:none;' +
    'font-size:15px;font-weight:500;border-left:3px solid transparent;' +
    'transition:background .12s,color .12s,border-color .12s}' +
    '.mob-dnav a:hover{background:rgba(255,255,255,.05);color:#fff}' +
    '.mob-dnav a.active{color:#3ECF8E;border-left-color:#3ECF8E;background:rgba(62,207,142,.07);font-weight:600}' +
    '.mob-dnav a.nav-sair{color:rgba(239,68,68,.8);border-top:1px solid rgba(255,255,255,.06);' +
    'margin-top:10px;padding-top:16px}' +
    '.mob-dnav a.nav-sair:hover{color:#F87171;background:rgba(239,68,68,.07)}' +

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
  var primeiro = (nome || '').split(' ')[0];
  var greetEl = document.getElementById('topbar-greeting');
  if (greetEl && primeiro) greetEl.textContent = s + ', ' + primeiro;

  var links = [
    { href: 'obras.html',                label: 'Obras',                  id: 'obras',                roles: ['tecnico','auxiliar','supervisor','coordenador','agendamento','gerente_comercial','projetista','coordenador_projetos','vistoriador'] },
    { href: 'agenda.html',               label: 'Agenda Técnica',         id: 'agenda',               roles: ['supervisor','coordenador','agendamento','tecnico','auxiliar','gerente_comercial','projetista','coordenador_projetos'] },
    { href: 'agenda_plantao.html',       label: 'Agenda de Plantão',      id: 'agenda-plantao',       roles: ['supervisor','coordenador','agendamento','tecnico','auxiliar','gerente_comercial','projetista','coordenador_projetos'] },
    { href: 'agenda_vistorias.html',     label: 'Agenda de Vistorias',    id: 'agenda-vistorias',     roles: ['tecnico','auxiliar','supervisor','coordenador','agendamento','gerente_comercial','projetista','coordenador_projetos','vistoriador'] },
    { href: 'assistencia.html',          label: 'Assistências',           id: 'assistencia',          roles: ['agendamento','coordenador','supervisor'] },
    { href: 'vistoria.html',             label: 'Minhas Vistorias',       id: 'vistoria',             roles: ['vistoriador'] },
    { href: 'vistoria.html',             label: 'Relatórios de Vistoria', id: 'relatorios-vistoria',  roles: ['supervisor','coordenador','agendamento','coordenador_projetos','gerente_comercial'] },
    { href: 'os.html',                   label: 'Fazer OS',               id: 'os',                   roles: ['tecnico','auxiliar'] },
    { href: 'supervisor.html',           label: 'Supervisor',             id: 'supervisor',           roles: ['supervisor','coordenador','agendamento','coordenador_projetos'] },
    { href: 'pendencias.html',           label: 'Pendências',             id: 'pendencias',           roles: ['supervisor','coordenador','agendamento'] },
    { href: 'admin.html',                label: 'Admin',                  id: 'admin',                roles: ['coordenador'] },
    { href: 'tecnico_dashboard.html',    label: 'Minhas OSs',             id: 'minhas-os',            roles: ['tecnico','auxiliar'] },
    { href: 'gerente_comercial.html',    label: 'Comercial',              id: 'comercial',            roles: ['gerente_comercial'] },
    { href: 'projetista.html',           label: 'Meu Painel',             id: 'projetista',           roles: ['projetista'] },
    { href: 'coordenador_projetos.html', label: 'Projetos',               id: 'coordenador-projetos', roles: ['coordenador_projetos'] },
    { href: 'dashboard.html',            label: 'Painel Executivo',       id: 'dashboard',            roles: ['supervisor','coordenador','agendamento','gerente_comercial','coordenador_projetos','projetista','vistoriador'] },
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
