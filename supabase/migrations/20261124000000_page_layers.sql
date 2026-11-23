-- 캔버스 위(화면 밖)에 그린 레이어를 페이지에 저장합니다. 구조는 screens.layers 와 같습니다(PRD/02_DATA_MODEL.md 레이어 구조)
alter table public.pages add column if not exists layers jsonb;
