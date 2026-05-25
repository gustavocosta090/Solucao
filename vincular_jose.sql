-- ============================================================
-- Vincular a conta do José ao registro na tabela tecnicos
-- Execute no SQL Editor do Supabase
-- ============================================================

-- Passo 1: Descobrir o auth_user_id do José
-- (vai mostrar o UUID da conta criada)
SELECT id, email, created_at
FROM auth.users
WHERE email ILIKE '%jose%'
ORDER BY created_at DESC;

-- ============================================================
-- Passo 2: Vincular
-- Substitua 'UUID_AQUI' pelo ID retornado acima
-- ============================================================

UPDATE tecnicos
SET
  auth_user_id = 'UUID_AQUI',
  email        = 'jose@solucao.com'
WHERE nome = 'Jose'
  AND auth_user_id IS NULL;

-- ============================================================
-- Passo 3: Confirmar
-- ============================================================
SELECT id, nome, role, email, auth_user_id
FROM tecnicos
WHERE nome = 'Jose';
