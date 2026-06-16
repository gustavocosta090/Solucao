# PROMPT DE AUDITORIA COMPLETA — SAOS

> Cole este prompt numa nova conversa com Claude Code para auditar o sistema inteiro.

---

```
Você é um auditor técnico sênior. Sua tarefa é revisar o sistema SAOS (Sistema de Agendas e
Ordens de Serviço) de ponta a ponta e produzir um relatório de problemas encontrados.

## CONTEXTO DO SISTEMA

Diretório: /Users/gustavomartins/Documents/Sistema de Agendas e OS - SAOS - CLAUDE BACKUP/
Deploy: https://solucaotecnica.vercel.app
Stack: HTML/CSS/JS vanilla · Supabase (PostgreSQL) · Vercel Serverless · jsPDF · html2canvas
Sem framework frontend. Sem repositório Git local.

Leia o CONTEXT_BACKUP.md antes de tudo:
📄 /Users/gustavomartins/Documents/Sistema de Agendas e OS - SAOS - CLAUDE BACKUP/CONTEXT_BACKUP.md

---

## ARQUIVOS A AUDITAR

Leia todos estes arquivos na íntegra:

PÁGINAS PRINCIPAIS:
- agenda.html
- assistencia.html
- viagens.html
- supervisor.html
- os.html
- pendencias.html
- agenda_plantao.html
- agenda_vistorias.html
- obras.html
- obra_detail.html
- dashboard.html
- admin.html
- vistoria.html

UTILITÁRIOS:
- utils.js
- app-shell.css
- vercel.json

API (Vercel Serverless):
- api/upload-pdf.js
- api/upload.js (se existir)

---

## O QUE VERIFICAR — CHECKLIST COMPLETO

Para cada arquivo, verifique os itens abaixo e anote qualquer problema encontrado com:
- Arquivo + número de linha
- Descrição do problema
- Severidade: 🔴 Crítico / 🟡 Importante / 🔵 Melhoria

---

### 1. CONSISTÊNCIA DE CAMPOS DO BANCO

Regras críticas — qualquer violação é BUG CRÍTICO:
- [ ] Colunas `valor_servico` e `valor_produto` — sem 's' final (não `valor_servicos`)
- [ ] `pct_servico` é ratio 0–1 no banco — deve ser multiplicado × 100 para exibir (ex: 0.2 → 20%)
- [ ] `fase_atual` = etapa técnica; `situacao` = estado de negócio (não confundir)
- [ ] `entrega_comercial` no banco = "Finalizado" no frontend
- [ ] `atualizado_em` NÃO existe em `agendamentos` nem em `ordens_de_servico` — qualquer update com esse campo falha silenciosamente
- [ ] `atualizado_em` EXISTE em `viagens_detalhe` — OK usar lá
- [ ] `serie_id` em `agendamentos` — deve ser preservado ao editar (nunca sobrescrever com null)

---

### 2. AUTENTICAÇÃO E AUTORIZAÇÃO

- [ ] Todas as páginas verificam sessão/role antes de renderizar conteúdo
- [ ] Role `agendamento` tem as mesmas permissões que `coordenador` (não apenas `coordenador`)
- [ ] Rotas protegidas: técnico não acessa páginas de coordenador/supervisor
- [ ] Admin: apenas `coordenador` acessa (não `agendamento`)
- [ ] Nenhuma página expõe dados sem verificação de autenticação
- [ ] Verificar se há `redirectToLogin()` ou equivalente em todas as páginas

---

### 3. QUERIES SUPABASE — FILTROS E SEGURANÇA

- [ ] Todas as queries de OS verificam `status_aprovacao != 'cancelada'` onde necessário
- [ ] Supervisor e técnico: queries de OS têm `.lte('data_servico', hoje)` — OSes futuras não devem aparecer
- [ ] assistencia.html: query tem `.eq('tipo_servico', 'assistencia')` E `.neq('status_aprovacao', 'cancelada')`
- [ ] viagens.html: query filtra `status = 'viagem'`
- [ ] Nenhuma query faz join `agendamentos!agendamento_id` em `ordens_de_servico` (FK não registrada no Supabase schema cache — causaria erro)
- [ ] Queries com `in([])` (array vazio) não são enviadas ao Supabase (causariam erro)
- [ ] Verificar se há `select('*')` desnecessários que trazem dados sensíveis

---

### 4. SÉRIE DE AGENDAMENTOS (serie_id)

- [ ] `salvarAgendamento()` em agenda.html: ao editar, `serie_id` lê o valor existente do agendamento (não gera UUID novo, não seta null)
- [ ] Propagação de série: ao editar qualquer campo relevante, dialog pergunta se propaga para os outros dias
- [ ] Payload de propagação inclui: tecnico_id, auxiliar_id, auxiliar2_id, auxiliar3_id, motorista_id, status, veiculo, servico, hora_inicio, obra_id, cliente_outro, endereco_outro
- [ ] Payload de propagação NÃO inclui `atualizado_em`
- [ ] `fecharModal()` não é chamado antes do check de `eraEdicao` (bug de redirect)
- [ ] `eraEdicao = !!agEditandoId` é salvo antes de `fecharModal()`

---

### 5. ORDENS DE SERVIÇO

- [ ] Ao criar agendamento, OS é criada com `tipo_servico` correto
- [ ] Ao editar agendamento e mudar `tipo_servico`, a OS é atualizada (sem `atualizado_em`)
- [ ] OS de viagem não é criada (`status === 'viagem'` → skip)
- [ ] Ao excluir agendamento: OSes pendentes ficam como `cancelada` (não deletadas — preserva histórico)
- [ ] `numero_os` segue formato correto por tipo (execução: `YYYY-MM-EQ-NNNN`; assistência/diária: `YYYY-MM-DD-NNNN`)
- [ ] Backfill de `numero_os` em agendamentos sem número foi feito (ou não é necessário agora)

---

### 6. VIAGENS

- [ ] `viagens_detalhe`: `hotel=true` conta como diária; `hotel=false && hotel_obs` = hospedagem texto
- [ ] `_salvarGrupo`: lê `hospChecked` separado de `hotel`, salva `hotel_obs` apenas quando hospedagem
- [ ] `_pdfViagem(g)`: aceita grupo, não agId individual
- [ ] `exportarSemana`: usa `TW = 28+50+52+28+38+32+40 = 268` para alinhar linha de total com a tabela
- [ ] Stats Valor Ref: calcula `saldo × nPessoas × nDias` (não só `× nDias`)
- [ ] Stats Diárias Hotel: contagem de dias (não valor R$)
- [ ] `tHosp(gid, tipo)`: hotel e hospedagem são mutuamente exclusivos

---

### 7. EXIBIÇÃO DE NOMES

Regra: SEMPRE nome completo — há 4 pessoas chamadas "Lucas" na equipe.
- [ ] Nenhuma ocorrência de `.split(' ')[0]` para nomes de técnicos
- [ ] Nenhuma ocorrência de `.nome.substring(0, N)` que trunca sobrenome
- [ ] Verificar: agenda.html, os.html, viagens.html, supervisor.html, agenda_plantao.html, pendencias.html, assistencia.html

---

### 8. FILTROS DE EQUIPE — ORDEM

Ordem correta: Todas > Cabeamento(1) > Elétrica(2) > Áudio e Vídeo(3) > Automação(4) > Regional Norte(5)
- [ ] agenda.html: query de equipes usa `.order('id')` (não `.order('nome')`)
- [ ] agenda_plantao.html: botões hardcoded na ordem correta (1→2→3→4→5)
- [ ] pendencias.html: abas e checkboxes na ordem correta
- [ ] Qualquer outro filtro de equipe segue a mesma ordem

---

### 9. PDFs

- [ ] Upload de PDFs usa `/api/upload-pdf.js` (server-side) — nunca direto do browser (CORS)
- [ ] `Content-Range` presente no upload session do SharePoint
- [ ] `Content-Length` AUSENTE (header proibido no browser fetch)
- [ ] Timestamp no nome dos arquivos SharePoint (`YYYY-MM-DD-HHhMMmSS`)
- [ ] Acentos em textos hardcoded do PDF (jsPDF suporta, não usar "Solucao" quando deveria ser "Solução")
- [ ] PDF de estoque: VIAGENS=verde, CONFIRMADOS=azul, NÃO CONFIRMADOS=amarelo
- [ ] PDF de viagem individual: sem assinatura do técnico, só gestor

---

### 10. AUTO-REFRESH E PERFORMANCE

- [ ] `iniciarAutoRefresh(fn, ms)` usado nas páginas colaborativas (agenda, supervisor, os, assistencia)
- [ ] `invalidateCache()` chamado após salvar dados (agenda usa `cachedQuery`)
- [ ] Nenhuma query faz `select('*')` em tabelas grandes sem filtro de data/status
- [ ] `Promise.all([...])` usado onde possível para queries paralelas

---

### 11. UPLOAD SHAREPOINT

- [ ] `api/upload-pdf.js`: usa `Content-Range` no upload session
- [ ] `api/upload-pdf.js`: NÃO usa `Content-Length`
- [ ] Nome de arquivo inclui timestamp para evitar colisão
- [ ] Token de acesso renovado se expirado

---

### 12. UX E CONSISTÊNCIA VISUAL

- [ ] Tema dark aplicado em todas as páginas (sem página clara)
- [ ] Menu lateral: itens corretos por role
  - Técnico: Agenda, OS (sua visão)
  - Supervisor: + Supervisor, Vistorias
  - Coordenador/Agendamento: + Pendências, Viagens, Admin (não admin)
  - Admin: tudo
- [ ] Sidebar "Assistências" visível para supervisor, coordenador e agendamento
- [ ] Botões de ação em pendencias.html: 4 por linha (grid, não flex)
- [ ] Supervisor: botão "Deletar OS" presente em cada linha

---

### 13. BUGS CONHECIDOS — VERIFICAR SE REGRESSARAM

Estes bugs foram corrigidos. Confirme que não voltaram:
- [ ] `atualizado_em` ausente de updates de `agendamentos` e `ordens_de_servico`
- [ ] `serie_id` preservado ao editar agendamento
- [ ] `eraEdicao` flag antes de `fecharModal()` em agenda.html
- [ ] Propagação série sem `atualizado_em` no payload
- [ ] `tipo_servico` incluído no update da OS ao editar
- [ ] Filtro `cancelada` em assistencia.html
- [ ] `_cliente_outro` via query manual (não join FK)
- [ ] `.lte('data_servico', hoje)` em supervisor.html e os.html
- [ ] Equipes ordenadas por `id` em agenda.html

---

## FORMATO DO RELATÓRIO

Produza o relatório neste formato:

---

# RELATÓRIO DE AUDITORIA — SAOS
**Data:** [data]
**Arquivos lidos:** [lista]

## RESUMO EXECUTIVO
- X bugs críticos encontrados
- Y problemas importantes encontrados
- Z melhorias sugeridas

## BUGS CRÍTICOS 🔴
[Para cada um:]
**Arquivo:** nome_arquivo.html | **Linha:** NNN
**Problema:** descrição clara
**Impacto:** o que quebra
**Correção sugerida:** código ou instrução

## PROBLEMAS IMPORTANTES 🟡
[idem]

## MELHORIAS SUGERIDAS 🔵
[idem]

## ITENS OK ✅
Lista resumida do que foi verificado e está correto.

## PRÓXIMOS PASSOS
Lista priorizada do que corrigir primeiro.

---

## INSTRUÇÕES FINAIS

1. Leia todos os arquivos mencionados antes de produzir qualquer output.
2. Não invente problemas — só reporte o que você viu no código.
3. Quando encontrar um bug, cite a linha exata.
4. Se um item do checklist não puder ser verificado (arquivo não existe, linha ambígua), diga "não verificado" com motivo.
5. Seja específico: "linha 1234 de agenda.html" é útil; "pode ter um bug" não é.
6. Priorize bugs que afetam dados (perda de dados, gravação incorreta) sobre bugs visuais.
7. Não corrija nada — apenas reporte. O dono do sistema decidirá o que corrigir.
```
