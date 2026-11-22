-- Iris 초기 스키마 — PRD/02_DATA_MODEL.md
-- 규칙: 모든 테이블은 RLS 를 켜고, @ba-dream.com 멤버만 읽고 쓴다. 변경은 항상 새 마이그레이션 파일로.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 워크스페이스 · 멤버
-- ---------------------------------------------------------------------------
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  allowed_email_domain text not null,
  created_at timestamptz not null default now()
);

insert into public.workspaces (name, allowed_email_domain) values ('바드림', 'ba-dream.com');

create table public.members (
  id uuid primary key references auth.users (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id),
  email text not null unique,
  name text not null,
  role text not null default 'planner' check (role in ('planner', 'designer', 'developer')),
  avatar_url text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- 가입 도메인 제한: 허용 도메인이 아닌 메일은 auth.users 에 들어가기 전에 막는다
create or replace function public.enforce_email_domain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ws public.workspaces;
begin
  select * into ws from public.workspaces order by created_at limit 1;
  if ws.id is null or split_part(lower(new.email), '@', 2) <> lower(ws.allowed_email_domain) then
    raise exception '회사 이메일(@%)로만 로그인할 수 있어요.', coalesce(ws.allowed_email_domain, 'ba-dream.com');
  end if;
  return new;
end;
$$;

create trigger enforce_email_domain
before insert on auth.users
for each row execute function public.enforce_email_domain();

-- 가입하면 멤버 행을 만든다 (이름은 메일 앞부분으로 시작, 나중에 바꿀 수 있음)
create or replace function public.handle_new_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.members (id, workspace_id, email, name)
  select new.id, w.id, new.email, split_part(new.email, '@', 1)
  from public.workspaces w
  order by w.created_at
  limit 1;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_member();

-- 지금 로그인한 사람이 멤버인지 (모든 RLS 정책이 이 함수 하나를 씀)
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.members m where m.id = auth.uid());
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.members m where m.id = auth.uid() and m.is_admin);
$$;

-- ---------------------------------------------------------------------------
-- 프로젝트 · 페이지 · 화면
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  name text not null,
  description text,
  kind text not null default 'app' check (kind in ('app', 'web', 'detail_page')),
  status text not null default 'planning' check (status in ('planning', 'designing', 'developing', 'done')),
  cover_screen_id uuid,
  created_by uuid not null references public.members (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  viewport jsonb
);

create table public.screens (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages (id) on delete cascade,
  name text not null,
  source text not null check (source in ('figma', 'native')),
  x double precision not null default 0,
  y double precision not null default 0,
  width double precision not null default 375,
  height double precision not null default 812,
  device text,
  layers jsonb,
  figma_file_key text,
  figma_node_id text,
  figma_url text,
  thumbnail_path text,
  figma_layer_summary jsonb,
  figma_synced_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'review', 'approved')),
  sort_order integer not null default 0,
  updated_by uuid references public.members (id),
  updated_at timestamptz not null default now(),
  constraint screens_figma_fields check (
    source <> 'figma' or (figma_file_key is not null and figma_node_id is not null and figma_url is not null)
  )
);

alter table public.projects
  add constraint projects_cover_screen_fk foreign key (cover_screen_id) references public.screens (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 문서 · 요구사항
-- ---------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  category text not null default 'planning' check (category in ('planning', 'dev', 'design', 'etc')),
  source_type text not null check (source_type in ('native', 'upload', 'link')),
  content_blocks jsonb,
  file_path text,
  file_type text check (file_type in ('pdf', 'docx', 'md')),
  url text,
  rendered_html text,
  plain_text text,
  fetched_at timestamptz,
  fetch_status text check (fetch_status in ('ok', 'failed', 'manual')),
  version_label text,
  created_by uuid not null references public.members (id),
  updated_at timestamptz not null default now(),
  constraint documents_source_fields check (
    (source_type = 'native') or
    (source_type = 'upload' and file_path is not null and file_type is not null) or
    (source_type = 'link' and url is not null)
  )
);

create table public.requirements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  code text not null,
  title text not null,
  body text,
  anchor jsonb not null,
  priority text check (priority in ('must', 'should', 'could')),
  origin text not null default 'manual' check (origin in ('auto_pattern', 'manual', 'ai')),
  created_by uuid not null references public.members (id),
  created_at timestamptz not null default now(),
  unique (project_id, code)
);

create table public.screen_requirements (
  screen_id uuid not null references public.screens (id) on delete cascade,
  requirement_id uuid not null references public.requirements (id) on delete cascade,
  status text not null default 'missing' check (status in ('reflected', 'partial', 'missing', 'na')),
  note text,
  layer_ids text[],
  updated_by uuid references public.members (id),
  updated_at timestamptz not null default now(),
  primary key (screen_id, requirement_id)
);

-- ---------------------------------------------------------------------------
-- 디자인 시스템 · 피그마
-- ---------------------------------------------------------------------------
create table public.components (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  name text not null,
  code_name text,
  category text not null,
  description text,
  thumbnail_path text,
  figma_component_key text,
  match_aliases text[],
  props_schema jsonb
);

create table public.tokens (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  type text not null check (type in ('color', 'typography', 'spacing', 'radius', 'shadow')),
  name text not null,
  value jsonb not null,
  description text,
  unique (workspace_id, name)
);

create table public.screen_component_usages (
  id uuid primary key default gen_random_uuid(),
  screen_id uuid not null references public.screens (id) on delete cascade,
  component_id uuid references public.components (id) on delete set null,
  detected_name text not null,
  count integer not null default 1,
  source text not null check (source in ('figma', 'native'))
);

-- 피그마 토큰은 서버(service role)만 읽는다: 멤버 정책을 두지 않는다
create table public.figma_connections (
  workspace_id uuid primary key references public.workspaces (id),
  access_token_encrypted text not null,
  owner_member_id uuid not null references public.members (id),
  last_error text
);

-- ---------------------------------------------------------------------------
-- 자주 쓰는 조회용 색인 (02_DATA_MODEL.md "자주 쓰는 조회")
-- ---------------------------------------------------------------------------
create index on public.pages (project_id, sort_order);
create index on public.screens (page_id, sort_order);
create index on public.documents (project_id);
create index on public.requirements (project_id);
create index on public.requirements (document_id);
create index on public.screen_requirements (requirement_id);
create index on public.screen_component_usages (screen_id);

-- updated_at 자동 갱신
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger touch_projects before update on public.projects for each row execute function public.touch_updated_at();
create trigger touch_screens before update on public.screens for each row execute function public.touch_updated_at();
create trigger touch_documents before update on public.documents for each row execute function public.touch_updated_at();
create trigger touch_screen_requirements before update on public.screen_requirements for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — 멤버만 읽고 쓴다
-- ---------------------------------------------------------------------------
alter table public.workspaces enable row level security;
alter table public.members enable row level security;
alter table public.projects enable row level security;
alter table public.pages enable row level security;
alter table public.screens enable row level security;
alter table public.documents enable row level security;
alter table public.requirements enable row level security;
alter table public.screen_requirements enable row level security;
alter table public.components enable row level security;
alter table public.tokens enable row level security;
alter table public.screen_component_usages enable row level security;
alter table public.figma_connections enable row level security;

create policy "멤버는 워크스페이스를 읽는다" on public.workspaces for select using (public.is_member());

create policy "멤버는 멤버 목록을 읽는다" on public.members for select using (public.is_member());
create policy "본인 정보만 고친다" on public.members for update using (id = auth.uid()) with check (id = auth.uid() and is_admin = (select m.is_admin from public.members m where m.id = auth.uid()));

-- 협업 데이터: 멤버 누구나 읽고 쓴다 (권한 구분 없음, 01_PRD.md)
do $$
declare t text;
begin
  foreach t in array array['projects', 'pages', 'screens', 'documents', 'requirements', 'screen_requirements', 'screen_component_usages']
  loop
    execute format('create policy "멤버는 읽는다" on public.%I for select using (public.is_member());', t);
    execute format('create policy "멤버는 만든다" on public.%I for insert with check (public.is_member());', t);
    execute format('create policy "멤버는 고친다" on public.%I for update using (public.is_member()) with check (public.is_member());', t);
    execute format('create policy "멤버는 지운다" on public.%I for delete using (public.is_member());', t);
  end loop;
end;
$$;

-- 디자인 시스템 데이터: 읽기는 멤버, 쓰기는 관리자
do $$
declare t text;
begin
  foreach t in array array['components', 'tokens']
  loop
    execute format('create policy "멤버는 읽는다" on public.%I for select using (public.is_member());', t);
    execute format('create policy "관리자가 고친다" on public.%I for all using (public.is_admin()) with check (public.is_admin());', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage 버킷 (파일은 Storage, DB 에는 경로만)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('documents', 'documents', false), ('screens', 'screens', false)
on conflict (id) do nothing;

create policy "멤버는 파일을 읽는다" on storage.objects for select using (bucket_id in ('documents', 'screens') and public.is_member());
create policy "멤버는 파일을 올린다" on storage.objects for insert with check (bucket_id in ('documents', 'screens') and public.is_member());
create policy "멤버는 파일을 지운다" on storage.objects for delete using (bucket_id in ('documents', 'screens') and public.is_member());
