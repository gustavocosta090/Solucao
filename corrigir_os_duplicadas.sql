-- ============================================================
-- SCRIPT: Corrigir OS duplicadas (mesmo agendamento + mesmo técnico)
-- Causa: bug no salvar edição de agenda (agenda.html) que sobrescrevia
-- o tecnico_id de uma linha de OS aleatória em vez de reconciliar
-- corretamente com a equipe do agendamento (corrigido em build 2026-07-22a).
-- Este script limpa os registros JÁ duplicados por esse bug, criados
-- ANTES da correção. Execute no SQL Editor do Supabase, um bloco por vez.
-- ============================================================

-- ============================================================
-- 1. Ver todas as duplicatas: mesmo agendamento_id + mesmo tecnico_id,
--    entre OS que não estão canceladas.
-- ============================================================
SELECT
  o.agendamento_id,
  o.tecnico_id,
  t.nome AS tecnico,
  o.numero_os,
  COUNT(*) AS qtd,
  ARRAY_AGG(o.id ORDER BY o.id)                AS ids,
  ARRAY_AGG(o.status_aprovacao ORDER BY o.id)  AS statuses,
  ARRAY_AGG(o.data_servico ORDER BY o.id)      AS datas
FROM ordens_de_servico o
LEFT JOIN tecnicos t ON t.id = o.tecnico_id
WHERE o.status_aprovacao IS DISTINCT FROM 'cancelada'
  AND o.agendamento_id IS NOT NULL
GROUP BY o.agendamento_id, o.tecnico_id, t.nome, o.numero_os
HAVING COUNT(*) > 1
ORDER BY o.agendamento_id;

-- ============================================================
-- 2. Ver o detalhe completo de cada linha duplicada (pra conferir
--    à mão antes de aplicar o fix — qual é a "boa" e qual é a "vazia").
-- ============================================================
SELECT
  o.id, o.agendamento_id, o.tecnico_id, t.nome AS tecnico,
  o.numero_os, o.data_servico, o.status_aprovacao,
  o.servicos_realizados, o.fotos_urls, o.criado_em
FROM ordens_de_servico o
LEFT JOIN tecnicos t ON t.id = o.tecnico_id
WHERE o.status_aprovacao IS DISTINCT FROM 'cancelada'
  AND o.agendamento_id IS NOT NULL
  AND (o.agendamento_id, o.tecnico_id) IN (
    SELECT agendamento_id, tecnico_id
    FROM ordens_de_servico
    WHERE status_aprovacao IS DISTINCT FROM 'cancelada'
      AND agendamento_id IS NOT NULL
    GROUP BY agendamento_id, tecnico_id
    HAVING COUNT(*) > 1
  )
ORDER BY o.agendamento_id, o.id;

-- ============================================================
-- 3. FIX automático (só o caso seguro e inequívoco):
--    grupo com EXATAMENTE 1 linha concluída/aprovada (tem relatório)
--    e o resto pendente/reprovada/sem status (vazia, "sobra" do bug)
--    -> cancela as vazias, preserva a que tem o relatório de verdade.
--    Rode primeiro como SELECT (abaixo) pra conferir o que seria cancelado.
-- ============================================================
WITH grupos AS (
  SELECT
    agendamento_id, tecnico_id,
    COUNT(*) FILTER (WHERE status_aprovacao IN ('concluida','aprovada')) AS qtd_concluida,
    COUNT(*) AS qtd_total
  FROM ordens_de_servico
  WHERE status_aprovacao IS DISTINCT FROM 'cancelada'
    AND agendamento_id IS NOT NULL
  GROUP BY agendamento_id, tecnico_id
  HAVING COUNT(*) > 1
)
SELECT o.id, o.agendamento_id, o.tecnico_id, o.numero_os, o.status_aprovacao, o.criado_em
FROM ordens_de_servico o
JOIN grupos g ON g.agendamento_id = o.agendamento_id AND g.tecnico_id = o.tecnico_id
WHERE g.qtd_concluida = 1
  AND o.status_aprovacao NOT IN ('concluida', 'aprovada')
ORDER BY o.agendamento_id;

-- Depois de conferir a SELECT acima, descomente e rode o UPDATE:
--
-- WITH grupos AS (
--   SELECT
--     agendamento_id, tecnico_id,
--     COUNT(*) FILTER (WHERE status_aprovacao IN ('concluida','aprovada')) AS qtd_concluida
--   FROM ordens_de_servico
--   WHERE status_aprovacao IS DISTINCT FROM 'cancelada'
--     AND agendamento_id IS NOT NULL
--   GROUP BY agendamento_id, tecnico_id
--   HAVING COUNT(*) > 1
-- )
-- UPDATE ordens_de_servico o
-- SET status_aprovacao = 'cancelada'
-- FROM grupos g
-- WHERE g.agendamento_id = o.agendamento_id
--   AND g.tecnico_id = o.tecnico_id
--   AND g.qtd_concluida = 1
--   AND o.status_aprovacao NOT IN ('concluida', 'aprovada');

-- ============================================================
-- 4. Grupos AMBÍGUOS (0 concluída entre as duplicatas, ou mais de 1
--    concluída) — não são tocados pelo fix automático acima porque não
--    dá pra saber sozinho qual linha manter. Resolver manualmente.
-- ============================================================
SELECT
  o.agendamento_id, o.tecnico_id, t.nome AS tecnico,
  COUNT(*) AS qtd,
  COUNT(*) FILTER (WHERE o.status_aprovacao IN ('concluida','aprovada')) AS qtd_concluida,
  ARRAY_AGG(o.id ORDER BY o.id) AS ids
FROM ordens_de_servico o
LEFT JOIN tecnicos t ON t.id = o.tecnico_id
WHERE o.status_aprovacao IS DISTINCT FROM 'cancelada'
  AND o.agendamento_id IS NOT NULL
GROUP BY o.agendamento_id, o.tecnico_id, t.nome
HAVING COUNT(*) > 1
   AND COUNT(*) FILTER (WHERE o.status_aprovacao IN ('concluida','aprovada')) <> 1
ORDER BY o.agendamento_id;

-- ============================================================
-- 5. FIX pro subcaso mais comum dos ambíguos: grupo com 0 linhas
--    concluídas (nenhum relatório enviado ainda pra nenhuma das
--    duplicatas). Como os campos comuns (data, endereço, obra, tipo de
--    serviço) são sincronizados em TODAS as linhas do agendamento a cada
--    edição, as duplicatas vazias são clones idênticos — não importa
--    qual sobrevive, não há perda de dado. Mantém a de MENOR id (a
--    original) e cancela as demais (o "clone" gerado pela reatribuição
--    indevida do bug antigo).
--    NÃO cobre grupos com 2+ concluídas — esses continuam precisando de
--    revisão manual (ver query 4 acima).
-- ============================================================

-- 5a. Prévia: o que seria cancelado
WITH grupos AS (
  SELECT
    agendamento_id, tecnico_id,
    COUNT(*) FILTER (WHERE status_aprovacao IN ('concluida','aprovada')) AS qtd_concluida,
    MIN(id) AS id_manter
  FROM ordens_de_servico
  WHERE status_aprovacao IS DISTINCT FROM 'cancelada'
    AND agendamento_id IS NOT NULL
  GROUP BY agendamento_id, tecnico_id
  HAVING COUNT(*) > 1
)
SELECT o.id, o.agendamento_id, o.tecnico_id, o.numero_os, o.status_aprovacao, o.criado_em
FROM ordens_de_servico o
JOIN grupos g ON g.agendamento_id = o.agendamento_id AND g.tecnico_id = o.tecnico_id
WHERE g.qtd_concluida = 0
  AND o.id <> g.id_manter
ORDER BY o.agendamento_id;

-- 5b. Depois de conferir a prévia acima, descomente e rode o UPDATE:
--
-- WITH grupos AS (
--   SELECT
--     agendamento_id, tecnico_id,
--     COUNT(*) FILTER (WHERE status_aprovacao IN ('concluida','aprovada')) AS qtd_concluida,
--     MIN(id) AS id_manter
--   FROM ordens_de_servico
--   WHERE status_aprovacao IS DISTINCT FROM 'cancelada'
--     AND agendamento_id IS NOT NULL
--   GROUP BY agendamento_id, tecnico_id
--   HAVING COUNT(*) > 1
-- )
-- UPDATE ordens_de_servico o
-- SET status_aprovacao = 'cancelada'
-- FROM grupos g
-- WHERE g.agendamento_id = o.agendamento_id
--   AND g.tecnico_id = o.tecnico_id
--   AND g.qtd_concluida = 0
--   AND o.id <> g.id_manter;
