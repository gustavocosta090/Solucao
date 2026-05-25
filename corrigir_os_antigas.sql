-- ============================================================
-- SCRIPT: Corrigir OS antigas com obra_id = NULL e data_servico = NULL
-- Execute no SQL Editor do Supabase
-- ============================================================

-- 1. Ver as OS que estão com problema (obra_id ou data_servico nulos)
SELECT
  id,
  tecnico_id,
  obra_id,
  data_servico,
  status_aprovacao,
  criado_em
FROM ordens_de_servico
WHERE obra_id IS NULL OR data_servico IS NULL
ORDER BY criado_em DESC;

-- ============================================================
-- 2. Preencher data_servico com a data de criação para OS sem data
-- (isso corrige o filtro de datas no supervisor)
-- ============================================================
UPDATE ordens_de_servico
SET data_servico = DATE(criado_em)
WHERE data_servico IS NULL AND criado_em IS NOT NULL;

-- ============================================================
-- 3. Se você souber o ID da obra, atualize o obra_id manualmente.
-- Exemplo: OS com id=1 pertence à obra com id=5:
--   UPDATE ordens_de_servico SET obra_id = 5 WHERE id = 1;
--
-- Para descobrir os IDs das obras disponíveis:
-- ============================================================
SELECT id, nome_cliente, endereco FROM obras ORDER BY nome_cliente;

-- ============================================================
-- 4. Ver resultado final
-- ============================================================
SELECT
  o.id,
  t.nome AS tecnico,
  ob.nome_cliente AS obra,
  o.obra_id,
  o.data_servico,
  o.status_aprovacao,
  o.criado_em
FROM ordens_de_servico o
LEFT JOIN tecnicos t ON t.id = o.tecnico_id
LEFT JOIN obras ob ON ob.id = o.obra_id
ORDER BY o.criado_em DESC;
