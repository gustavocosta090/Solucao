-- Baseline de RLS para o app Solução Técnica.
-- Revise em staging antes de aplicar em produção.

alter table if exists public.tecnicos enable row level security;
alter table if exists public.obras enable row level security;
alter table if exists public.agendamentos enable row level security;
alter table if exists public.ordens_de_servico enable row level security;
alter table if exists public.consultores enable row level security;
alter table if exists public.tecnico_equipes enable row level security;
alter table if exists public.equipes enable row level security;
alter table if exists public.agendamentos_vistoria enable row level security;
alter table if exists public.relatorios_vistoria enable row level security;

-- Garantir colunas auxiliar2_id e auxiliar3_id em agendamentos e ordens_de_servico (resolve erro 42703)
alter table if exists public.agendamentos
  add column if not exists auxiliar2_id bigint references public.tecnicos(id) on delete set null;
alter table if exists public.agendamentos
  add column if not exists auxiliar3_id bigint references public.tecnicos(id) on delete set null;
alter table if exists public.ordens_de_servico
  add column if not exists auxiliar2_id bigint references public.tecnicos(id) on delete set null;
alter table if exists public.ordens_de_servico
  add column if not exists auxiliar3_id bigint references public.tecnicos(id) on delete set null;

create or replace function public.current_user_role()
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

create or replace function public.current_tecnico_id()
returns integer
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

create or replace function public.is_backoffice()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role(), '') in (
    'coordenador',
    'supervisor',
    'agendamento',
    'coordenador_projetos',
    'gerente_comercial',
    'projetista'
  )
$$;

create or replace function public.current_user_in_agendamento(ag_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.agendamentos a
    where a.id = ag_id
      and public.current_tecnico_id() in (a.tecnico_id, a.auxiliar_id, a.auxiliar2_id, a.auxiliar3_id)
  )
$$;

-- TECNICOS
drop policy if exists "tecnicos_select_authenticated" on public.tecnicos;
create policy "tecnicos_select_authenticated"
on public.tecnicos for select
to authenticated
using (true);

drop policy if exists "tecnicos_update_backoffice" on public.tecnicos;
create policy "tecnicos_update_backoffice"
on public.tecnicos for update
to authenticated
using (public.current_user_role() = 'coordenador')
with check (public.current_user_role() = 'coordenador');

-- OBRAS
drop policy if exists "obras_select_authenticated" on public.obras;
create policy "obras_select_authenticated"
on public.obras for select
to authenticated
using (true);

drop policy if exists "obras_insert_backoffice" on public.obras;
create policy "obras_insert_backoffice"
on public.obras for insert
to authenticated
with check (public.current_user_role() in ('coordenador', 'supervisor'));

drop policy if exists "obras_update_backoffice" on public.obras;
create policy "obras_update_backoffice"
on public.obras for update
to authenticated
using (public.is_backoffice())
with check (public.is_backoffice());

-- AGENDAMENTOS
drop policy if exists "agendamentos_select_visible" on public.agendamentos;
create policy "agendamentos_select_visible"
on public.agendamentos for select
to authenticated
using (
  public.is_backoffice()
  or public.current_tecnico_id() in (tecnico_id, auxiliar_id, auxiliar2_id, auxiliar3_id)
);

drop policy if exists "agendamentos_write_agendamento" on public.agendamentos;
create policy "agendamentos_write_agendamento"
on public.agendamentos for all
to authenticated
using (public.current_user_role() in ('agendamento', 'coordenador', 'supervisor'))
with check (public.current_user_role() in ('agendamento', 'coordenador', 'supervisor'));

-- ORDENS DE SERVICO
drop policy if exists "os_select_visible" on public.ordens_de_servico;
create policy "os_select_visible"
on public.ordens_de_servico for select
to authenticated
using (
  public.is_backoffice()
  or public.current_tecnico_id() in (tecnico_id, auxiliar_id, auxiliar2_id, auxiliar3_id)
);

drop policy if exists "os_insert_visible" on public.ordens_de_servico;
create policy "os_insert_visible"
on public.ordens_de_servico for insert
to authenticated
with check (
  public.is_backoffice()
  or public.current_tecnico_id() in (tecnico_id, auxiliar_id, auxiliar2_id, auxiliar3_id)
  or public.current_user_in_agendamento(agendamento_id)
);

drop policy if exists "os_update_visible" on public.ordens_de_servico;
create policy "os_update_visible"
on public.ordens_de_servico for update
to authenticated
using (
  public.is_backoffice()
  or public.current_tecnico_id() in (tecnico_id, auxiliar_id, auxiliar2_id, auxiliar3_id)
)
with check (
  public.is_backoffice()
  or public.current_tecnico_id() in (tecnico_id, auxiliar_id, auxiliar2_id, auxiliar3_id)
  or public.current_user_in_agendamento(agendamento_id)
);

drop policy if exists "os_delete_backoffice_or_own_pending" on public.ordens_de_servico;
create policy "os_delete_backoffice_or_own_pending"
on public.ordens_de_servico for delete
to authenticated
using (
  public.is_backoffice()
  or (
    status_aprovacao = 'pendente'
    and (
      public.current_tecnico_id() in (tecnico_id, auxiliar_id, auxiliar2_id, auxiliar3_id)
      or public.current_user_in_agendamento(agendamento_id)
    )
  )
);

-- TABELAS DE APOIO
drop policy if exists "consultores_select_authenticated" on public.consultores;
create policy "consultores_select_authenticated"
on public.consultores for select
to authenticated
using (true);

drop policy if exists "equipes_select_authenticated" on public.equipes;
create policy "equipes_select_authenticated"
on public.equipes for select
to authenticated
using (true);

drop policy if exists "tecnico_equipes_select_authenticated" on public.tecnico_equipes;
create policy "tecnico_equipes_select_authenticated"
on public.tecnico_equipes for select
to authenticated
using (true);

-- VISTORIAS
create table if not exists public.agendamentos_vistoria (
  id bigint generated by default as identity primary key,
  obra_id bigint references public.obras(id) on delete set null,
  vistoriador_id bigint references public.tecnicos(id) on delete set null,
  data date not null,
  hora_inicio time,
  confirmado boolean default false,
  viagem boolean default false,
  veiculo text,
  tipo_vistoria text not null check (tipo_vistoria in ('cabeamento','eletrica','audio_video','automacao')),
  objetivo text,
  observacao text,
  criado_em timestamptz default now()
);

create table if not exists public.relatorios_vistoria (
  id bigint generated by default as identity primary key,
  agendamento_vistoria_id bigint references public.agendamentos_vistoria(id) on delete cascade,
  obra_id bigint references public.obras(id) on delete set null,
  vistoriador_id bigint references public.tecnicos(id) on delete set null,
  data_vistoria date,
  tipo_vistoria text not null check (tipo_vistoria in ('cabeamento','eletrica','audio_video','automacao')),
  status text not null default 'pendente' check (status in ('pendente','concluido')),
  objetivo_vistoria text,
  situacao_atual_obra text,
  pontos_positivos text,
  pontos_atencao text,
  inconformidade boolean default false,
  descricao_inconformidade text,
  checklist jsonb default '{}'::jsonb,
  midias_urls jsonb default '[]'::jsonb,
  observacoes text,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now(),
  concluido_em timestamptz
);

alter table if exists public.relatorios_vistoria
add column if not exists midias_urls jsonb default '[]'::jsonb;

alter table public.agendamentos_vistoria enable row level security;
alter table public.relatorios_vistoria enable row level security;

drop policy if exists "ag_vistoria_select_visible" on public.agendamentos_vistoria;
create policy "ag_vistoria_select_visible"
on public.agendamentos_vistoria for select
to authenticated
using (true);

drop policy if exists "ag_vistoria_write_backoffice" on public.agendamentos_vistoria;
create policy "ag_vistoria_write_backoffice"
on public.agendamentos_vistoria for all
to authenticated
using (
  public.current_user_role() in ('agendamento', 'coordenador', 'supervisor', 'projetista', 'gerente_comercial', 'coordenador_projetos')
  or public.current_tecnico_id() = vistoriador_id
)
with check (
  public.current_user_role() in ('agendamento', 'coordenador', 'supervisor', 'projetista', 'gerente_comercial', 'coordenador_projetos')
  or public.current_tecnico_id() = vistoriador_id
);

drop policy if exists "rel_vistoria_select_visible" on public.relatorios_vistoria;
create policy "rel_vistoria_select_visible"
on public.relatorios_vistoria for select
to authenticated
using (true);

drop policy if exists "rel_vistoria_insert_backoffice" on public.relatorios_vistoria;
create policy "rel_vistoria_insert_backoffice"
on public.relatorios_vistoria for insert
to authenticated
with check (
  public.current_user_role() in ('agendamento', 'coordenador', 'supervisor', 'projetista', 'gerente_comercial', 'coordenador_projetos')
  or public.current_tecnico_id() = vistoriador_id
);

drop policy if exists "rel_vistoria_update_visible" on public.relatorios_vistoria;
create policy "rel_vistoria_update_visible"
on public.relatorios_vistoria for update
to authenticated
using (public.is_backoffice() or public.current_tecnico_id() = vistoriador_id)
with check (public.is_backoffice() or public.current_tecnico_id() = vistoriador_id);
