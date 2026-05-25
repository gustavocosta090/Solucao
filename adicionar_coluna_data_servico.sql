-- ============================================================
-- Passo 1: Adicionar coluna data_servico na tabela ordens_de_servico
-- Execute no SQL Editor do Supabase
-- ============================================================

ALTER TABLE ordens_de_servico
ADD COLUMN IF NOT EXISTS data_servico DATE;

-- ============================================================
-- Passo 2: Preencher data_servico nas OS já existentes
-- (usa a data de criação como referência)
-- ============================================================

UPDATE ordens_de_servico
SET data_servico = DATE(criado_em)
WHERE data_servico IS NULL AND criado_em IS NOT NULL;

-- ============================================================
-- Passo 3: Verificar resultado
-- ============================================================

SELECT
  o.id,
  t.nome AS tecnico,
  ob.nome_cliente AS obra,
  o.data_servico,
  o.status_aprovacao,
  o.criado_em
FROM ordens_de_servico o
LEFT JOIN tecnicos t ON t.id = o.tecnico_id
LEFT JOIN obras ob ON ob.id = o.obra_id
ORDER BY o.criado_em DESC;
