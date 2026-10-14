-- =====================================================================
--  อัปเดตครั้งที่ 2: ล็อกอินด้วยชื่อผู้ใช้ + แอดมินลบผู้ใช้ได้
--  วิธีใช้: Supabase → SQL Editor → New query → วางไฟล์นี้ทั้งหมด → Run
--  (รันซ้ำได้ ข้อมูลเดิมไม่หาย)
-- =====================================================================

-- ชื่อผู้ใช้ (ไม่ซ้ำกัน ไม่สนตัวพิมพ์เล็ก/ใหญ่และช่องว่างหน้าหลัง)
alter table public.profiles add column if not exists username text;
create unique index if not exists profiles_username_key
  on public.profiles (lower(trim(username))) where username is not null;

-- ตอนสมัคร: เก็บชื่อผู้ใช้ด้วย (ถ้าชื่อซ้ำ ให้เว้นว่างไว้ แอดมินกำหนดภายหลังได้)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare uname text := nullif(trim(new.raw_user_meta_data->>'username'), '');
begin
  if uname is not null and exists (
       select 1 from public.profiles where lower(trim(username)) = lower(uname)) then
    uname := null;
  end if;
  insert into public.profiles (id, email, full_name, username)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), uname)
  on conflict (id) do nothing;
  return new;
end $$;

-- หน้าเข้าสู่ระบบ: แปลงชื่อผู้ใช้เป็นอีเมล เพื่อล็อกอินกับ Supabase Auth
create or replace function public.login_email(p_username text)
returns text language sql stable security definer set search_path = public as $$
  select email from public.profiles
   where lower(trim(username)) = lower(trim(p_username))
   limit 1;
$$;
revoke all on function public.login_email(text) from public;
grant execute on function public.login_email(text) to anon, authenticated;

-- แอดมินลบผู้ใช้ออกจากระบบ (ลบบัญชีล็อกอินด้วย) ลบตัวเองไม่ได้
create or replace function public.delete_user(p_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'เฉพาะแอดมินเท่านั้น'; end if;
  if p_id = auth.uid() then raise exception 'ลบบัญชีของตัวเองไม่ได้'; end if;
  -- เก็บประวัติเอกสารไว้ แค่ล้างชื่อผู้ทำรายการ
  perform set_config('app.stock_rpc', 'on', true);
  update public.shipments set created_by = null where created_by = p_id;
  update public.shipments set delivered_by = null where delivered_by = p_id;
  update public.stock_movements set created_by = null where created_by = p_id;
  perform set_config('app.stock_rpc', 'off', true);
  delete from auth.users where id = p_id;
end $$;
revoke all on function public.delete_user(uuid) from public, anon;
grant execute on function public.delete_user(uuid) to authenticated;
