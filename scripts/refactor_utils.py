#!/usr/bin/env python3
"""
refactor_utils.py
Fase 1 do refactoring: remove funções duplicadas de todos os HTMLs,
injeta <script src="utils.js">, simplifica o script inline de tema.
"""

import re, os

BASE  = '/Users/gustavomartins/Documents/Codex/2026-05-26/files-mentioned-by-the-user-os/os_corrigido'
BUILD = '2026-05-30k'
KEY   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4dGpxdWRwbm1kcWt6cWh5aG16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NDYzMzEsImV4cCI6MjA5NTIyMjMzMX0.tba066RGNwDbXaNEy3w_OHbblll_bky6Dx10mXnxVQ0'

# ─── helpers ────────────────────────────────────────────────────

def find_fn_end(txt, brace_open):
    """Return index of the matching closing brace, starting from brace_open."""
    depth = 0
    for i in range(brace_open, len(txt)):
        if txt[i] == '{':
            depth += 1
        elif txt[i] == '}':
            depth -= 1
            if depth == 0:
                return i
    return -1

def remove_fn(txt, sig_pattern):
    """
    Remove one JS function whose declaration matches sig_pattern.
    Includes any blank line immediately before the function.
    Returns (new_txt, removed:bool).
    """
    m = re.search(sig_pattern, txt)
    if not m:
        return txt, False
    # find opening brace at or after match.end()-1
    brace_open = txt.find('{', m.end() - 1)
    if brace_open == -1:
        return txt, False
    brace_close = find_fn_end(txt, brace_open)
    if brace_close == -1:
        return txt, False

    start = m.start()
    end   = brace_close + 1

    # consume trailing newlines
    while end < len(txt) and txt[end] == '\n':
        end += 1

    # eat a preceding blank line (keeps the file tidy)
    if start > 0 and txt[start - 1] == '\n':
        prev_nl = txt.rfind('\n', 0, start - 1)
        prev_line = txt[prev_nl + 1 : start - 1].strip()
        if not prev_line:          # blank line
            start = prev_nl + 1

    return txt[:start] + txt[end:], True

def remove_lines_re(txt, line_re):
    """Remove every line matching line_re (full-line anchored)."""
    return re.sub(r'(?m)^' + line_re + r'\n', '', txt)

# ─── per-file processing ─────────────────────────────────────────

def process(filename):
    path = os.path.join(BASE, filename)
    try:
        with open(path, encoding='utf-8') as f:
            txt = f.read()
    except FileNotFoundError:
        print(f'  SKIP (not found): {filename}')
        return

    orig = txt

    # ── 1. build marker ──────────────────────────────────────────
    txt = re.sub(r'<!-- build: [^\s]+ -->', f'<!-- build: {BUILD} -->', txt)

    # ── 2. simplify head theme script ────────────────────────────
    # Replace the long inline script (with function defs) with just the FOUC line.
    txt = re.sub(
        r"<script>document\.documentElement\.dataset\.theme=localStorage\.getItem\('tema'\)\|\|'auto';function applyTheme\(.*?</script>",
        "<script>document.documentElement.dataset.theme=localStorage.getItem('tema')||'auto';</script>",
        txt,
        flags=re.DOTALL,
    )

    # ── 3. inject utils.js (once, after supabase CDN) ────────────
    SUPA_TAG   = '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>'
    UTILS_TAG  = '<script src="utils.js"></script>'
    if UTILS_TAG not in txt and SUPA_TAG in txt:
        txt = txt.replace(SUPA_TAG, SUPA_TAG + '\n' + UTILS_TAG, 1)

    # ── 4. remove SUPABASE constant lines ────────────────────────
    txt = re.sub(r"const SUPABASE_URL = 'https://kxtjqudpnmdqkzqhyhmz\.supabase\.co';\n", '', txt)
    txt = re.sub(r"const SUPABASE_KEY = '" + re.escape(KEY) + r"';\n", '', txt)
    txt = re.sub(r"const SUPABASE_ANON_KEY = '" + re.escape(KEY) + r"';\n", '', txt)

    # ── 5. remove db = createClient(...) ─────────────────────────
    # a) works.html / os.html style: const { createClient } = supabase; + multi-line createClient
    txt = re.sub(
        r"[ \t]*const \{ createClient \} = (?:window\.)?supabase;\n"
        r"[ \t]*const db = createClient\(\n"
        r"[ \t]*'https://kxtjqudpnmdqkzqhyhmz\.supabase\.co',\n"
        r"[ \t]*'" + re.escape(KEY) + r"'\n"
        r"[ \t]*\);\n",
        '',
        txt,
    )
    # b) single-line with variables: const { createClient } = window.supabase;\nconst db = createClient(SUPABASE_URL, SUPABASE_KEY);
    txt = re.sub(
        r"[ \t]*const \{ createClient \} = window\.supabase;\n"
        r"[ \t]*const db = createClient\(SUPABASE_URL, SUPABASE_KEY\);\n",
        '',
        txt,
    )
    # c) window.supabase.createClient with variables
    txt = re.sub(
        r"[ \t]*const db = window\.supabase\.createClient\(SUPABASE_URL, (?:SUPABASE_KEY|SUPABASE_ANON_KEY)\);\n",
        '',
        txt,
    )
    # d) dashboard.html style: const { createClient } = supabase; (no window.)  + db = createClient multi-line
    txt = re.sub(
        r"[ \t]*const \{ createClient \} = supabase;\n"
        r"[ \t]*const db = createClient\(\n"
        r"[ \t]*'https://kxtjqudpnmdqkzqhyhmz\.supabase\.co',\n"
        r"[ \t]*'" + re.escape(KEY) + r"'\n"
        r"[ \t]*\);\n",
        '',
        txt,
    )

    # ── 6. remove function escHtml / esc ─────────────────────────
    txt, _ = remove_fn(txt, r'[ \t]*function esc(?:Html)?\(\w+\)\s*\{')

    # ── 7. remove function renderTopbar ──────────────────────────
    txt, _ = remove_fn(txt, r'[ \t]*function renderTopbar\(')

    # ── 8. remove logout / sair ───────────────────────────────────
    # one-liner: async function sair() { ... }
    txt = re.sub(r'\n[ \t]*async function sair\(\) \{[^\n]+\}\n', '\n', txt)
    txt, _ = remove_fn(txt, r'[ \t]*async function logout\(\)\s*\{')
    txt, _ = remove_fn(txt, r'[ \t]*async function sair\(\)\s*\{')

    # ── 9. supervisor.html & vistoria.html: remove body applyTheme/ciclarTema ──
    if filename in ('supervisor.html', 'vistoria.html'):
        txt, _ = remove_fn(txt, r'[ \t]*function applyTheme\(')
        txt, _ = remove_fn(txt, r'[ \t]*function ciclarTema\(\)')

    # ── 10. pendencias.html specifics ────────────────────────────
    if filename == 'pendencias.html':
        # replace mostrarToast wrapper with showToast from utils.js
        txt, _ = remove_fn(txt, r'[ \t]*function mostrarToast\(')
        txt = txt.replace('mostrarToast(', 'showToast(')
        txt = re.sub(r"showToast\(([^,]+),\s*'ok'\)", r"showToast(\1, 'success')", txt)
        txt = re.sub(r"showToast\(([^,]+),\s*'err'\)", r"showToast(\1, 'error')", txt)

    # ── 11. replace alert('Acesso...') with showToast ─────────────
    # Simple alert → showToast for access errors
    txt = re.sub(
        r"alert\('Acesso não autorizado\.[^']*'\)",
        "showToast('Acesso não autorizado. Você será redirecionado.', 'error')",
        txt,
    )
    txt = re.sub(r"alert\('Acesso restrito\.[^']*'\)", "showToast('Acesso restrito.', 'error')", txt)
    txt = re.sub(r"alert\('Acesso restrito ao coordenador\.[^']*'\)", "showToast('Acesso restrito ao coordenador.', 'error')", txt)

    # ── 12. debounce search inputs ────────────────────────────────
    # coordenador_projetos, gerente_comercial, projetista: addEventListener('input', fn)
    if filename in ('coordenador_projetos.html', 'gerente_comercial.html', 'projetista.html'):
        txt = re.sub(
            r"\.addEventListener\('input',\s*(renderTabela|renderGrid)\)",
            r".addEventListener('input', debounce(\1))",
            txt,
        )
    # supervisor.html fBusca
    if filename == 'supervisor.html':
        txt = txt.replace(
            "onInput=\"filtrar()\"",
            'oninput="if(!this._dFn)this._dFn=debounce(filtrar);this._dFn()"',
        )
    # obras.html oninput="buscar(this.value)"
    if filename == 'obras.html':
        txt = txt.replace(
            'oninput="buscar(this.value)"',
            'oninput="if(!this._dFn)this._dFn=debounce(v=>buscar(v));this._dFn(this.value)"',
        )
    # pendencias.html oninput="renderLista()"
    if filename == 'pendencias.html':
        txt = txt.replace(
            'oninput="renderLista()"',
            'oninput="if(!this._dFn)this._dFn=debounce(renderLista);this._dFn()"',
        )
    # tecnico_dashboard.html oninput="filtrar()"
    if filename == 'tecnico_dashboard.html':
        txt = txt.replace(
            'oninput="filtrar()"',
            'oninput="if(!this._dFn)this._dFn=debounce(filtrar);this._dFn()"',
        )

    # ── write back ───────────────────────────────────────────────
    if txt != orig:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(txt)
        print(f'  ✓  {filename}')
    else:
        print(f'  –  {filename}  (unchanged)')

# ─── run ────────────────────────────────────────────────────────
files = [
    'obras.html', 'obra_detail.html', 'admin.html', 'agenda.html',
    'agenda_vistorias.html', 'coordenador_projetos.html', 'dashboard.html',
    'gerente_comercial.html', 'login.html', 'os.html', 'pendencias.html',
    'projetista.html', 'supervisor.html', 'tecnico_dashboard.html', 'vistoria.html',
]

print('=== refactor_utils.py ===')
for f in files:
    process(f)
print('=== done ===')
