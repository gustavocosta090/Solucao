-- ============================================================
-- 1. Adicionar colunas auxiliar2_id e auxiliar3_id na tabela agendamentos
-- ============================================================
ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS auxiliar2_id INTEGER REFERENCES tecnicos(id),
  ADD COLUMN IF NOT EXISTS auxiliar3_id INTEGER REFERENCES tecnicos(id);

-- ============================================================
-- 2. Garantir que a tabela agendamentos tem RLS habilitado
--    e política correta para usuários autenticados
-- ============================================================
ALTER TABLE agendamentos ENABLE ROW LEVEL SECURITY;

-- Remove políticas existentes (se houver) e recria limpas
DROP POLICY IF EXISTS "allow_authenticated_select" ON agendamentos;
DROP POLICY IF EXISTS "allow_authenticated_insert" ON agendamentos;
DROP POLICY IF EXISTS "allow_authenticated_update" ON agendamentos;
DROP POLICY IF EXISTS "allow_authenticated_delete" ON agendamentos;

-- Qualquer usuário autenticado pode ler, criar, editar e excluir agendamentos
CREATE POLICY "allow_authenticated_select" ON agendamentos
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "allow_authenticated_insert" ON agendamentos
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "allow_authenticated_update" ON agendamentos
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "allow_authenticated_delete" ON agendamentos
  FOR DELETE USING (auth.role() = 'authenticated');

-- ============================================================
-- 3. Confirmar resultado
-- ============================================================
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'agendamentos'
ORDER BY ordinal_position;
