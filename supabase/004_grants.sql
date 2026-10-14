-- =====================================================================
--  แก้ "permission denied for table ..."
--  Supabase โปรเจกต์ใหม่ไม่ให้สิทธิ์ตารางอัตโนมัติ คำสั่งนี้ให้สิทธิ์ระดับตาราง
--  ส่วนการกันว่าใครเห็น/แก้อะไรได้ ยังคุมด้วย Row Level Security เหมือนเดิม
--  วิธีใช้: Supabase → SQL Editor → New query → วางทั้งหมด → Run (รันซ้ำได้)
-- =====================================================================
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- ฟังก์ชันที่ห้ามคนไม่ล็อกอินเรียก
revoke execute on function public.delete_user(uuid) from anon;
