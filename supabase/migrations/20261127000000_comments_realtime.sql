-- 2단계(실시간 · 코멘트): 코멘트 · 스레드 · 읽음 · 멘션 알림, 화면 · 코멘트 실시간 반영
-- 근거: PRD/17_BUILD_PLAN.md 3장 2, PRD/16_SCREEN_CHANGES.md J, PRD/12(코멘트는 모든 역할)
-- 접속자 · 커서는 표 없이 Realtime 채널(presence · broadcast)로만 주고받아요.

-- ---------------------------------------------------------------------------
-- 코멘트: 스레드 첫 글(thread_id 없음)이 핀 자리(x, y)를 가져요. 화면에 단 핀은 화면 기준 좌표라 화면을 옮겨도 따라가요
-- ---------------------------------------------------------------------------
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  page_id uuid references public.pages (id) on delete cascade,
  screen_id uuid references public.screens (id) on delete cascade, -- 없으면 페이지 캔버스 위
  thread_id uuid references public.comments (id) on delete cascade, -- 없으면 스레드 첫 글
  no int, -- 프로젝트 안 스레드 번호(#14)
  x double precision,
  y double precision,
  author_id uuid not null default auth.uid() references public.members (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  mentions uuid[] not null default '{}',
  resolved_at timestamptz,
  resolved_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index if not exists comments_project on public.comments (project_id, created_at desc);
create index if not exists comments_thread on public.comments (thread_id);

-- 스레드 번호: 프로젝트마다 1, 2, 3 …(답글은 번호 없음)
create or replace function public.comment_number()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.thread_id is null then
    select coalesce(max(no), 0) + 1 into new.no from public.comments where project_id = new.project_id;
  else
    new.no := null; new.x := null; new.y := null;
    -- 답글은 스레드와 같은 곳
    select project_id, page_id, screen_id into new.project_id, new.page_id, new.screen_id from public.comments where id = new.thread_id;
  end if;
  return new;
end;
$$;
drop trigger if exists comment_number on public.comments;
create trigger comment_number before insert on public.comments for each row execute function public.comment_number();

-- 읽음: 스레드마다 내가 마지막으로 본 시각(목록의 새 답글 점)
create table if not exists public.comment_reads (
  member_id uuid not null references public.members (id) on delete cascade,
  thread_id uuid not null references public.comments (id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (member_id, thread_id)
);

-- ---------------------------------------------------------------------------
-- 알림: 멘션 · 답글(스레드에 글 쓴 사람들) · 해결
-- ---------------------------------------------------------------------------
create or replace function public.comment_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare root uuid := coalesce(new.thread_id, new.id); rno int; data jsonb;
begin
  select no into rno from public.comments where id = root;
  data := jsonb_build_object('no', rno, 'screen_id', new.screen_id, 'page_id', new.page_id, 'excerpt', left(new.body, 120));
  -- 멘션: 이 프로젝트 멤버만
  insert into public.notifications (member_id, project_id, kind, target_type, target_id, actor_id, payload)
  select distinct m, new.project_id, 'mention', 'comment', root, new.author_id, data
  from unnest(new.mentions) as m
  where m <> new.author_id and exists (select 1 from public.project_members pm where pm.project_id = new.project_id and pm.member_id = m);
  -- 답글: 스레드에 글을 쓴 사람들(멘션으로 이미 알린 사람 · 나 빼고)
  if new.thread_id is not null then
    insert into public.notifications (member_id, project_id, kind, target_type, target_id, actor_id, payload)
    select distinct c.author_id, new.project_id, 'reply', 'comment', root, new.author_id, data
    from public.comments c
    where (c.id = root or c.thread_id = root) and c.author_id <> new.author_id and not (c.author_id = any (new.mentions))
      and exists (select 1 from public.project_members pm where pm.project_id = new.project_id and pm.member_id = c.author_id);
  end if;
  return null;
end;
$$;
drop trigger if exists comment_notify on public.comments;
create trigger comment_notify after insert on public.comments for each row execute function public.comment_notify();

-- 해결 · 다시 열기: 프로젝트 멤버 누구나(피그마와 같아요). 스레드 첫 글 쓴 사람에게 알려요
create or replace function public.resolve_comment(cid uuid, done boolean)
returns void language plpgsql security definer set search_path = public as $$
declare c public.comments;
begin
  select * into c from public.comments where id = cid and thread_id is null;
  if c.id is null then raise exception 'not_found' using errcode = '22023'; end if;
  if public.project_role(c.project_id) is null then raise exception 'not_member' using errcode = '42501'; end if;
  update public.comments set resolved_at = case when done then now() end, resolved_by = case when done then auth.uid() end where id = cid;
  if done and c.author_id <> auth.uid() then
    perform public.notify_member(c.author_id, c.project_id, 'comment_resolved', 'comment', cid, jsonb_build_object('no', c.no, 'screen_id', c.screen_id, 'page_id', c.page_id, 'excerpt', left(c.body, 120)));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 보안 규칙(RLS): 코멘트는 모든 역할(보기 전용 포함)
-- ---------------------------------------------------------------------------
alter table public.comments enable row level security;
alter table public.comment_reads enable row level security;

drop policy if exists "프로젝트 멤버는 코멘트를 읽는다" on public.comments;
drop policy if exists "프로젝트 멤버는 코멘트를 쓴다" on public.comments;
drop policy if exists "쓴 사람이 코멘트를 고친다" on public.comments;
drop policy if exists "쓴 사람 · 방장 · 부방장이 코멘트를 지운다" on public.comments;
drop policy if exists "내 읽음만" on public.comment_reads;
create policy "프로젝트 멤버는 코멘트를 읽는다" on public.comments for select using (public.project_role(project_id) is not null);
create policy "프로젝트 멤버는 코멘트를 쓴다" on public.comments for insert with check (
  author_id = auth.uid()
  and public.project_role(project_id) is not null
  and (screen_id is null or public.project_of_screen(screen_id) = project_id)
  and (page_id is null or public.project_of_page(page_id) = project_id)
);
-- 고치기: 글 내용만(해결은 resolve_comment)
create policy "쓴 사람이 코멘트를 고친다" on public.comments for update using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "쓴 사람 · 방장 · 부방장이 코멘트를 지운다" on public.comments for delete using (author_id = auth.uid() or public.has_project_role(project_id, array['owner', 'deputy']));
create policy "내 읽음만" on public.comment_reads for all using (member_id = auth.uid()) with check (member_id = auth.uid());

revoke all on function public.resolve_comment(uuid, boolean) from public, anon;
grant execute on function public.resolve_comment(uuid, boolean) to authenticated;
revoke all on function public.comment_number(), public.comment_notify() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 실시간 반영: 화면(다른 사람이 저장한 레이어) · 코멘트 · 알림
-- 받는 쪽도 RLS 로 걸러져요(읽을 수 있는 줄만 와요)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['screens', 'comments', 'notifications']
  loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
end;
$$;
