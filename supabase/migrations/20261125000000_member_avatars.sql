-- 프로필 사진: members.avatar_url 에 'storage://avatars/<멤버 id>/<시각>.webp' 를 넣어요(없으면 이니셜).
-- 사진 파일은 비공개 avatars 저장소에 두고, 멤버만 서명 URL 로 읽어요(documents · screens 와 같은 방식).
alter table public.members add column if not exists avatar_url text;

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', false)
on conflict (id) do nothing;

-- 읽기: 멤버 누구나 / 올리기 · 지우기: 자기 폴더(<내 id>/…)만
create policy "멤버는 프로필 사진을 읽는다" on storage.objects for select using (bucket_id = 'avatars' and public.is_member());
create policy "본인 프로필 사진만 올린다" on storage.objects for insert with check (bucket_id = 'avatars' and public.is_member() and (storage.foldername(name))[1] = auth.uid()::text);
create policy "본인 프로필 사진만 지운다" on storage.objects for delete using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
