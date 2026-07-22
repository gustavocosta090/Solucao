-- ============================================================
-- FIX: Remover/Demitir técnico não funcionava
-- Causa: fix_rls_recursao.sql (rodado antes) zerou as políticas de
-- "tecnicos" e recriou sem nenhuma política de DELETE — Postgres
-- bloqueia silenciosamente (sem erro) qualquer exclusão pra todo
-- mundo. E "tecnico_equipes" ainda só liberava coordenador/supervisor,
-- sem admin_geral/agendamento (removerTecnico apaga daqui primeiro).
-- Rode este SQL INTEIRO de uma vez no SQL Editor do Supabase.
-- ============================================================

-- ── Garante que a função auxiliar existe (idempotente) ───────
CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.tecnicos WHERE auth_user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.has_app_role(allowed_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(public.current_app_role() = any(allowed_roles), false)
$$;

-- ── tecnicos ────────────────────────────────────────────────
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'tecnicos' AND schemaname = 'public'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.tecnicos', pol.policyname); END LOOP;
END $$;

CREATE POLICY "tecnicos_select_autenticados" ON public.tecnicos
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "tecnicos_insert_gestao" ON public.tecnicos
  FOR INSERT TO authenticated
  WITH CHECK (public.has_app_role(array['coordenador','agendamento','admin_geral']));

CREATE POLICY "tecnicos_update_gestao_ou_proprio" ON public.tecnicos
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid() OR public.has_app_role(array['coordenador','agendamento','admin_geral']))
  WITH CHECK (auth_user_id = auth.uid() OR public.has_app_role(array['coordenador','agendamento','admin_geral']));

CREATE POLICY "tecnicos_delete_gestao" ON public.tecnicos
  FOR DELETE TO authenticated
  USING (public.has_app_role(array['coordenador','agendamento','admin_geral']));

-- ── tecnico_equipes ─────────────────────────────────────────
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'tecnico_equipes' AND schemaname = 'public'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.tecnico_equipes', pol.policyname); END LOOP;
END $$;

CREATE POLICY "tecnico_equipes_select_autenticados" ON public.tecnico_equipes
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "tecnico_equipes_write_gestao" ON public.tecnico_equipes
  FOR ALL TO authenticated
  USING (public.has_app_role(array['coordenador','supervisor','agendamento','admin_geral']))
  WITH CHECK (public.has_app_role(array['coordenador','supervisor','agendamento','admin_geral']));

-- ── Confirma resultado ──────────────────────────────────────
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('tecnicos','tecnico_equipes')
ORDER BY tablename, cmd;
