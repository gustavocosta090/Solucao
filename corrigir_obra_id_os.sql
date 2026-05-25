-- ============================================================
-- Ver todas as OS com obra_id NULL (as que não aparecem no obra_detail)
-- ============================================================
SELECT
  o.id,
  t.nome AS tecnico,
  o.obra_id,
  o.status_aprovacao,
  o.criado_em
FROM ordens_de_servico o
LEFT JOIN tecnicos t ON t.id = o.tecnico_id
WHERE o.obra_id IS NULL
ORDER BY o.criado_em DESC;

-- ============================================================
-- Ver todas as obras disponíveis para saber qual ID usar
-- ============================================================
SELECT id, nome_cliente, endereco FROM obras ORDER BY nome_cliente;

-- ============================================================
-- Corrigir: vincular cada OS ao obra_id correto
-- Substitua:
--   OS_ID   → pelo id da OS retornada acima (ex: 1)
--   OBRA_ID → pelo id da obra correspondente (ex: 3)
-- ============================================================

-- Exemplo: UPDATE ordens_de_servico SET obra_id = OBRA_ID WHERE id = OS_ID;

-- Se todas as OS sem obra_id pertencem à mesma obra, use:
-- UPDATE ordens_de_servico SET obra_id = OBRA_ID WHERE obra_id IS NULL;

-- ============================================================
-- Confirmar resultado
-- ============================================================
SELECT
  o.id,
  t.nome AS tecnico,
  ob.nome_cliente AS obra,
  o.obra_id,
  o.status_aprovacao
FROM ordens_de_servico o
LEFT JOIN tecnicos t ON t.id = o.tecnico_id
LEFT JOIN obras ob ON ob.id = o.obra_id
ORDER BY o.criado_em DESC;
