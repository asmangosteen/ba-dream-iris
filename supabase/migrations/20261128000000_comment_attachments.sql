-- 코멘트에 이미지 붙이기(피그마처럼 입력칸 아래 도구 막대의 이미지 버튼 · 붙여 넣기)
-- 파일은 screens 버킷 comments/<프로젝트>/… 에 올리고, 주소('storage://screens/…')만 여기에 남겨요
alter table public.comments add column if not exists attachments text[] not null default '{}';
-- 이미지만 보내도 되게: 글은 비어 있어도 되고(최대 4000자), 글과 이미지가 둘 다 없으면 안 돼요
alter table public.comments drop constraint if exists comments_body_check;
alter table public.comments add constraint comments_body_check check (char_length(body) <= 4000 and (char_length(body) >= 1 or cardinality(attachments) >= 1));

-- 핀 붙는 곳: 캔버스 위 섹션 · 프레임 레이어(페이지 캔버스 레이어 id) — 그 섹션 · 프레임을 옮기면 핀도 같이(x · y 는 그 레이어 기준)
alter table public.comments add column if not exists layer_id text;
-- 영역 코멘트(코멘트 커서로 끌어 그린 점선 네모): 핀과 같은 기준 좌표 { x, y, w, h }
alter table public.comments add column if not exists area jsonb;

-- 이모지 반응(피그마와 같아요): { "👍": ["멤버 id", …] } — 누구나(프로젝트 멤버) 달고, 내가 단 건 다시 누르면 빠져요
alter table public.comments add column if not exists reactions jsonb not null default '{}'::jsonb;
create or replace function public.toggle_reaction(cid uuid, emo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.comments; cur jsonb; ids jsonb; me text := auth.uid()::text;
begin
  if emo is null or char_length(emo) = 0 or char_length(emo) > 16 then raise exception 'bad_emoji' using errcode = '22023'; end if;
  select * into c from public.comments where id = cid for update;
  if c.id is null then raise exception 'not_found' using errcode = '22023'; end if;
  if public.project_role(c.project_id) is null then raise exception 'not_member' using errcode = '42501'; end if;
  cur := coalesce(c.reactions, '{}'::jsonb);
  ids := coalesce(cur -> emo, '[]'::jsonb);
  if ids ? me then
    ids := (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements_text(ids) x where x <> me);
  else
    ids := ids || to_jsonb(me);
  end if;
  if jsonb_array_length(ids) = 0 then cur := cur - emo; else cur := jsonb_set(cur, array[emo], ids, true); end if;
  update public.comments set reactions = cur where id = cid;
  return cur;
end;
$$;
revoke all on function public.toggle_reaction(uuid, text) from public, anon;
grant execute on function public.toggle_reaction(uuid, text) to authenticated;
