// api/criar-pastas.js — cria estrutura de pastas SharePoint para todos os clientes
// Endpoint de uso único, protegido por token.
// Chamada: POST /api/criar-pastas  com header  Authorization: Bearer cria2026pastas

import { getToken, getSiteId } from './_sharepoint.js';

const TOKEN_ACESSO  = 'cria2026pastas';
const SUPABASE_URL  = 'https://kxtjqudpnmdqkzqhyhmz.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4dGpxdWRwbm1kcWt6cWh5aG16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NDYzMzEsImV4cCI6MjA5NTIyMjMzMX0.tba066RGNwDbXaNEy3w_OHbblll_bky6Dx10mXnxVQ0';
const ANO           = '2026';
const EQUIPE_COD    = { 1: '01', 2: '02', 3: '03', 4: '04', 5: '05' };

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
    const nomePasta     = partes[i];
    const parentEncoded = parentPath
      ? parentPath.split('/').map(p => encodeURIComponent(p)).join('/')
      : null;

    const url = parentEncoded
      ? `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${parentEncoded}:/children`
      : `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root/children`;

    const res = await fetch(url, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name: nomePasta, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
    });

    if (!res.ok) {
      const data = await res.json();
      if (data.error?.code === 'nameAlreadyExists') continue;
      throw new Error(`"${nomePasta}" em /${parentPath} → ${data.error?.code}: ${data.error?.message}`);
    }
  }
}

async function supabaseFetch(tabela, params = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}${params}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase ${tabela} (${res.status}): ${await res.text()}`);
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ erro: 'Método não permitido' });

  // Proteção simples por token
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
    const obras   = await supabaseFetch('obras', '?select=nome_cliente&order=nome_cliente');
    const equipes = await supabaseFetch('equipes', '?select=id,nome&order=id');

    const clientes = [...new Set(obras.map(o => o.nome_cliente).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

    log.push(`✅ ${clientes.length} cliente(s) | ${equipes.length} equipe(s)`);
    log.push('');

    // 3. Criar pastas
    let criadas = 0, erros = 0;

    for (const nomeCliente of clientes) {
      const nomeBase = nomePastaCliente(nomeCliente);
      log.push(`📂 ${nomeBase}`);

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
    log.push(`✅ Criadas: ${criadas}  ❌ Erros: ${erros}`);
    log.push(`⏱  Tempo: ${tempo}s`);

    return res.status(200).json({ ok: true, log, criadas, erros });

  } catch (e) {
    log.push('❌ ERRO FATAL: ' + e.message);
    return res.status(500).json({ ok: false, log, erro: e.message });
  }
}
