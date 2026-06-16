# PROMPT DE TESTE FUNCIONAL — SAOS (PRÉ-PRODUÇÃO)

> Sistema entra em operação real na próxima semana com os técnicos.
> Cole este prompt numa nova conversa com Claude Code para verificar o funcionamento de todas as funcionalidades.

---

```
Você é um engenheiro de QA especialista em validação pré-produção.
O sistema SAOS (Solução Técnica — automação residencial) entra em operação real na próxima semana
com os técnicos de campo. Sua missão é verificar se cada funcionalidade está operacional,
identificar o que pode falhar na mão de um usuário real e priorizar correções.

## CONTEXTO OBRIGATÓRIO — LEIA PRIMEIRO

📄 /Users/gustavomartins/Documents/Sistema de Agendas e OS - SAOS - CLAUDE BACKUP/CONTEXT_BACKUP.md

Diretório: /Users/gustavomartins/Documents/Sistema de Agendas e OS - SAOS - CLAUDE BACKUP/
Deploy: https://solucaotecnica.vercel.app

---

## PARTE 1 — PERSONAS E ACESSOS

O sistema tem 5 roles. Para cada uma, verifique se as permissões de menu e acesso às páginas
estão corretas no código (utils.js + cada página).

### 👷 TÉCNICO
Acessa: os.html (suas OSes do dia)
NÃO acessa: agenda, supervisor, admin, pendências, viagens
Fluxo principal: abre o app → vê lista de agendamentos de hoje → abre OS → preenche relatório → salva

Verificar:
- [ ] os.html carrega os agendamentos do dia do técnico logado (lte data_servico hoje)
- [ ] Técnico NÃO vê OSes futuras nem de outros técnicos
- [ ] Técnico consegue preencher o formulário de OS (campo de descrição, fotos, conclusão)
- [ ] Após salvar, OS muda para status correto (aprovada/concluída)
- [ ] Se não há agendamento hoje → mostra mensagem amigável (não tela quebrada)
- [ ] Saudação usa nome completo (não só primeiro nome)
- [ ] Menu lateral mostra apenas o que o técnico deve ver

### 📋 COORDENADOR / AGENDAMENTO
Acessa: agenda, pendências, viagens, obras, dashboard, assistências, solicitações
NÃO acessa: admin (coordenador acessa, agendamento não — verificar)
Fluxo principal: cria agendamento → replica para semana → visualiza grade → dispara dia

Verificar:
- [ ] Role `agendamento` tem as mesmas permissões que `coordenador` em todos os menus
- [ ] Pode criar agendamento novo com todos os campos
- [ ] Pode replicar para múltiplos dias (checkbox "Replicar dias")
- [ ] Ao editar agendamento de série, dialog de propagação aparece
- [ ] Filtros de equipe aparecem na ordem: Cabeamento > Elétrica > A&V > Automação > Regional Norte
- [ ] Agenda padrão = equipe Automação
- [ ] Pode criar assistência técnica e ela aparece em assistencias.html
- [ ] Pode trocar tipo de agendamento: execução ↔ assistência (persiste)
- [ ] Pode criar viagem com série replicada

### 👁️ SUPERVISOR
Acessa: supervisor, vistorias, assistências
Fluxo principal: filtra OSes por técnico/data → conclui OS → vê vistorias pendentes

Verificar:
- [ ] supervisor.html carrega OSes do dia e passados (NÃO futuras)
- [ ] KPI "Atrasadas" conta só OSes com data_servico < hoje
- [ ] Filtro por técnico, status, tipo, data funcionam
- [ ] Botão "Concluir" muda status da OS
- [ ] Botão "Deletar" exibe confirmação e remove a OS
- [ ] Aba Vistorias mostra vistorias pendentes
- [ ] Aba Assistências mostra assistências pendentes

### 🔧 ADMIN
Acessa: tudo + admin.html (gestão de usuários)
Verificar:
- [ ] Pode criar usuário novo com role
- [ ] Pode editar/desativar usuário existente
- [ ] CPF dos técnicos pode ser preenchido

---

## PARTE 2 — FLUXOS CRÍTICOS (TESTAR EM ORDEM)

### FLUXO 1: Criar e executar um agendamento simples

1. Coordenador abre agenda.html
2. Clica em "+" num dia da semana
3. Seleciona obra (ou "Outro"), preenche campos
4. Define equipe com técnico principal
5. Salva → OS é criada automaticamente
6. Técnico abre os.html → vê o agendamento APENAS no dia correto (não antes)
7. Técnico clica na OS → preenche relatório → salva
8. Supervisor vê OS como "Pendente" → clica Concluir → OS some dos pendentes

Verificar em código:
- [ ] OS criada com `tipo_servico`, `obra_id`, `tecnico_id`, `data_servico` corretos
- [ ] `data_servico` = data do agendamento
- [ ] OS aparece para o técnico certo (não para outros)
- [ ] `status_aprovacao` transita corretamente: pendente → aprovada/concluída

---

### FLUXO 2: Replicar agendamento para semana inteira

1. Coordenador cria agendamento na segunda
2. Marca "Replicar dias", define "Até sexta"
3. Opções: pular FDS ✓, pular dias bloqueados ✓
4. Salva → 5 agendamentos criados com mesmo `serie_id`
5. Abre um dos agendamentos (ex: quarta) → muda o veículo
6. Dialog "Deseja aplicar a todos?" → Confirma
7. Todos os dias da série ficam com veículo atualizado

Verificar:
- [ ] Todos os dias têm o mesmo `serie_id`
- [ ] `serie_id` é preservado ao editar (não zerado)
- [ ] Propagação inclui: tecnico, auxiliar, status, veiculo, servico, hora, obra, endereco
- [ ] Propagação NÃO tenta gravar `atualizado_em` (campo não existe em agendamentos)

---

### FLUXO 3: Assistência Técnica

1. Coordenador cria agendamento → seleciona tipo "Assistência técnica"
2. Pode selecionar "Outro" como obra e digitar nome do cliente
3. Salva → redireciona para assistencias.html (só se for novo, não edição)
4. assistencias.html mostra a OS com o nome do cliente correto (não "—")
5. Técnico abre os.html → vê a OS de assistência igual à de execução
6. Ao finalizar, aparece no supervisor como concluída

Verificar:
- [ ] OS tem `tipo_servico = 'assistencia'`
- [ ] assistencias.html filtra `tipo_servico = 'assistencia'` E `status_aprovacao != 'cancelada'`
- [ ] Quando `obra_id = null`, nome vem de `agendamentos.cliente_outro` via query separada
- [ ] A troca execução→assistência em agendamento existente persiste (OS atualizada)

---

### FLUXO 4: Viagem com série

1. Coordenador cria agendamento com status "Viagem"
2. Replica para Ter-Sex (4 dias) → todos com mesmo `serie_id`
3. Abre viagens.html → aparece como 1 card (não 4 cards separados)
4. Preenche cidade, saldo de refeição (ex: R$80/pessoa), marca "Hospedagem" e digita "Casa própria"
5. Salva → Stats mostram: 1 viagem | Valor Ref = R$80 × 2 pessoas × 4 dias = R$640
6. Gera PDF da viagem → mostra período, técnicos, hospedagem, cálculo de alimentação, assinatura gestor
7. Gera PDF da semana → paisagem A4, linha de total alinha com a tabela, assinatura no rodapé

Verificar:
- [ ] Viagens agrupam por `serie_id` (não por agendamento individual)
- [ ] `hotel=false && hotel_obs` = hospedagem (não conta como diária)
- [ ] PDF individual: sem assinatura de técnico, sem campo "Serviço"
- [ ] PDF semana: TW=268mm (linha total alinha com tabela)
- [ ] Stats "Diárias de Hotel" = 0 (hospedagem não conta)

---

### FLUXO 5: Excluir agendamento

1. Coordenador abre agendamento existente
2. Clica "Excluir" → modal de confirmação
3. Confirma → agendamento deletado
4. OS vinculada fica com `status_aprovacao = 'cancelada'` (não deletada)
5. supervisor.html não mostra mais a OS cancelada
6. assistencias.html não mostra mais a OS cancelada

Verificar:
- [ ] OS não é deletada, apenas `status_aprovacao = 'cancelada'`
- [ ] Histórico do número de OS preservado
- [ ] supervisor.html e assistencias.html filtram `neq('status_aprovacao', 'cancelada')`

---

### FLUXO 6: Pendências

1. Coordenador abre pendencias.html
2. Vê abas: Cabeamento | Elétrica | Áudio e Vídeo | Automação | Regional Norte
3. Clica em uma pendência → abre modal de edição
4. Muda status (4 botões na 1ª linha, 4 na 2ª linha)
5. Clica "Criar agenda" → redireciona para agenda com dados pré-preenchidos
6. Salva agenda → voltando para pendências, `data_marcada` foi atualizada

Verificar:
- [ ] Abas na ordem correta (não alfabética)
- [ ] Botões de ação: grid 4×2 (não flex bagunçado)
- [ ] "Criar agenda" → parâmetros corretos na URL da agenda

---

## PARTE 3 — FUNCIONALIDADES SECUNDÁRIAS

### PDF de Estoque (agenda.html)
- [ ] Botão "Estoque" gera PDF semanal em portrait A4
- [ ] Seções separadas: VIAGENS (verde), CONFIRMADOS (azul), NÃO CONFIRMADOS (amarelo)
- [ ] Nomes completos dos técnicos nas linhas

### Disparo WhatsApp / Imagem do dia (agenda.html)
- [ ] Botão "Disparar" gera imagem da agenda do dia filtrado pela equipe ativa
- [ ] Técnicos bloqueados NÃO aparecem na imagem
- [ ] Nome da equipe no cabeçalho da imagem

### Auto-refresh colaborativo
- [ ] agenda.html, supervisor.html, os.html, assistencias.html atualizam automaticamente a cada N segundos
- [ ] Atualiza também ao focar a aba (visibilitychange)

### Bloqueios de técnicos
- [ ] Coordenador pode bloquear técnico por período com motivo
- [ ] Técnico bloqueado não aparece no PDF do disparo do dia
- [ ] Ao tentar selecionar técnico bloqueado no modal, exibe aviso

### Anotações diárias
- [ ] Coordenador pode adicionar anotação num dia da agenda
- [ ] Anotação fica visível na grade

---

## PARTE 4 — VERIFICAÇÕES DE SEGURANÇA BÁSICA

- [ ] Técnico não consegue acessar supervisor.html diretamente via URL
- [ ] Técnico não consegue acessar admin.html diretamente via URL
- [ ] Usuário deslogado → redireciona para login.html
- [ ] Sem tokens, chaves de API ou segredos hardcoded no HTML/JS do frontend
  (Supabase URL e anon key são públicos por design, mas nenhuma service_role key)

---

## PARTE 5 — DADOS MESTRES (PRÉ-OPERAÇÃO)

Verificar se estes dados já estão no banco (consultar com o dono do sistema):
- [ ] Técnicos cadastrados com nomes completos no admin
- [ ] Equipes cadastradas: Cabeamento(1), Elétrica(2), Áudio e Vídeo(3), Automação(4), Regional Norte(5)
- [ ] Técnicos vinculados às equipes corretas (tabela `tecnico_equipes`)
- [ ] Obras cadastradas e com status correto (não bloqueado)
- [ ] CPF dos técnicos preenchido (necessário para PDF de estoque)
- [ ] Usuários criados com roles corretos para cada colaborador
- [ ] Dias feriados/bloqueados da próxima semana já marcados (se necessário)

---

## FORMATO DO RELATÓRIO

Produza um relatório objetivo neste formato:

---

# RELATÓRIO DE PRONTIDÃO PARA PRODUÇÃO — SAOS
**Data:** [data]

## 🚦 SEMÁFORO GERAL
🔴 NÃO PRONTO — há bugs críticos que impedem a operação
🟡 ATENÇÃO — pronto com ressalvas, corrigir antes de entregar aos técnicos
🟢 PRONTO — pode entrar em produção

## 🔴 BLOQUEADORES (impedem operação)
[Para cada um:]
**Funcionalidade afetada:** [nome]
**O que falha:** [descrição objetiva]
**Onde no código:** arquivo.html linha NNN
**Correção:** [instrução direta]

## 🟡 IMPORTANTE (não bloqueia, mas gera confusão no uso real)
[idem]

## ✅ FUNCIONANDO CORRETAMENTE
[Lista resumida por fluxo]

## 📋 CHECKLIST DE DADOS MESTRES
[O que falta cadastrar antes de entregar]

## 🚀 RECOMENDAÇÃO FINAL
[2-3 frases: pode entregar? o que fazer antes?]

---

## INSTRUÇÕES PARA O AUDITOR

1. Leia todos os arquivos citados no CONTEXT_BACKUP.md antes de começar.
2. Simule mentalmente cada fluxo como se fosse um usuário real sem conhecimento técnico.
3. Foque em: dados que podem ser perdidos, telas que podem quebrar, ações sem feedback.
4. NÃO corrija nada — apenas reporte.
5. Se algo não puder ser verificado apenas lendo o código (ex: dados no banco), marque como
   "Requer teste manual" e descreva o que testar.
6. Priorize pelos técnicos de campo: o que eles fazem no dia a dia (os.html) é mais crítico
   que funcionalidades administrativas.
7. Seja direto: "funciona" ou "não funciona" — evite "pode ser que".
```
