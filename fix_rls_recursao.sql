-- ════════════════════════════════════════════════════════════════
-- FIX CRÍTICO: Remove recursão infinita nas políticas de tecnicos
-- RODE ESTE SQL INTEIRO DE UMA VEZ no Supabase SQL Editor
-- ════════════════════════════════════════════════════════════════

-- 1) Remove TODAS as políticas existentes da tabela tecnicos
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'tecnicos' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON tecnicos', pol.policyname);
  END LOOP;
END $$;

-- 2) Cria políticas limpas SEM recursão (usa apenas auth.uid() e auth.role())
-- Qualquer usuário autenticado pode LER todos os técnicos
CREATE POLICY "leitura_autenticados" ON tecnicos
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Usuário só pode ATUALIZAR seu próprio registro
CREATE POLICY "update_proprio" ON tecnicos
  FOR UPDATE
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- Coordenador pode INSERIR (via service role ou admin)
CREATE POLICY "insert_service" ON tecnicos
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- ════════════════════════════════════════════════════════════════
-- 3) Remove e recria políticas de agendamentos também
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'agendamentos' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON agendamentos', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "agendamentos_autenticados" ON agendamentos
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ════════════════════════════════════════════════════════════════
-- 4) Remove e recria políticas de ordens_de_servico
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'ordens_de_servico' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON ordens_de_servico', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "os_autenticados" ON ordens_de_servico
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ════════════════════════════════════════════════════════════════
-- 5) Confirma que RLS está habilitado nas 3 tabelas
-- ════════════════════════════════════════════════════════════════
ALTER TABLE tecnicos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE agendamentos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordens_de_servico ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════
-- 6) Verifica resultado
-- ════════════════════════════════════════════════════════════════
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE tablename IN ('tecnicos','agendamentos','ordens_de_servico')
ORDER BY tablename, policyname;
