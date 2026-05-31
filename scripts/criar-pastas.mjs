#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// scripts/criar-pastas.mjs
// Cria a estrutura de pastas SharePoint para TODOS os clientes cadastrados.
//
// Estrutura criada (por cliente × equipe):
//   Obras e Clientes 2026/{Cliente}/Ordens de Serviço/Equipe XX - Nome/
//   Obras e Clientes 2026/{Cliente}/Fotos/Equipe XX - Nome/
//
// COMO USAR:
//   1. Crie o arquivo .env na raiz do projeto com as variáveis abaixo
//      (copie os valores direto do painel do Vercel → Settings → Environment Variables):
//
//        MS_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
//        MS_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
//        MS_CLIENT_SECRET=cole_o_valor_aqui
//        MS_SHAREPOINT_HOST=suaempresa.sharepoint.com
//        MS_SHAREPOINT_SITE_PATH=/sites/NomeSite
//
//   2. Execute (precisa do Node 20.6+, mas já está no 24):
//        node --env-file=.env scripts/criar-pastas.mjs
//
// ⚠️  O arquivo .env NUNCA deve ser commitado no git. Adicione ao .gitignore.
// ─────────────────────────────────────────────────────────────────────────────

// ── Configuração ──────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://kxtjqudpnmdqkzqhyhmz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4dGpxdWRwbm1kcWt6cWh5aG16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NDYzMzEsImV4cCI6MjA5NTIyMjMzMX0.tba066RGNwDbXaNEy3w_OHbblll_bky6Dx10mXnxVQ0';

const ANO        = '2026';
// Mapeamento equipe.id → código de 2 dígitos (mesmo do os.html)
const EQUIPE_COD = { 1: '01', 2: '02', 3: '03', 4: '04', 5: '05' };

// ── Leitura das variáveis de ambiente ─────────────────────────────────────────
const MS_TENANT_ID           = process.env.MS_TENANT_ID;
const MS_CLIENT_ID           = process.env.MS_CLIENT_ID;
const MS_CLIENT_SECRET       = process.env.MS_CLIENT_SECRET;
const MS_SHAREPOINT_HOST     = process.env.MS_SHAREPOINT_HOST;
const MS_SHAREPOINT_SITE_PATH = process.env.MS_SHAREPOINT_SITE_PATH;

function checarEnv() {
  const faltando = ['MS_TENANT_ID','MS_CLIENT_ID','MS_CLIENT_SECRET','MS_SHAREPOINT_HOST','MS_SHAREPOINT_SITE_PATH']
    .filter(k => !process.env[k]);
  if (faltando.length) {
    console.error('\n❌  Variáveis de ambiente faltando:', faltando.join(', '));
    console.error('   Crie um arquivo .env na raiz do projeto com essas variáveis.');
    console.error('   (Copie os valores do painel Vercel → Settings → Environment Variables)\n');
    process.exit(1);
  }
}

// ── Autenticação Microsoft (Client Credentials) ───────────────────────────────
async function getToken() {
  const res = await fetch(
    `https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     MS_CLIENT_ID,
        client_secret: MS_CLIENT_SECRET,
        scope:         'https://graph.microsoft.com/.default',
      }),
    }
  );
  const data = await res.json();
  if (!data.access_token) throw new Error('Falha no token: ' + JSON.stringify(data));
  console.log('   Token válido por', Math.round(data.expires_in / 60), 'minutos.');
  return data.access_token;
}

async function getSiteId(token) {
  let host = (MS_SHAREPOINT_HOST || '').replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim();
  let sitePath = (MS_SHAREPOINT_SITE_PATH || '/')
    .replace(/^https?:\/\/[^/]*/i, '')
    .replace(/\?.*$/, '')
    .replace(/\/Forms\/.*$/i, '')
    .trim();
  if (!sitePath.startsWith('/')) sitePath = '/' + sitePath;

  const r1 = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${host}:${sitePath}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const d1 = await r1.json();
  if (d1.id) return d1.id;

  // Fallback: busca por nome do site
  const siteName = sitePath.split('/').filter(Boolean).pop();
  const r2 = await fetch(
    `https://graph.microsoft.com/v1.0/sites?search=${encodeURIComponent(siteName)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const d2    = await r2.json();
  const found = (d2.value || []).find(s => s.webUrl?.toLowerCase().includes(siteName.toLowerCase()));
  if (found?.id) return found.id;

  throw new Error(
    `Site SharePoint não encontrado.\n` +
    `  Host: "${host}", Path: "${sitePath}"\n` +
    `  T1: ${d1.error?.code || d1.error?.message}\n` +
    `  T2: ${d2.error?.code || (d2.value?.length + ' sites encontrados')}`
  );
}

// ── Criação de pastas no SharePoint (nível a nível) ───────────────────────────
// Cria cada segmento do caminho separadamente.
// Se a pasta já existe (nameAlreadyExists), ignora e continua pro próximo nível.
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
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        name:   nomePasta,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'fail', // 409 se já existe → tratamos abaixo
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      const code = data.error?.code;

      // Pasta já existe → OK, continua para o próximo nível
      if (code === 'nameAlreadyExists') continue;

      // Qualquer outro erro é fatal para este caminho
      throw new Error(
        `"${nomePasta}" (em /${parentPath || ''}) → ${code}: ${data.error?.message}`
      );
    }
    // 201 Created → pasta criada com sucesso, continua pro próximo nível
  }
}

// ── Sanitização do nome (idêntica ao os.html) ─────────────────────────────────
function nomePastaCliente(nome) {
  return (nome || 'Sem Cliente')
    .replace(/[\/\\:*?"<>|#%~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 60)
    || 'Sem Cliente';
}

// ── Busca de dados no Supabase ────────────────────────────────────────────────
async function buscarClientes() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/obras?select=nome_cliente&order=nome_cliente`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase obras (${res.status}): ${txt}`);
  }
  const obras  = await res.json();
  const nomes  = [...new Set(obras.map(o => o.nome_cliente).filter(Boolean))];
  return nomes.sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

async function buscarEquipes() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/equipes?select=id,nome&order=id`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase equipes (${res.status}): ${txt}`);
  }
  return await res.json(); // [{ id, nome }]
}

// ── Ponto de entrada ──────────────────────────────────────────────────────────
async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  Criador de Pastas SharePoint — Solução Técnica');
  console.log('══════════════════════════════════════════════════════\n');

  checarEnv();

  // 1. Autenticação Microsoft
  console.log('🔐  Autenticando no Microsoft Graph...');
  const token  = await getToken();
  const siteId = await getSiteId(token);
  console.log(`✅  Conectado ao site: ${siteId.split(',')[1] || siteId}\n`);

  // 2. Dados do Supabase
  console.log('📦  Buscando dados no Supabase...');
  const [clientes, equipes] = await Promise.all([buscarClientes(), buscarEquipes()]);

  if (!clientes.length) {
    console.log('⚠️   Nenhum cliente encontrado na tabela obras. Nada a criar.');
    return;
  }
  if (!equipes.length) {
    console.log('⚠️   Nenhuma equipe encontrada. Nada a criar.');
    return;
  }

  console.log(`   ✓ ${clientes.length} cliente(s) encontrado(s)`);
  console.log(`   ✓ ${equipes.length} equipe(s):`);
  equipes.forEach(e => {
    const cod = EQUIPE_COD[e.id] || String(e.id).padStart(2, '0');
    console.log(`       Equipe ${cod} - ${e.nome}`);
  });

  const totalCaminhos = clientes.length * equipes.length * 2;
  console.log(`\n📁  Criando até ${totalCaminhos} caminhos de pasta...\n`);
  console.log('   (Pastas já existentes serão ignoradas automaticamente)\n');

  let criadas    = 0;
  let ignoradas  = 0;
  let comErro    = 0;

  // 3. Criar pastas por cliente
  for (const nomeCliente of clientes) {
    const nomeBase = nomePastaCliente(nomeCliente);
    console.log(`  📂 ${nomeBase}`);

    for (const equipe of equipes) {
      const cod        = EQUIPE_COD[equipe.id] || String(equipe.id).padStart(2, '0');
      const nomeEquipe = `Equipe ${cod} - ${equipe.nome}`;

      const caminhos = [
        `Obras e Clientes ${ANO}/${nomeBase}/Ordens de Serviço/${nomeEquipe}`,
        `Obras e Clientes ${ANO}/${nomeBase}/Fotos/${nomeEquipe}`,
      ];

      for (const caminho of caminhos) {
        const rotulo = caminho.split('/').slice(2).join(' › '); // ex: "Cliente › Fotos › Equipe 01 - Eletrica"
        try {
          await criarCaminho(token, siteId, caminho);
          console.log(`     ✓ ${rotulo}`);
          criadas++;
        } catch (e) {
          // nameAlreadyExists já tratado dentro de criarCaminho; isso é erro real
          console.log(`     ✗ ${rotulo}`);
          console.log(`       └─ ${e.message}`);
          comErro++;
        }
      }
    }
    console.log('');
  }

  // 4. Resumo final
  console.log('══════════════════════════════════════════════════════');
  console.log(`  ✅  Caminhos criados:  ${criadas}`);
  if (comErro) console.log(`  ❌  Com erro:          ${comErro}`);
  console.log(`  📂  Clientes:          ${clientes.length}`);
  console.log(`  👷  Equipes:           ${equipes.length}`);
  console.log('══════════════════════════════════════════════════════\n');

  if (comErro) {
    console.log('ℹ️   Pastas com erro podem ter sido criadas parcialmente.');
    console.log('   Rode o script novamente — ele pula o que já existe.\n');
  } else {
    console.log('🎉  Estrutura completa criada no SharePoint!\n');
  }
}

main().catch(e => {
  console.error('\n❌  Erro fatal:', e.message, '\n');
  process.exit(1);
});
