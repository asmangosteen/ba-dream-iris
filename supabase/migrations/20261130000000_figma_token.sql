-- 피그마 토큰을 Iris 화면에서 넣기(4단계 — 사용자 결정 2026-11-29)
-- 토큰은 Supabase Vault 에 암호화해 두고, DB 밖으로 꺼내지 않아요. 피그마 호출은 DB 안 함수(figma_fetch)가 대신해서 결과만 돌려줘요.
--   set_figma_token(토큰)  관리자만 — 저장 · 바꾸기, 빈 값이면 지우기
--   figma_status()         멤버 — 연결 여부 · 끝 4자리 · 마지막 오류 · 바꾼 시각(토큰은 절대 안 돌려줌)
--   figma_fetch(주소)       멤버 — 피그마 '파일 읽기' 주소만(파일 · 노드 · 썸네일 · 이미지 칠) GET 해서 { status, retry_after, body }
-- Vercel 환경 변수(NUXT_FIGMA_ACCESS_TOKEN)가 있으면 서버는 그걸 먼저 써요(지금까지처럼)

create extension if not exists http with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- 기존 테이블에 보관함 id · 끝 4자리 · 바꾼 사람 · 시각. 토큰 원문 칸은 더 쓰지 않아요
alter table public.figma_connections alter column access_token_encrypted drop not null;
alter table public.figma_connections add column if not exists vault_secret_id uuid;
alter table public.figma_connections add column if not exists token_last4 text;
alter table public.figma_connections add column if not exists updated_at timestamptz not null default now();
alter table public.figma_connections add column if not exists updated_by uuid references public.members (id) on delete set null;
-- 이 테이블은 멤버 정책이 없어요(브라우저에서 직접 못 읽고 못 써요) — 아래 함수로만

-- 내 워크스페이스
create or replace function public.my_workspace_id()
returns uuid
language sql stable security definer
set search_path = public
as $$ select m.workspace_id from public.members m where m.id = auth.uid() $$;

-- 저장 · 바꾸기 · 지우기(관리자만)
create or replace function public.set_figma_token(p_token text)
returns jsonb
language plpgsql security definer
set search_path = public, vault, extensions
as $$
declare
  ws uuid := public.my_workspace_id();
  cur public.figma_connections;
  tok text := nullif(btrim(coalesce(p_token, '')), '');
  sid uuid;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if ws is null then raise exception 'no workspace'; end if;
  select * into cur from public.figma_connections where workspace_id = ws;

  if tok is null then
    if cur.vault_secret_id is not null then delete from vault.secrets where id = cur.vault_secret_id; end if;
    delete from public.figma_connections where workspace_id = ws;
    return jsonb_build_object('connected', false);
  end if;
  if length(tok) < 20 or length(tok) > 200 or tok !~ '^[A-Za-z0-9_-]+$' then raise exception 'invalid token' using errcode = '22023'; end if;

  if cur.vault_secret_id is not null and exists (select 1 from vault.secrets where id = cur.vault_secret_id) then
    perform vault.update_secret(cur.vault_secret_id, tok);
    sid := cur.vault_secret_id;
  else
    sid := vault.create_secret(tok, 'figma_token_' || ws::text, 'Iris 피그마 토큰');
  end if;

  insert into public.figma_connections (workspace_id, owner_member_id, vault_secret_id, token_last4, last_error, updated_at, updated_by)
  values (ws, auth.uid(), sid, right(tok, 4), null, now(), auth.uid())
  on conflict (workspace_id) do update set vault_secret_id = excluded.vault_secret_id, token_last4 = excluded.token_last4,
    last_error = null, updated_at = now(), updated_by = auth.uid(), access_token_encrypted = null;
  return jsonb_build_object('connected', true, 'last4', right(tok, 4));
end $$;

-- 상태(멤버) — 토큰은 돌려주지 않아요
create or replace function public.figma_status()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select case when not public.is_member() then null else coalesce(
    (select jsonb_build_object('connected', c.vault_secret_id is not null, 'last4', c.token_last4, 'last_error', c.last_error, 'updated_at', c.updated_at)
       from public.figma_connections c where c.workspace_id = public.my_workspace_id()),
    jsonb_build_object('connected', false)) end
$$;

-- 피그마 읽기(멤버) — 정해진 주소만, GET 만
create or replace function public.figma_fetch(p_path text)
returns jsonb
language plpgsql volatile security definer
set search_path = public, vault, extensions
as $$
declare
  ws uuid := public.my_workspace_id();
  tok text;
  r extensions.http_response;
  ra text;
  body jsonb;
begin
  if not public.is_member() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_path is null or p_path !~ '^/v1/(files/[A-Za-z0-9]+(/nodes|/images)?|images/[A-Za-z0-9]+)(\?[A-Za-z0-9=&%:;,._-]*)?$' then
    raise exception 'path not allowed' using errcode = '22023';
  end if;
  select s.decrypted_secret into tok
    from public.figma_connections c join vault.decrypted_secrets s on s.id = c.vault_secret_id
   where c.workspace_id = ws;
  if tok is null then return jsonb_build_object('status', 503, 'code', 'no_token'); end if;

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '25000');
  select * into r from extensions.http((
    'GET', 'https://api.figma.com' || p_path,
    array[extensions.http_header('X-Figma-Token', tok)], null, null
  )::extensions.http_request);

  select h.value into ra from unnest(r.headers) h where lower(h.field) = 'retry-after' limit 1;
  begin body := r.content::jsonb; exception when others then body := null; end;

  -- 토큰이 틀렸거나 만료됐으면 상태에 남겨 둬요(관리자 화면에 보여요). 성공하면 지워요
  if r.status in (401, 403) and coalesce(body->>'err', body->>'message', '') ilike '%token%' then
    update public.figma_connections set last_error = 'invalid_token' where workspace_id = ws;
  elsif r.status = 200 then
    update public.figma_connections set last_error = null where workspace_id = ws and last_error is not null;
  end if;
  return jsonb_build_object('status', r.status, 'retry_after', ra, 'body', body);
end $$;

revoke all on function public.set_figma_token(text) from public, anon;
revoke all on function public.figma_status() from public, anon;
revoke all on function public.figma_fetch(text) from public, anon;
revoke all on function public.my_workspace_id() from public, anon;
grant execute on function public.set_figma_token(text) to authenticated;
grant execute on function public.figma_status() to authenticated;
grant execute on function public.figma_fetch(text) to authenticated;
grant execute on function public.my_workspace_id() to authenticated;
