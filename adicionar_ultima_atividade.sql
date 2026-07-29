-- ============================================================
-- Coluna de atividade real (não confundir com last_sign_in_at do
-- Supabase Auth, que só muda quando a pessoa reautentica de verdade —
-- sessão fica viva por semanas via refresh token, então last_sign_in_at
-- não reflete uso atual do sistema).
-- Execute no SQL Editor do Supabase.
-- ============================================================

ALTER TABLE public.tecnicos
  ADD COLUMN IF NOT EXISTS ultima_atividade timestamptz;
