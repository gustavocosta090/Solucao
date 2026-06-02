-- SAOS-AUDIT: build 2026-06-01 pós-auditoria
-- Seed de equipes — rode UMA VEZ no SQL Editor do Supabase

INSERT INTO public.equipes (nome)
SELECT nome FROM (VALUES
  ('Cabeamento'),
  ('Elétrica'),
  ('Áudio e Vídeo'),
  ('Automação'),
  ('Regional Norte'),
  ('Vistoria'),
  ('Gestão'),
  ('Projetos'),
  ('Comercial')
) AS v(nome)
WHERE NOT EXISTS (
  SELECT 1 FROM public.equipes e WHERE e.nome = v.nome
);

-- Verificação: exibe todas as equipes cadastradas
SELECT id, nome FROM public.equipes ORDER BY nome;
