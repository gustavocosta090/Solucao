-- SAOS-AUDIT: build 2026-06-01 pós-auditoria
-- ─────────────────────────────────────────────────────────────
-- SAOS — Índices de performance e constraints de unicidade
-- Execute no Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────

-- ── Índices de performance ───────────────────────────────────────

-- Filtros por data (queries de semana/período)
CREATE INDEX IF NOT EXISTS idx_agendamentos_data
  ON public.agendamentos (data);

-- Joins por técnico nos agendamentos
CREATE INDEX IF NOT EXISTS idx_agendamentos_tecnico_id
  ON public.agendamentos (tecnico_id);

CREATE INDEX IF NOT EXISTS idx_agendamentos_auxiliares
  ON public.agendamentos (auxiliar_id, auxiliar2_id, auxiliar3_id);

-- OS: join pelo agendamento e pelo técnico
CREATE INDEX IF NOT EXISTS idx_os_agendamento_id
  ON public.ordens_de_servico (agendamento_id);

CREATE INDEX IF NOT EXISTS idx_os_tecnico_id
  ON public.ordens_de_servico (tecnico_id);

CREATE INDEX IF NOT EXISTS idx_os_data_servico
  ON public.ordens_de_servico (data_servico);

-- Relatórios de assistência: join pela OS
CREATE INDEX IF NOT EXISTS idx_relatorios_assistencia_os_id
  ON public.relatorios_assistencia (os_id);

-- ── Constraints de unicidade ────────────────────────────────────
-- Usar CREATE UNIQUE INDEX porque ADD CONSTRAINT não suporta IF NOT EXISTS no PostgreSQL

-- Evita equipes duplicadas pelo nome
CREATE UNIQUE INDEX IF NOT EXISTS equipes_nome_unique
  ON public.equipes (nome);

-- Evita técnicos com o mesmo e-mail
CREATE UNIQUE INDEX IF NOT EXISTS tecnicos_email_unique
  ON public.tecnicos (email);

-- ── Tabela de auditoria ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.audit_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  tabela      TEXT NOT NULL,
  operacao    TEXT NOT NULL CHECK (operacao IN ('INSERT','UPDATE','DELETE')),
  registro_id TEXT,
  dados_antes JSONB,
  dados_depois JSONB,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id   ON public.audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_tabela    ON public.audit_log (tabela);
CREATE INDEX IF NOT EXISTS idx_audit_log_criado_em ON public.audit_log (criado_em DESC);

-- RLS: apenas coordenador pode ver
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coordenador pode ler audit_log" ON public.audit_log;
CREATE POLICY "coordenador pode ler audit_log"
  ON public.audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tecnicos t
      WHERE t.auth_user_id = auth.uid()
        AND t.role = 'coordenador'
    )
  );

-- ── Histórico de status de OS ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.os_historico (
  id        BIGSERIAL PRIMARY KEY,
  os_id     BIGINT REFERENCES public.ordens_de_servico (id) ON DELETE CASCADE,
  user_id   UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  status_anterior TEXT,
  status_novo     TEXT,
  observacao      TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_os_historico_os_id
  ON public.os_historico (os_id);

ALTER TABLE public.os_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "autenticados podem ver historico de OS" ON public.os_historico;
CREATE POLICY "autenticados podem ver historico de OS"
  ON public.os_historico FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "autenticados podem inserir historico de OS" ON public.os_historico;
CREATE POLICY "autenticados podem inserir historico de OS"
  ON public.os_historico FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
