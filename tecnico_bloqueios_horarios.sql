-- SAOS - suporte a bloqueios de tecnico por horario
-- Execute no Supabase SQL Editor.

alter table public.tecnico_bloqueios
  add column if not exists hora_inicio time,
  add column if not exists hora_fim time;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tecnico_bloqueios_horario_par_check'
      and conrelid = 'public.tecnico_bloqueios'::regclass
  ) then
    alter table public.tecnico_bloqueios
      add constraint tecnico_bloqueios_horario_par_check
      check (
        (hora_inicio is null and hora_fim is null)
        or (hora_inicio is not null and hora_fim is not null and hora_inicio < hora_fim)
      );
  end if;
end $$;

create index if not exists idx_tecnico_bloqueios_tecnico_periodo
  on public.tecnico_bloqueios (tecnico_id, data_inicio, data_fim);

notify pgrst, 'reload schema';
