-- =====================================================================
--  โหมดทดสอบ (เปิดใช้ทุกเมนูโดยไม่ต้องล็อกอิน)
--  วิธีใช้: Supabase → SQL Editor → New query → วางไฟล์นี้ทั้งหมด → Run
--
--  ⚠️ ระหว่างเปิดโหมดนี้ ใครมีลิงก์เว็บก็เห็นและแก้ข้อมูลได้ทั้งหมด
--     ใช้ข้อมูลสมมติเท่านั้น
--
--  ปิดโหมดทดสอบ (กลับไปต้องล็อกอิน):
--     update public.app_settings set open_mode = false where id = 1;
--  และแก้ OPEN_MODE ใน js/config.js เป็น false
-- =====================================================================

create table if not exists public.app_settings (
  id         int primary key default 1 check (id = 1),
  open_mode  boolean not null default false
);
alter table public.app_settings enable row level security;  -- แก้ได้จาก SQL Editor เท่านั้น
insert into public.app_settings (id) values (1) on conflict (id) do nothing;

create or replace function public.open_mode() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select open_mode from public.app_settings where id = 1), false);
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.open_mode()
      or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select public.open_mode()
      or exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','staff'));
$$;

-- ให้ผู้ที่ยังไม่ล็อกอินเรียกฟังก์ชันได้ (ฟังก์ชันตรวจสิทธิ์ข้างในอยู่แล้ว
-- เมื่อปิดโหมดทดสอบ คนที่ไม่ล็อกอินจะถูกปฏิเสธเหมือนเดิม)
grant execute on function public.open_mode() to anon, authenticated;
grant execute on function public.save_shipment(bigint, bigint, date, text, text, jsonb) to anon;
grant execute on function public.confirm_delivery(bigint) to anon;
grant execute on function public.revert_delivery(bigint) to anon;
grant execute on function public.adjust_stock(bigint, numeric, text) to anon;
grant select on public.v_dispatch_lines to anon;

-- เปิดโหมดทดสอบ
update public.app_settings set open_mode = true where id = 1;
