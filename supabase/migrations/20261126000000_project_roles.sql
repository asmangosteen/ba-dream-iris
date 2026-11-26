-- 1단계(함께 쓰기 바탕): 프로젝트 역할 · 초대 · 알림 · 기록
-- 근거: PRD/12_ROLES_PERMISSIONS.md, PRD/02_DATA_MODEL.md '2026-11-26 추가', PRD/17_BUILD_PLAN.md 3장 1
-- 지금까지는 회사 멤버면 누구나 모든 프로젝트를 고칠 수 있었어요(is_member() 하나). 이제 프로젝트 역할로 거릅니다.
-- 초대는 메일 없이: 초대 기록은 회사 이메일로 남고, 그 사람이 로그인하면(처음이든 다시든) 바로 보여요.

-- ---------------------------------------------------------------------------
-- 테이블
-- ---------------------------------------------------------------------------
create table if not exists public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  role text not null check (role in ('owner', 'deputy', 'planner_editor', 'designer_editor', 'reviewer', 'viewer')),
  added_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, member_id)
);
-- 방장은 프로젝트마다 한 명
create unique index if not exists project_members_one_owner on public.project_members (project_id) where role = 'owner';
create index if not exists project_members_member on public.project_members (member_id);

create table if not exists public.project_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  email text not null check (email = lower(email)),
  -- invite: 멤버가 다른 사람을 초대 요청 / join: 멤버가 아닌 사람이 참여 요청
  kind text not null default 'invite' check (kind in ('invite', 'join')),
  requested_by uuid not null references public.members (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
  role text check (role is null or role in ('deputy', 'planner_editor', 'designer_editor', 'reviewer', 'viewer')),
  decided_by uuid references public.members (id) on delete set null,
  decided_at timestamptz,
  -- 초대받은 사람이 '초대됐어요' 화면을 본 시각
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);
-- 같은 프로젝트 · 같은 이메일의 대기 중 요청은 하나만
create unique index if not exists project_invites_one_pending on public.project_invites (project_id, email) where status = 'pending';
create index if not exists project_invites_email on public.project_invites (email);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  kind text not null, -- invite_request · join_request · invite_approved · invite_rejected · invite_expired · invited · role_changed · removed · mention …
  target_type text,
  target_id uuid,
  actor_id uuid references public.members (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  group_key text,
  count int not null default 1,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_member on public.notifications (member_id, created_at desc);

-- 기록: 지우거나 고칠 수 없어요(정책 없음 = 직접 쓰기 막힘, 아래 함수만 씀)
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  actor_id uuid references public.members (id) on delete set null,
  action text not null, -- invite_request · invite_decide · role_change · member_remove · owner_transfer · join_request …
  target_type text,
  target_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_log_project on public.activity_log (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 역할 확인 함수
-- ---------------------------------------------------------------------------
create or replace function public.project_role(pid uuid)
returns text language sql stable security definer set search_path = public as $$
  select pm.role from public.project_members pm where pm.project_id = pid and pm.member_id = auth.uid();
$$;

create or replace function public.has_project_role(pid uuid, roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.project_members pm where pm.project_id = pid and pm.member_id = auth.uid() and pm.role = any (roles));
$$;

create or replace function public.project_of_page(pg uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select p.project_id from public.pages p where p.id = pg;
$$;

create or replace function public.project_of_screen(sc uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select p.project_id from public.screens s join public.pages p on p.id = s.page_id where s.id = sc;
$$;

-- 역할 묶음(쓰기 규칙에서 씀)
-- 관리: 방장 · 부방장 / 디자인: + 디자인 편집 / 문서: + 기획 편집 / 연결: + 둘 다 / 반영 상태: + 검토자 / 보기: 모든 역할

-- ---------------------------------------------------------------------------
-- 기존 프로젝트 옮기기: 만든 사람 = 방장, 나머지 회사 멤버 = 직무 역할
-- ---------------------------------------------------------------------------
insert into public.project_members (project_id, member_id, role)
select p.id, p.created_by, 'owner' from public.projects p
on conflict do nothing;

insert into public.project_members (project_id, member_id, role)
select p.id, m.id, case m.role when 'designer' then 'designer_editor' when 'developer' then 'reviewer' else 'planner_editor' end
from public.projects p cross join public.members m
where m.id <> p.created_by and m.workspace_id = p.workspace_id
on conflict do nothing;

-- 새 프로젝트: 만든 사람을 방장으로
create or replace function public.add_project_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.project_members (project_id, member_id, role, added_by) values (new.id, new.created_by, 'owner', new.created_by)
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists add_project_owner on public.projects;
create trigger add_project_owner after insert on public.projects for each row execute function public.add_project_owner();

-- 처음 로그인한 사람: 이미 승인된 초대가 있으면 그 프로젝트 멤버로
create or replace function public.claim_invites_for(mid uuid, mail text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.project_members (project_id, member_id, role, added_by)
  select i.project_id, mid, i.role, i.decided_by from public.project_invites i
  where i.email = lower(mail) and i.status = 'approved' and i.role is not null
  on conflict do nothing;
  -- 처음 들어온 사람에게도 '초대됐어요' 알림(본인이 만든 줄이라 notify_member 대신 바로 넣어요)
  insert into public.notifications (member_id, project_id, kind, target_type, target_id, actor_id, payload)
  select mid, i.project_id, 'invited', 'invite', i.id, i.decided_by, jsonb_build_object('role', i.role)
  from public.project_invites i
  where i.email = lower(mail) and i.status = 'approved' and i.role is not null;
end;
$$;

create or replace function public.claim_invites_on_join()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.claim_invites_for(new.id, new.email);
  return new;
end;
$$;
drop trigger if exists claim_invites_on_join on public.members;
create trigger claim_invites_on_join after insert on public.members for each row execute function public.claim_invites_on_join();

-- ---------------------------------------------------------------------------
-- 알림 · 기록 쓰기(함수 안에서만)
-- ---------------------------------------------------------------------------
create or replace function public.notify_member(mid uuid, pid uuid, k text, ttype text, tid uuid, data jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (member_id, project_id, kind, target_type, target_id, actor_id, payload)
  select mid, pid, k, ttype, tid, auth.uid(), coalesce(data, '{}'::jsonb) where mid is not null and mid is distinct from auth.uid();
$$;

create or replace function public.notify_admins(pid uuid, k text, ttype text, tid uuid, data jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (member_id, project_id, kind, target_type, target_id, actor_id, payload)
  select pm.member_id, pid, k, ttype, tid, auth.uid(), coalesce(data, '{}'::jsonb)
  from public.project_members pm where pm.project_id = pid and pm.role in ('owner', 'deputy') and pm.member_id <> auth.uid();
$$;

create or replace function public.log_activity(pid uuid, act text, ttype text, tid uuid, b jsonb, a jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.activity_log (project_id, actor_id, action, target_type, target_id, before, after) values (pid, auth.uid(), act, ttype, tid, b, a);
$$;

-- ---------------------------------------------------------------------------
-- 초대 · 역할 동작(앱은 이 함수들만 불러요)
-- ---------------------------------------------------------------------------
-- 7일 지난 대기 요청을 만료로 바꾸고 요청한 사람에게 알려요(앱이 열릴 때 부름, 여러 번 불러도 같음)
create or replace function public.expire_invites()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with ex as (
    update public.project_invites set status = 'expired' where status = 'pending' and expires_at < now() returning id, project_id, requested_by, email
  ), notes as (
    insert into public.notifications (member_id, project_id, kind, target_type, target_id, payload)
    select requested_by, project_id, 'invite_expired', 'invite', id, jsonb_build_object('email', email) from ex returning 1
  )
  select count(*) into n from ex;
  return n;
end;
$$;

-- 초대: 방장 · 부방장은 역할을 정해 바로, 다른 멤버는 승인 요청(역할 없음)
create or replace function public.invite_to_project(pid uuid, mail text, r text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me_role text := public.project_role(pid);
  m text := lower(trim(mail));
  ws_domain text;
  inv uuid;
  target uuid;
begin
  if me_role is null then raise exception 'not_member' using errcode = '42501'; end if;
  select lower(w.allowed_email_domain) into ws_domain from public.projects p join public.workspaces w on w.id = p.workspace_id where p.id = pid;
  if split_part(m, '@', 2) <> ws_domain then raise exception 'bad_domain' using errcode = '22023'; end if;
  select id into target from public.members where lower(email) = m;
  if target is not null and exists (select 1 from public.project_members where project_id = pid and member_id = target) then
    raise exception 'already_member' using errcode = '23505';
  end if;
  if me_role in ('owner', 'deputy') and r is not null then
    if r not in ('deputy', 'planner_editor', 'designer_editor', 'reviewer', 'viewer') then raise exception 'bad_role' using errcode = '22023'; end if;
    if r = 'deputy' and coalesce(me_role, '') <> 'owner' then raise exception 'owner_only' using errcode = '42501'; end if;
    update public.project_invites set status = 'cancelled' where project_id = pid and email = m and status = 'pending';
    insert into public.project_invites (project_id, email, requested_by, status, role, decided_by, decided_at)
    values (pid, m, auth.uid(), 'approved', r, auth.uid(), now()) returning id into inv;
    if target is not null then
      insert into public.project_members (project_id, member_id, role, added_by) values (pid, target, r, auth.uid()) on conflict do nothing;
      perform public.notify_member(target, pid, 'invited', 'invite', inv, jsonb_build_object('role', r));
    end if;
    perform public.log_activity(pid, 'invite_decide', 'invite', inv, null, jsonb_build_object('email', m, 'role', r, 'status', 'approved'));
  else
    insert into public.project_invites (project_id, email, requested_by) values (pid, m, auth.uid())
    on conflict (project_id, email) where status = 'pending' do update set requested_by = excluded.requested_by
    returning id into inv;
    perform public.notify_admins(pid, 'invite_request', 'invite', inv, jsonb_build_object('email', m));
    perform public.log_activity(pid, 'invite_request', 'invite', inv, null, jsonb_build_object('email', m));
  end if;
  return inv;
end;
$$;

-- 참여 요청: 멤버가 아닌 사람(링크로 들어옴 · 초대 만료)
create or replace function public.request_join(pid uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare m text; inv uuid;
begin
  if not public.is_member() then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if public.project_role(pid) is not null then raise exception 'already_member' using errcode = '23505'; end if;
  select lower(email) into m from public.members where id = auth.uid();
  insert into public.project_invites (project_id, email, kind, requested_by) values (pid, m, 'join', auth.uid())
  on conflict (project_id, email) where status = 'pending' do update set kind = 'join'
  returning id into inv;
  perform public.notify_admins(pid, 'join_request', 'invite', inv, jsonb_build_object('email', m));
  perform public.log_activity(pid, 'join_request', 'invite', inv, null, jsonb_build_object('email', m));
  return inv;
end;
$$;

-- 승인(역할 필수) · 거절: 방장 · 부방장
create or replace function public.decide_invite(inv uuid, approve boolean, r text default null)
returns void language plpgsql security definer set search_path = public as $$
declare i public.project_invites; me_role text; target uuid;
begin
  select * into i from public.project_invites where id = inv for update;
  if i.id is null or i.status <> 'pending' then raise exception 'not_pending' using errcode = '22023'; end if;
  me_role := public.project_role(i.project_id);
  if coalesce(me_role, '') not in ('owner', 'deputy') then raise exception 'admins_only' using errcode = '42501'; end if;
  if i.expires_at < now() then
    update public.project_invites set status = 'expired' where id = inv;
    raise exception 'expired' using errcode = '22023';
  end if;
  if approve then
    if r is null or r not in ('deputy', 'planner_editor', 'designer_editor', 'reviewer', 'viewer') then raise exception 'role_required' using errcode = '22023'; end if;
    if r = 'deputy' and coalesce(me_role, '') <> 'owner' then raise exception 'owner_only' using errcode = '42501'; end if;
    update public.project_invites set status = 'approved', role = r, decided_by = auth.uid(), decided_at = now() where id = inv;
    select id into target from public.members where lower(email) = i.email;
    if target is not null then
      insert into public.project_members (project_id, member_id, role, added_by) values (i.project_id, target, r, auth.uid()) on conflict do nothing;
      perform public.notify_member(target, i.project_id, 'invited', 'invite', inv, jsonb_build_object('role', r));
    end if;
    if i.requested_by is distinct from target then
      perform public.notify_member(i.requested_by, i.project_id, 'invite_approved', 'invite', inv, jsonb_build_object('email', i.email, 'role', r));
    end if;
  else
    update public.project_invites set status = 'rejected', decided_by = auth.uid(), decided_at = now() where id = inv;
    perform public.notify_member(i.requested_by, i.project_id, 'invite_rejected', 'invite', inv, jsonb_build_object('email', i.email));
  end if;
  perform public.log_activity(i.project_id, 'invite_decide', 'invite', inv, jsonb_build_object('status', 'pending'), jsonb_build_object('status', case when approve then 'approved' else 'rejected' end, 'role', r, 'email', i.email));
end;
$$;

-- 내가 보낸 대기 요청 취소
create or replace function public.cancel_invite(inv uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.project_invites set status = 'cancelled'
  where id = inv and status = 'pending' and (requested_by = auth.uid() or public.has_project_role(project_id, array['owner', 'deputy']));
end;
$$;

-- 역할 바꾸기: 방장 · 부방장(부방장 임명 · 해제는 방장만, 방장 자리는 '방장 넘기기'로만)
create or replace function public.set_project_role(pid uuid, mid uuid, r text)
returns void language plpgsql security definer set search_path = public as $$
declare me_role text := public.project_role(pid); old text;
begin
  if coalesce(me_role, '') not in ('owner', 'deputy') then raise exception 'admins_only' using errcode = '42501'; end if;
  select role into old from public.project_members where project_id = pid and member_id = mid;
  if old is null then raise exception 'not_member' using errcode = '22023'; end if;
  if old = 'owner' or r = 'owner' then raise exception 'use_transfer' using errcode = '22023'; end if;
  if r not in ('deputy', 'planner_editor', 'designer_editor', 'reviewer', 'viewer') then raise exception 'bad_role' using errcode = '22023'; end if;
  if (r = 'deputy' or old = 'deputy') and coalesce(me_role, '') <> 'owner' then raise exception 'owner_only' using errcode = '42501'; end if;
  update public.project_members set role = r where project_id = pid and member_id = mid;
  perform public.notify_member(mid, pid, 'role_changed', 'project', pid, jsonb_build_object('role', r));
  perform public.log_activity(pid, 'role_change', 'member', mid, jsonb_build_object('role', old), jsonb_build_object('role', r));
end;
$$;

-- 내보내기 · 나가기: 방장은 나갈 수 없음(먼저 넘기기), 부방장은 방장 · 부방장을 내보낼 수 없음
create or replace function public.remove_project_member(pid uuid, mid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me_role text := public.project_role(pid); old text;
begin
  select role into old from public.project_members where project_id = pid and member_id = mid;
  if old is null then return; end if;
  if old = 'owner' then raise exception 'transfer_first' using errcode = '22023'; end if;
  if mid <> auth.uid() then
    if coalesce(me_role, '') not in ('owner', 'deputy') then raise exception 'admins_only' using errcode = '42501'; end if;
    if old = 'deputy' and coalesce(me_role, '') <> 'owner' then raise exception 'owner_only' using errcode = '42501'; end if;
  end if;
  delete from public.project_members where project_id = pid and member_id = mid;
  if mid <> auth.uid() then perform public.notify_member(mid, pid, 'removed', 'project', pid, '{}'::jsonb); end if;
  perform public.log_activity(pid, 'member_remove', 'member', mid, jsonb_build_object('role', old), null);
end;
$$;

-- 방장 넘기기: 방장만. 지금 방장은 부방장이 돼요
create or replace function public.transfer_project_owner(pid uuid, mid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.project_role(pid), '') <> 'owner' then raise exception 'owner_only' using errcode = '42501'; end if;
  if not exists (select 1 from public.project_members where project_id = pid and member_id = mid) then raise exception 'not_member' using errcode = '22023'; end if;
  update public.project_members set role = 'deputy' where project_id = pid and member_id = auth.uid();
  update public.project_members set role = 'owner' where project_id = pid and member_id = mid;
  perform public.notify_member(mid, pid, 'role_changed', 'project', pid, jsonb_build_object('role', 'owner'));
  perform public.log_activity(pid, 'owner_transfer', 'member', mid, null, jsonb_build_object('owner', mid));
end;
$$;

-- '초대됐어요' 화면을 봤어요
create or replace function public.mark_invites_seen(pid uuid)
returns void language sql security definer set search_path = public as $$
  update public.project_invites set seen_at = now()
  where project_id = pid and status = 'approved' and seen_at is null and email = (select lower(email) from public.members where id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- 보안 규칙(RLS)
-- ---------------------------------------------------------------------------
alter table public.project_members enable row level security;
alter table public.project_invites enable row level security;
alter table public.notifications enable row level security;
alter table public.activity_log enable row level security;

create policy "멤버는 프로젝트 멤버 목록을 읽는다" on public.project_members for select using (public.is_member());
create policy "관련된 초대만 읽는다" on public.project_invites for select using (
  requested_by = auth.uid()
  or email = (select lower(m.email) from public.members m where m.id = auth.uid())
  or public.has_project_role(project_id, array['owner', 'deputy'])
);
create policy "내 알림만 읽는다" on public.notifications for select using (member_id = auth.uid());
create policy "내 알림만 읽음 처리한다" on public.notifications for update using (member_id = auth.uid()) with check (member_id = auth.uid());
create policy "프로젝트 멤버는 기록을 읽는다" on public.activity_log for select using (public.project_role(project_id) is not null);

-- 기존 '멤버 누구나' 규칙을 프로젝트 역할로 바꾸기
do $$
declare t text;
begin
  foreach t in array array['projects', 'pages', 'screens', 'documents', 'requirements', 'screen_requirements', 'screen_component_usages']
  loop
    execute format('drop policy if exists "멤버는 읽는다" on public.%I;', t);
    execute format('drop policy if exists "멤버는 만든다" on public.%I;', t);
    execute format('drop policy if exists "멤버는 고친다" on public.%I;', t);
    execute format('drop policy if exists "멤버는 지운다" on public.%I;', t);
  end loop;
end;
$$;

-- 프로젝트: 이름 · 설명은 회사 멤버 누구나(검색 · 참여 요청), 고치기는 방장 · 부방장, 지우기는 방장
create policy "멤버는 프로젝트를 읽는다" on public.projects for select using (public.is_member());
create policy "멤버는 프로젝트를 만든다" on public.projects for insert with check (public.is_member() and created_by = auth.uid());
create policy "방장 · 부방장이 프로젝트를 고친다" on public.projects for update using (public.has_project_role(id, array['owner', 'deputy'])) with check (public.has_project_role(id, array['owner', 'deputy']));
create policy "방장이 프로젝트를 지운다" on public.projects for delete using (public.has_project_role(id, array['owner']));

-- 페이지 · 화면 · 컴포넌트 사용: 보기는 프로젝트 멤버, 쓰기는 디자인 역할
create policy "프로젝트 멤버는 페이지를 읽는다" on public.pages for select using (public.project_role(project_id) is not null);
create policy "디자인 역할이 페이지를 만든다" on public.pages for insert with check (public.has_project_role(project_id, array['owner', 'deputy', 'designer_editor']));
create policy "디자인 역할이 페이지를 고친다" on public.pages for update using (public.has_project_role(project_id, array['owner', 'deputy', 'designer_editor'])) with check (public.has_project_role(project_id, array['owner', 'deputy', 'designer_editor']));
create policy "디자인 역할이 페이지를 지운다" on public.pages for delete using (public.has_project_role(project_id, array['owner', 'deputy', 'designer_editor']));

create policy "프로젝트 멤버는 화면을 읽는다" on public.screens for select using (public.project_role(public.project_of_page(page_id)) is not null);
create policy "디자인 역할이 화면을 만든다" on public.screens for insert with check (public.has_project_role(public.project_of_page(page_id), array['owner', 'deputy', 'designer_editor']));
create policy "디자인 역할이 화면을 고친다" on public.screens for update using (public.has_project_role(public.project_of_page(page_id), array['owner', 'deputy', 'designer_editor'])) with check (public.has_project_role(public.project_of_page(page_id), array['owner', 'deputy', 'designer_editor']));
create policy "디자인 역할이 화면을 지운다" on public.screens for delete using (public.has_project_role(public.project_of_page(page_id), array['owner', 'deputy', 'designer_editor']));

create policy "프로젝트 멤버는 컴포넌트 사용을 읽는다" on public.screen_component_usages for select using (public.project_role(public.project_of_screen(screen_id)) is not null);
create policy "디자인 역할이 컴포넌트 사용을 고친다" on public.screen_component_usages for all using (public.has_project_role(public.project_of_screen(screen_id), array['owner', 'deputy', 'designer_editor'])) with check (public.has_project_role(public.project_of_screen(screen_id), array['owner', 'deputy', 'designer_editor']));

-- 문서 · 정책: 보기는 프로젝트 멤버, 쓰기는 기획 역할
create policy "프로젝트 멤버는 문서를 읽는다" on public.documents for select using (public.project_role(project_id) is not null);
create policy "기획 역할이 문서를 고친다" on public.documents for all using (public.has_project_role(project_id, array['owner', 'deputy', 'planner_editor'])) with check (public.has_project_role(project_id, array['owner', 'deputy', 'planner_editor']));
create policy "프로젝트 멤버는 정책을 읽는다" on public.requirements for select using (public.project_role(project_id) is not null);
create policy "기획 역할이 정책을 고친다" on public.requirements for all using (public.has_project_role(project_id, array['owner', 'deputy', 'planner_editor'])) with check (public.has_project_role(project_id, array['owner', 'deputy', 'planner_editor']));

-- 화면 ↔ 정책 연결: 연결 · 끊기는 기획 · 디자인 역할, 반영 상태 · 메모는 검토자까지
create policy "프로젝트 멤버는 연결을 읽는다" on public.screen_requirements for select using (public.project_role(public.project_of_screen(screen_id)) is not null);
create policy "기획 · 디자인 역할이 연결한다" on public.screen_requirements for insert with check (public.has_project_role(public.project_of_screen(screen_id), array['owner', 'deputy', 'planner_editor', 'designer_editor']));
create policy "기획 · 디자인 역할이 연결을 끊는다" on public.screen_requirements for delete using (public.has_project_role(public.project_of_screen(screen_id), array['owner', 'deputy', 'planner_editor', 'designer_editor']));
create policy "검토자까지 반영 상태를 고친다" on public.screen_requirements for update using (public.has_project_role(public.project_of_screen(screen_id), array['owner', 'deputy', 'planner_editor', 'designer_editor', 'reviewer'])) with check (public.has_project_role(public.project_of_screen(screen_id), array['owner', 'deputy', 'planner_editor', 'designer_editor', 'reviewer']));

-- 함수 실행 권한: 로그인한 사람만
revoke all on function public.invite_to_project(uuid, text, text), public.request_join(uuid), public.decide_invite(uuid, boolean, text), public.cancel_invite(uuid),
  public.set_project_role(uuid, uuid, text), public.remove_project_member(uuid, uuid), public.transfer_project_owner(uuid, uuid), public.mark_invites_seen(uuid), public.expire_invites() from public, anon;
grant execute on function public.invite_to_project(uuid, text, text), public.request_join(uuid), public.decide_invite(uuid, boolean, text), public.cancel_invite(uuid),
  public.set_project_role(uuid, uuid, text), public.remove_project_member(uuid, uuid), public.transfer_project_owner(uuid, uuid), public.mark_invites_seen(uuid), public.expire_invites() to authenticated;
revoke all on function public.notify_member(uuid, uuid, text, text, uuid, jsonb), public.notify_admins(uuid, text, text, uuid, jsonb), public.log_activity(uuid, text, text, uuid, jsonb, jsonb), public.claim_invites_for(uuid, text) from public, anon, authenticated;
