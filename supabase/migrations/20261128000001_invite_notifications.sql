-- 초대 · 참여 요청을 처리하면(승인 · 거절 · 취소 · 만료) 그 요청 알림을 받은 사람 모두의 알림도 '처리됨'으로:
-- 읽음 처리 + payload.decided 에 결과 — 한 사람이 처리했는데 다른 방장 · 부방장 알림에 '승인 필요'가 남지 않게
create or replace function public.invite_settled()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status <> 'pending' then
    update public.notifications
      set read_at = coalesce(read_at, now()), payload = payload || jsonb_build_object('decided', new.status)
      where target_type = 'invite' and target_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists invite_settled on public.project_invites;
create trigger invite_settled after update of status on public.project_invites for each row execute function public.invite_settled();
