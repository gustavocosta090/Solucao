// api/criar-pastas.js — cria estrutura de pastas SharePoint para todos os clientes
// build: 2026-06-01d
// Endpoint de uso administrativo, protegido por token em variável de ambiente.
// Chamada: POST /api/criar-pastas?inicio=0&limite=1
// Header: Authorization: Bearer <CRIAR_PASTAS_TOKEN>

import { getToken, getSiteId } from './_sharepoint.js';

const TOKEN_ACESSO  = process.env.CRIAR_PASTAS_TOKEN;
const SUPABASE_URL  = 'https://kxtjqudpnmdqkzqhyhmz.supabase.co';
// Usa service role key (bypassa RLS) se disponível, senão cai na anon key
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4dGpxdWRwbm1kcWt6cWh5aG16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NDYzMzEsImV4cCI6MjA5NTIyMjMzMX0.tba066RGNwDbXaNEy3w_OHbblll_bky6Dx10mXnxVQ0';
const ANO           = '2026';
const EQUIPE_COD    = { 1: '01', 2: '02', 3: '03', 4: '04', 5: '05' };
const caminhosCriadosNaExecucao = new Set();

async function fetchComTimeout(url, options = {}, ms = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`Timeout ao chamar ${url}`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function nomePastaCliente(nome) {
  return (nome || 'Sem Cliente')
    .replace(/[\/\\:*?"<>|#%~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 60) || 'Sem Cliente';
}

async function criarCaminho(token, siteId, caminhoCompleto) {
  const partes = caminhoCompleto.split('/').filter(Boolean);
  for (let i = 0; i < partes.length; i++) {
    const parentPath    = partes.slice(0, i).join('/');
    const caminhoAtual   = partes.slice(0, i + 1).join('/');
    if (caminhosCriadosNaExecucao.has(caminhoAtual)) continue;

    const nomePasta     = partes[i];
    const parentEncoded = parentPath
      ? parentPath.split('/').map(p => encodeURIComponent(p)).join('/')
      : null;

    const url = parentEncoded
      ? `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${parentEncoded}:/children`
      : `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root/children`;

    const res = await fetchComTimeout(url, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name: nomePasta, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
    }, 12000);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.error?.code === 'nameAlreadyExists') {
        caminhosCriadosNaExecucao.add(caminhoAtual);
        continue;
      }
      throw new Error(`"${nomePasta}" em /${parentPath} → ${data.error?.code}: ${data.error?.message}`);
    }

    caminhosCriadosNaExecucao.add(caminhoAtual);
  }
}

async function supabaseFetch(tabela, params = '') {
  const res = await fetchComTimeout(`${SUPABASE_URL}/rest/v1/${tabela}${params}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  }, 12000);
  if (!res.ok) throw new Error(`Supabase ${tabela} (${res.status}): ${await res.text()}`);
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ erro: 'Método não permitido' });

  if (!TOKEN_ACESSO) {
    return res.status(503).json({ erro: 'CRIAR_PASTAS_TOKEN não configurado no servidor' });
  }

  // Proteção simples por token administrativo
  const auth = req.headers.authorization || '';
  if (auth.replace('Bearer ', '').trim() !== TOKEN_ACESSO) {
    return res.status(401).json({ erro: 'Token inválido' });
  }

  const log     = [];
  const inicio  = Date.now();

  try {
    // 1. Autenticação SharePoint
    log.push('🔐 Autenticando no Microsoft Graph...');
    const token  = await getToken();
    const siteId = await getSiteId(token);
    log.push(`✅ Conectado ao site SharePoint`);

    // 2. Dados Supabase
    log.push('📦 Buscando dados no Supabase...');
    const obras   = await supabaseFetch('obras', '?select=nome_cliente&order=nome_cliente&limit=10000');
    const equipes = await supabaseFetch('equipes', '?select=id,nome&order=id');

    const clientes = [...new Set(obras.map(o => o.nome_cliente).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    if (req.query.teste === '1') {
      return res.status(200).json({
        ok: true,
        teste: true,
        mensagem: 'Conexão com Supabase, Microsoft Graph e SharePoint OK. Nenhuma pasta foi criada.',
        totalClientes: clientes.length,
        totalEquipes: equipes.length,
      });
    }

    const inicioCliente = Math.max(0, Number(req.query.inicio || req.query.offset || 0) || 0);
    const limiteCliente = Math.min(50, Math.max(1, Number(req.query.limite || req.query.limit || 5) || 5));
    const clientesLote = clientes.slice(inicioCliente, inicioCliente + limiteCliente);
    const proximoInicio = inicioCliente + clientesLote.length;
    const finalizado = proximoInicio >= clientes.length;

    log.push(`✅ ${clientes.length} cliente(s) | ${equipes.length} equipe(s)`);
    log.push(`📌 Lote: cliente ${inicioCliente + 1} até ${proximoInicio} de ${clientes.length}`);
    log.push('');

    // 3. Criar pastas
    let criadas = 0, erros = 0;

    for (const nomeCliente of clientesLote) {
      const nomeBase = nomePastaCliente(nomeCliente);
      log.push(`📂 ${nomeBase}`);

      const bases = [
        `Obras e Clientes ${ANO}/${nomeBase}`,
        `Obras e Clientes ${ANO}/${nomeBase}/Ordens de Serviço`,
        `Obras e Clientes ${ANO}/${nomeBase}/Fotos`,
      ];

      for (const base of bases) {
        try {
          await criarCaminho(token, siteId, base);
        } catch (e) {
          log.push(`   ✗ ${base.split('/').slice(1).join(' › ')} — ${e.message}`);
          erros++;
        }
      }

      for (const equipe of equipes) {
        const cod        = EQUIPE_COD[equipe.id] || String(equipe.id).padStart(2, '0');
        const nomeEquipe = `Equipe ${cod} - ${equipe.nome}`;

        const caminhos = [
          `Obras e Clientes ${ANO}/${nomeBase}/Ordens de Serviço/${nomeEquipe}`,
          `Obras e Clientes ${ANO}/${nomeBase}/Fotos/${nomeEquipe}`,
        ];

        for (const caminho of caminhos) {
          const rotulo = caminho.split('/').slice(2).join(' › ');
          try {
            await criarCaminho(token, siteId, caminho);
            log.push(`   ✓ ${rotulo}`);
            criadas++;
          } catch (e) {
            log.push(`   ✗ ${rotulo} — ${e.message}`);
            erros++;
          }
        }
      }
      log.push('');
    }

    const tempo = ((Date.now() - inicio) / 1000).toFixed(1);
    log.push(`══════════════════════════════`);
    log.push(`✅ Criadas/verificadas neste lote: ${criadas}  ❌ Erros: ${erros}`);
    log.push(`⏱  Tempo: ${tempo}s`);
    log.push(finalizado ? '🏁 Finalizado: todos os clientes foram processados.' : `➡️ Próximo comando: use ?inicio=${proximoInicio}&limite=${limiteCliente}`);

    return res.status(200).json({
      ok: true,
      log,
      criadas,
      erros,
      totalClientes: clientes.length,
      inicio: inicioCliente,
      limite: limiteCliente,
      processados: clientesLote.length,
      proximoInicio,
      finalizado,
    });

  } catch (e) {
    log.push('❌ ERRO FATAL: ' + e.message);
    return res.status(500).json({ ok: false, log, erro: e.message });
  }
}
