-- 3단계(기획서 양식 읽기, 2-A): 문서 약자 · 상태 · 검사 결과, 정책(요구사항) 영역 · 표기 · 빠진 날, 화면 칸, 옛 약자 대응
-- 근거: PRD/11_PLANNING_DOC_FORMAT.md, PRD/02_DATA_MODEL.md '2026-11-26 추가', PRD/17_BUILD_PLAN.md 3장 3
-- 버전(DocumentVersion · RequirementVersion)과 비교 · 재검토는 5단계(검수 흐름)에서 더해요.
-- 2026-11-27 승인 · 적용.

-- ---------------------------------------------------------------------------
-- 문서: 약자(ID 가 겹치면 앞에 붙여 '몰 C-05') · 상태 · 양식 검사 결과
-- ---------------------------------------------------------------------------
alter table public.documents add column if not exists abbr text check (abbr is null or char_length(abbr) between 1 and 8);
alter table public.documents add column if not exists status text not null default 'draft' check (status in ('draft', 'review', 'confirmed'));
-- { "policies": n, "slots": n, "links": n, "warnings": [{ "kind": "...", "code": "...", "block": "...", "message": "..." }] }
alter table public.documents add column if not exists check_result jsonb;

-- ---------------------------------------------------------------------------
-- 정책(테이블 이름은 requirements 그대로): 문서 안 ID 를 그대로 번호로(REQ-nnn 자동 번호 없앰)
-- ---------------------------------------------------------------------------
alter table public.requirements add column if not exists area text;                                -- P-ORD-05 의 ORD
alter table public.requirements add column if not exists marks text[] not null default '{}';        -- default · pending · dev_check · legal
alter table public.requirements add column if not exists has_screen boolean not null default true;  -- 화면 없는 정책(반영률에서 뺌)
alter table public.requirements add column if not exists removed_at timestamptz;                    -- 문서에서 빠진 시각(지우지 않고 표시)
-- 같은 ID 를 문서마다 쓸 수 있게: 프로젝트 안 유일 → 문서 안 유일
alter table public.requirements drop constraint if exists requirements_project_id_code_key;
create unique index if not exists requirements_doc_code on public.requirements (document_id, code);
alter table public.requirements drop constraint if exists requirements_origin_check;
alter table public.requirements add constraint requirements_origin_check check (origin in ('auto_pattern', 'doc_table', 'manual', 'ai'));

-- ---------------------------------------------------------------------------
-- 화면 칸: 기획서 화면 표의 한 행. 디자인(screens)이 여기에 붙어요
-- ---------------------------------------------------------------------------
create table if not exists public.screen_slots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  code text not null,                                   -- C-05
  kind text not null check (kind in ('C', 'A', 'S', 'N', 'CMP')),
  name text not null,                                   -- 상품 상세
  spec text,                                            -- '보여 줄 것' 원문
  states text[] not null default '{}',                  -- '상태' 열: 로딩 · 일시품절 · 오류 …
  policy_codes text[] not null default '{}',            -- '정책' 열(없으면 문장 속 (P-…))
  anchor jsonb not null default '{}'::jsonb,            -- 문서 속 자리(블록 · 표 행)
  assignee_member_id uuid references public.members (id) on delete set null,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, code)
);
create index if not exists screen_slots_project on public.screen_slots (project_id);
drop trigger if exists touch_screen_slots on public.screen_slots;
create trigger touch_screen_slots before update on public.screen_slots for each row execute function public.touch_updated_at();

-- 디자인 → 화면 칸
alter table public.screens add column if not exists slot_id uuid references public.screen_slots (id) on delete set null;
alter table public.screens add column if not exists slot_state text;                                -- 상태 변형(기본 디자인은 비움)
alter table public.screens add column if not exists is_primary boolean not null default true;       -- 같은 칸 시안 중 대표
create index if not exists screens_slot on public.screens (slot_id);

-- 화면 ↔ 정책 연결: '확인 전'(화면 표 '정책' 열에서 붙은 후보) 상태와 연결된 길
alter table public.screen_requirements drop constraint if exists screen_requirements_status_check;
alter table public.screen_requirements add constraint screen_requirements_status_check check (status in ('unchecked', 'reflected', 'partial', 'missing', 'na'));
alter table public.screen_requirements add column if not exists origin text not null default 'manual' check (origin in ('doc_table', 'figma_desc', 'manual', 'ai'));

-- ---------------------------------------------------------------------------
-- 옛 약자 대응(프로젝트 설정 '문서 규칙'): M → C, MA → A, MN → N
-- ---------------------------------------------------------------------------
create table if not exists public.project_id_aliases (
  project_id uuid not null references public.projects (id) on delete cascade,
  from_prefix text not null check (from_prefix ~ '^[A-Z]{1,4}$'),
  to_prefix text not null check (to_prefix in ('P', 'C', 'A', 'S', 'N', 'CMP')),
  created_at timestamptz not null default now(),
  primary key (project_id, from_prefix)
);

-- ---------------------------------------------------------------------------
-- 보안 규칙(RLS): 화면 칸은 기획 역할이 쓰고(문서에서 읽어 만들어요), 보기는 프로젝트 멤버.
-- 디자인을 칸에 붙이는 건 screens 고치기(디자인 역할)라 따로 규칙이 필요 없어요. 옛 약자는 방장 · 부방장
-- ---------------------------------------------------------------------------
create or replace function public.project_of_document(d uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select project_id from public.documents where id = d;
$$;

alter table public.screen_slots enable row level security;
alter table public.project_id_aliases enable row level security;
drop policy if exists "프로젝트 멤버는 화면 칸을 읽는다" on public.screen_slots;
drop policy if exists "기획 역할이 화면 칸을 고친다" on public.screen_slots;
drop policy if exists "프로젝트 멤버는 옛 약자를 읽는다" on public.project_id_aliases;
drop policy if exists "방장 · 부방장이 옛 약자를 고친다" on public.project_id_aliases;
create policy "프로젝트 멤버는 화면 칸을 읽는다" on public.screen_slots for select using (public.project_role(project_id) is not null);
create policy "기획 역할이 화면 칸을 고친다" on public.screen_slots for all
  using (public.has_project_role(project_id, array['owner', 'deputy', 'planner_editor']))
  with check (public.has_project_role(project_id, array['owner', 'deputy', 'planner_editor']) and public.project_of_document(document_id) = project_id);
create policy "프로젝트 멤버는 옛 약자를 읽는다" on public.project_id_aliases for select using (public.project_role(project_id) is not null);
create policy "방장 · 부방장이 옛 약자를 고친다" on public.project_id_aliases for all
  using (public.has_project_role(project_id, array['owner', 'deputy']))
  with check (public.has_project_role(project_id, array['owner', 'deputy']));

-- ---------------------------------------------------------------------------
-- 문서 댓글(Word 메모처럼 문서 옆 카드 + 아래 게시판): 지금 코멘트 표를 그대로 쓰고 '어느 문서 · 어느 자리'만 더해요
-- doc_anchor 가 비면 문서 전체 댓글(게시판), 있으면 그 블록 · 표 줄 · 고른 글자에 붙은 메모
-- ---------------------------------------------------------------------------
alter table public.comments add column if not exists document_id uuid references public.documents (id) on delete cascade;
alter table public.comments add column if not exists doc_anchor jsonb; -- { "block": "b12", "row": 3, "quote": "결제 전에 배송지 확인 창을 띄운다." }
create index if not exists comments_document on public.comments (document_id) where document_id is not null;
drop policy if exists "프로젝트 멤버는 코멘트를 쓴다" on public.comments;
create policy "프로젝트 멤버는 코멘트를 쓴다" on public.comments for insert with check (
  author_id = auth.uid()
  and public.project_role(project_id) is not null
  and (screen_id is null or public.project_of_screen(screen_id) = project_id)
  and (page_id is null or public.project_of_page(page_id) = project_id)
  and (document_id is null or public.project_of_document(document_id) = project_id)
);

-- ---------------------------------------------------------------------------
-- 문서 수정 기록: 바뀐 블록만 남겨요(용량 절약). 같은 사람이 10분 안에 고친 건 앱이 하나로 묶어 저장하고,
-- 기록 20개마다 전체 사본(snapshot)을 하나 남겨 되돌리기를 빠르게 해요. 고치거나 지울 수 없어요
-- 90일 지난 기록은 하루 마지막 하나만 남기도록 줄이는 정리는 5단계 버전 기능과 함께 붙여요
-- ---------------------------------------------------------------------------
create table if not exists public.document_history (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.members (id) on delete cascade,
  changes jsonb not null default '[]'::jsonb,  -- [{ "op": "add|edit|del", "block": "b12", "before": {…}, "after": {…} }]
  summary jsonb not null default '[]'::jsonb,  -- 목록 칩: ["+ P-ORD-09", "~ C-12"]
  snapshot jsonb,                               -- 20개마다 전체 본문
  created_at timestamptz not null default now()
);
create index if not exists document_history_doc on public.document_history (document_id, created_at desc);
alter table public.document_history enable row level security;
drop policy if exists "프로젝트 멤버는 문서 기록을 읽는다" on public.document_history;
drop policy if exists "기획 역할이 문서 기록을 남긴다" on public.document_history;
create policy "프로젝트 멤버는 문서 기록을 읽는다" on public.document_history for select using (public.project_role(project_id) is not null);
create policy "기획 역할이 문서 기록을 남긴다" on public.document_history for insert with check (
  author_id = auth.uid()
  and public.has_project_role(project_id, array['owner', 'deputy', 'planner_editor'])
  and public.project_of_document(document_id) = project_id
);
