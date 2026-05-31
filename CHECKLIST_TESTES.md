# SAOS — Checklist de Testes Manual

Executar antes de cada deploy em produção.

---

## 1. Login e Sessão

- [ ] Login com usuário/senha corretos redireciona para a página correta por role
- [ ] Login com senha errada mostra mensagem de erro (não redireciona)
- [ ] Login com senha `123456` mostra modal de troca de senha obrigatória (sem botão "Agora não")
- [ ] Modal de troca de senha: senha < 6 caracteres mostra aviso
- [ ] Modal de troca de senha: senhas diferentes mostram aviso
- [ ] Após salvar nova senha: usuário é redirecionado corretamente
- [ ] Fechar aba e reabrir: sessão ativa redireciona para página correta (não pede login de novo)
- [ ] Após expirar sessão: redirecionado para login.html automaticamente

---

## 2. Agenda Técnica (`agenda.html`)

- [ ] Grade da semana carrega e exibe agendamentos corretamente
- [ ] Navegar semana anterior / próxima semana funciona
- [ ] Filtro de equipe "Todas" exibe todos os agendamentos
- [ ] Filtro por equipe específica filtra corretamente (botões vêm do banco, não hardcoded)
- [ ] Criar novo agendamento: validações (obra obrigatória, equipe obrigatória, data obrigatória)
- [ ] Criar agendamento com técnico já agendado no mesmo dia: mostra aviso de conflito (não bloqueia)
- [ ] Editar agendamento: tipo_servico (execução/assistência) é pré-preenchido corretamente
- [ ] Salvar agendamento tipo "assistência": redireciona para assistencia.html
- [ ] Excluir agendamento: pede confirmação, remove da grade

---

## 3. OS — Técnico (`os.html`)

- [ ] Lista de agendamentos dos últimos 60 dias carrega corretamente
- [ ] Agendamentos concluídos (OS feita) aparecem com badge correto
- [ ] Clicar em agendamento pendente abre formulário de OS
- [ ] Formulário pré-preenche cliente, data, serviço
- [ ] Adicionar foto: pré-visualização aparece na grid
- [ ] Tentar fechar aba com fotos selecionadas: pede confirmação (beforeunload)
- [ ] Remover foto da grid: funciona corretamente
- [ ] Submeter OS sem equipe selecionada: mostra erro
- [ ] Submeter OS completa: salva, gera PDF, redireciona para tela de sucesso
- [ ] Upload de fotos: progresso é exibido por foto (ex: "1/3", "✓ 1/3")

---

## 4. Supervisor (`supervisor.html`)

- [ ] Aba "Agendamentos" lista agendamentos da semana atual
- [ ] Aba "Assistências" lista relatórios com valores corretos (R$ 2,2k ≠ R$ 2k)
- [ ] Filtros de período e equipe funcionam
- [ ] Clicar em OS abre detalhes

---

## 5. Assistência Técnica (`assistencia.html`)

- [ ] Lista todas as OSs de assistência com status correto
- [ ] Filtros de técnico, período e status funcionam
- [ ] Abrir OS sem relatório: botão "PDF" não aparece
- [ ] Preencher e salvar relatório: toast de sucesso, lista atualiza
- [ ] Abrir OS com relatório existente: formulário pré-preenchido, botão "PDF" aparece
- [ ] Clicar "PDF": baixa arquivo com nome `relatorio_assistencia_Cliente_DD-MM-YYYY.pdf`
- [ ] PDF gerado contém: cliente, técnico, data, financeiro, observações, status

---

## 6. Admin (`admin.html`)

- [ ] Lista de usuários carrega com nome, role e equipes
- [ ] Criar usuário: preencher campos, selecionar equipe(s), salvar
- [ ] Usuário criado aparece na lista com equipes corretas
- [ ] Editar usuário: equipes pré-selecionadas corretamente
- [ ] Salvar edição: equipes atualizadas (verificar no banco)
- [ ] Erro ao salvar equipes: mensagem de erro exibida (não silencioso)
- [ ] Demitir usuário: pede confirmação, usuário sai da lista

---

## 7. Dashboard (`dashboard.html`)

- [ ] Cards de stats carregam (total obras, OSs, assistências)
- [ ] Valores em BRL exibem corretamente (R$ 1,5k, R$ 10k — nunca truncam)
- [ ] Gráficos renderizam sem erro no console

---

## 8. Segurança básica

- [ ] Acessar `admin.html` como técnico: redireciona ou bloqueia
- [ ] Acessar `os.html` como coordenador: redireciona para supervisor
- [ ] Console do navegador sem erros críticos em todas as páginas acima

---

## Resultado

| Fluxo | Status | Observação |
|-------|--------|------------|
| Login | ☐ OK / ☐ Falha | |
| Agenda | ☐ OK / ☐ Falha | |
| OS Técnico | ☐ OK / ☐ Falha | |
| Supervisor | ☐ OK / ☐ Falha | |
| Assistência | ☐ OK / ☐ Falha | |
| Admin | ☐ OK / ☐ Falha | |
| Dashboard | ☐ OK / ☐ Falha | |
| Segurança | ☐ OK / ☐ Falha | |

**Aprovado por:** _________________ **Data:** ___/___/______
