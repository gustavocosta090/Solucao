-- Supabase RLS baseline - Solução Técnica
-- Rode no SQL Editor do Supabase depois de conferir nomes de colunas/tabelas.
-- Objetivo: usuários logados leem o que precisam; escrita fica limitada por perfil.

drop function if exists public.has_app_role(text[]);
drop function if exists public.current_app_role();
drop function if exists public.current_tecnico_id();

create function public.current_tecnico_id()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.tecnicos
  where auth_user_id = auth.uid()
  limit 1
$$;

create function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.tecnicos
  where auth_user_id = auth.uid()
  limit 1
$$;

create function public.has_app_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = any(allowed_roles), false)
$$;

alter table public.tecnicos enable row level security;
alter table public.tecnico_equipes enable row level security;
alter table public.obras enable row level security;
alter table public.consultores enable row level security;
alter table public.agendamentos enable row level security;
alter table public.ordens_de_servico enable row level security;
alter table public.pendencias enable row level security;
alter table public.agendamentos_vistoria enable row level security;
alter table public.relatorios_vistoria enable row level security;

drop policy if exists "tecnicos_select" on public.tecnicos;
create policy "tecnicos_select" on public.tecnicos
for select to authenticated
using (
  auth_user_id = auth.uid()
  or public.has_app_role(array['coordenador','supervisor','agendamento','coordenador_projetos','gerente_comercial'])
);

drop policy if exists "tecnicos_admin_write" on public.tecnicos;
create policy "tecnicos_admin_write" on public.tecnicos
for all to authenticated
using (public.has_app_role(array['coordenador']))
with check (public.has_app_role(array['coordenador']));

drop policy if exists "tecnico_equipes_select" on public.tecnico_equipes;
create policy "tecnico_equipes_select" on public.tecnico_equipes
for select to authenticated
using (true);

drop policy if exists "tecnico_equipes_admin_write" on public.tecnico_equipes;
create policy "tecnico_equipes_admin_write" on public.tecnico_equipes
for all to authenticated
using (public.has_app_role(array['coordenador','supervisor']))
with check (public.has_app_role(array['coordenador','supervisor']));

drop policy if exists "obras_select" on public.obras;
create policy "obras_select" on public.obras
for select to authenticated
using (true);

drop policy if exists "obras_management_write" on public.obras;
create policy "obras_management_write" on public.obras
for all to authenticated
using (public.has_app_role(array['coordenador','supervisor','agendamento','gerente_comercial','coordenador_projetos','projetista']))
with check (public.has_app_role(array['coordenador','supervisor','agendamento','gerente_comercial','coordenador_projetos','projetista']));

drop policy if exists "consultores_select" on public.consultores;
create policy "consultores_select" on public.consultores
for select to authenticated
using (true);

drop policy if exists "consultores_management_write" on public.consultores;
create policy "consultores_management_write" on public.consultores
for all to authenticated
using (public.has_app_role(array['coordenador','supervisor','gerente_comercial']))
with check (public.has_app_role(array['coordenador','supervisor','gerente_comercial']));

drop policy if exists "agendamentos_select" on public.agendamentos;
create policy "agendamentos_select" on public.agendamentos
for select to authenticated
using (true);

drop policy if exists "agendamentos_management_write" on public.agendamentos;
create policy "agendamentos_management_write" on public.agendamentos
for all to authenticated
using (public.has_app_role(array['coordenador','supervisor','agendamento']))
with check (public.has_app_role(array['coordenador','supervisor','agendamento']));

drop policy if exists "os_select_participantes" on public.ordens_de_servico;
create policy "os_select_participantes" on public.ordens_de_servico
for select to authenticated
using (
  public.has_app_role(array['coordenador','supervisor','agendamento','coordenador_projetos','gerente_comercial','projetista'])
  or public.current_tecnico_id() in (tecnico_id, auxiliar_id, auxiliar2_id, auxiliar3_id)
);

drop policy if exists "os_insert_participantes" on public.ordens_de_servico;
create policy "os_insert_participantes" on public.ordens_de_servico
for insert to authenticated
with check (
  public.has_app_role(array['coordenador','supervisor','agendamento'])
  or public.current_tecnico_id() in (tecnico_id, auxiliar_id, auxiliar2_id, auxiliar3_id)
);

drop policy if exists "os_update_participantes" on public.ordens_de_servico;
create policy "os_update_participantes" on public.ordens_de_servico
for update to authenticated
using (
  public.has_app_role(array['coordenador','supervisor','agendamento'])
  or public.current_tecnico_id() in (tecnico_id, auxiliar_id, auxiliar2_id, auxiliar3_id)
)
with check (
  public.has_app_role(array['coordenador','supervisor','agendamento'])
  or public.current_tecnico_id() in (tecnico_id, auxiliar_id, auxiliar2_id, auxiliar3_id)
);

drop policy if exists "os_delete_management" on public.ordens_de_servico;
create policy "os_delete_management" on public.ordens_de_servico
for delete to authenticated
using (public.has_app_role(array['coordenador','supervisor','agendamento']));

drop policy if exists "pendencias_select" on public.pendencias;
create policy "pendencias_select" on public.pendencias
for select to authenticated
using (true);

drop policy if exists "pendencias_management_write" on public.pendencias;
create policy "pendencias_management_write" on public.pendencias
for all to authenticated
using (public.has_app_role(array['coordenador','supervisor','agendamento']))
with check (public.has_app_role(array['coordenador','supervisor','agendamento']));

drop policy if exists "agendamentos_vistoria_select" on public.agendamentos_vistoria;
create policy "agendamentos_vistoria_select" on public.agendamentos_vistoria
for select to authenticated
using (true);

drop policy if exists "agendamentos_vistoria_management_write" on public.agendamentos_vistoria;
create policy "agendamentos_vistoria_management_write" on public.agendamentos_vistoria
for all to authenticated
using (public.has_app_role(array['coordenador','supervisor','agendamento']))
with check (public.has_app_role(array['coordenador','supervisor','agendamento']));

drop policy if exists "relatorios_vistoria_select" on public.relatorios_vistoria;
create policy "relatorios_vistoria_select" on public.relatorios_vistoria
for select to authenticated
using (
  public.has_app_role(array['coordenador','supervisor','agendamento','coordenador_projetos','gerente_comercial'])
  or vistoriador_id = public.current_tecnico_id()
);

drop policy if exists "relatorios_vistoria_insert_management" on public.relatorios_vistoria;
create policy "relatorios_vistoria_insert_management" on public.relatorios_vistoria
for insert to authenticated
with check (
  public.has_app_role(array['coordenador','supervisor','agendamento'])
  or vistoriador_id = public.current_tecnico_id()
);

drop policy if exists "relatorios_vistoria_update_participante" on public.relatorios_vistoria;
create policy "relatorios_vistoria_update_participante" on public.relatorios_vistoria
for update to authenticated
using (
  public.has_app_role(array['coordenador','supervisor','agendamento'])
  or vistoriador_id = public.current_tecnico_id()
)
with check (
  public.has_app_role(array['coordenador','supervisor','agendamento'])
  or vistoriador_id = public.current_tecnico_id()
);

drop policy if exists "relatorios_vistoria_delete_management" on public.relatorios_vistoria;
create policy "relatorios_vistoria_delete_management" on public.relatorios_vistoria
for delete to authenticated
using (public.has_app_role(array['coordenador','supervisor','agendamento']));

-- Storage usado pelos relatórios de vistoria.
-- Se o bucket tiver outro nome, ajuste 'fotos-os'.
drop policy if exists "storage_fotos_os_select" on storage.objects;
create policy "storage_fotos_os_select" on storage.objects
for select to authenticated
using (bucket_id = 'fotos-os');

drop policy if exists "storage_fotos_os_insert" on storage.objects;
create policy "storage_fotos_os_insert" on storage.objects
for insert to authenticated
with check (bucket_id = 'fotos-os');
