create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  query text not null default '',
  report_type text not null,
  period text not null,
  sources jsonb not null default '[]'::jsonb,
  template_filename text,
  openai jsonb,
  gemini jsonb,
  saved_at timestamptz not null default now()
);

alter table public.reports enable row level security;

-- 현재 로그인 기능이 없는 초기 버전용 정책입니다.
-- 로그인 도입 후에는 user_id 컬럼을 추가하고 사용자별 정책으로 교체하세요.
create policy "anonymous can read reports"
on public.reports for select to anon using (true);

create policy "anonymous can create reports"
on public.reports for insert to anon with check (true);
