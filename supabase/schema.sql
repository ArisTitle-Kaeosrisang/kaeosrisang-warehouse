-- =====================================================================
--  Smart (KAEOSRISANG) Warehouse — แก้วศรีสังข์ เซอร์วิส
--  ฐานข้อมูล Supabase (PostgreSQL)
--  วิธีใช้: Supabase Dashboard → SQL Editor → New query → วางไฟล์นี้ทั้งหมด → Run
--  รันซ้ำได้ (idempotent) ข้อมูลเดิมไม่หาย
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) ตารางหลัก
-- ---------------------------------------------------------------------

-- สาขา
create table if not exists public.branches (
  id          bigint generated always as identity primary key,
  code        text not null unique,
  name        text not null,
  address     text,
  phone       text,
  manager     text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ผู้ใช้ระบบ (ผูกกับ auth.users ของ Supabase)
--   role: admin = แอดมิน, staff = พนักงานสาขา, pending = รออนุมัติ
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  role        text not null default 'pending' check (role in ('admin','staff','pending')),
  branch_id   bigint references public.branches(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- พนักงาน
create table if not exists public.employees (
  id            bigint generated always as identity primary key,
  first_name    text not null,
  last_name     text not null,
  national_id   char(13) not null unique check (national_id ~ '^[0-9]{13}$'),
  birth_date    date,
  phone         text,
  bank_name     text,
  bank_account  text check (bank_account is null or bank_account ~ '^[0-9]{6,20}$'),
  status        text not null default 'ปฏิบัติงาน'
                check (status in ('ปฏิบัติงาน','พักงาน','ลาออก')),
  branch_id     bigint references public.branches(id) on delete set null,
  position      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ประเภทสินค้า
create table if not exists public.categories (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  sort_order  int not null default 0
);

insert into public.categories (name, sort_order) values
  ('วัสดุและอุปกรณ์', 1),
  ('น้ำยาทำความสะอาด', 2),
  ('อุปกรณ์การเกษตร', 3)
on conflict (name) do nothing;

-- สินค้า
create table if not exists public.products (
  id           bigint generated always as identity primary key,
  sku          text unique,
  name         text not null,
  category_id  bigint references public.categories(id) on delete set null,
  unit         text not null default 'ชิ้น',
  price        numeric(12,2) not null default 0 check (price >= 0),
  stock_qty    numeric(12,2) not null default 0 check (stock_qty >= 0),
  min_qty      numeric(12,2) not null default 0 check (min_qty >= 0),
  image_url    text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ใบส่งสินค้า
--   status: draft = ร่าง, shipping = กำลังจัดส่ง, delivered = ส่งแล้ว, cancelled = ยกเลิก
create sequence if not exists public.shipment_no_seq;

create table if not exists public.shipments (
  id            bigint generated always as identity primary key,
  doc_no        text unique,
  branch_id     bigint not null references public.branches(id),
  status        text not null default 'draft'
                check (status in ('draft','shipping','delivered','cancelled')),
  note          text,
  ship_date     date not null default current_date,
  created_by    uuid references auth.users(id) default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  delivered_at  timestamptz,
  delivered_by  uuid references auth.users(id)
);

create table if not exists public.shipment_items (
  id           bigint generated always as identity primary key,
  shipment_id  bigint not null references public.shipments(id) on delete cascade,
  product_id   bigint not null references public.products(id),
  qty          numeric(12,2) not null check (qty > 0),
  unit_price   numeric(12,2) not null default 0,
  unique (shipment_id, product_id)
);

-- ประวัติการเคลื่อนไหวสต็อก (รับเข้า / ตัดออก / คืน)
create table if not exists public.stock_movements (
  id           bigint generated always as identity primary key,
  product_id   bigint not null references public.products(id) on delete cascade,
  change_qty   numeric(12,2) not null,
  reason       text not null,
  shipment_id  bigint references public.shipments(id) on delete set null,
  created_by   uuid references auth.users(id) default auth.uid(),
  created_at   timestamptz not null default now()
);

create index if not exists idx_employees_branch on public.employees(branch_id);
create index if not exists idx_products_category on public.products(category_id);
create index if not exists idx_shipments_branch on public.shipments(branch_id);
create index if not exists idx_shipments_status on public.shipments(status);
create index if not exists idx_items_shipment on public.shipment_items(shipment_id);
create index if not exists idx_items_product on public.shipment_items(product_id);
create index if not exists idx_moves_product on public.stock_movements(product_id);

-- ---------------------------------------------------------------------
-- 2) ฟังก์ชันช่วยเรื่องสิทธิ์
-- ---------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.my_branch() returns bigint
language sql stable security definer set search_path = public as $$
  select branch_id from public.profiles where id = auth.uid() and role = 'staff';
$$;

create or replace function public.is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','staff'));
$$;

-- สร้างโปรไฟล์อัตโนมัติเมื่อมีคนสมัครสมาชิก (สถานะ "รออนุมัติ")
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- อัปเดต updated_at อัตโนมัติ
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_emp_touch on public.employees;
create trigger trg_emp_touch before update on public.employees
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_prod_touch on public.products;
create trigger trg_prod_touch before update on public.products
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_ship_touch on public.shipments;
create trigger trg_ship_touch before update on public.shipments
  for each row execute function public.touch_updated_at();

-- เลขที่เอกสารอัตโนมัติ เช่น SH2610-00001
create or replace function public.set_shipment_no() returns trigger
language plpgsql as $$
begin
  if new.doc_no is null or new.doc_no = '' then
    new.doc_no := 'SH' || to_char(now() at time zone 'Asia/Bangkok', 'YYMM') || '-' ||
                  lpad(nextval('public.shipment_no_seq')::text, 5, '0');
  end if;
  return new;
end $$;

drop trigger if exists trg_ship_no on public.shipments;
create trigger trg_ship_no before insert on public.shipments
  for each row execute function public.set_shipment_no();

-- ป้องกันการเปลี่ยนสถานะเป็น "ส่งแล้ว" หรือแก้ใบที่ส่งแล้วโดยตรง
-- (ต้องผ่านฟังก์ชัน confirm_delivery / revert_delivery เพื่อให้สต็อกถูกต้องเสมอ)
create or replace function public.guard_shipment() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('app.stock_rpc', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' and new.status = 'delivered' then
    raise exception 'ต้องยืนยันการส่งผ่านปุ่ม "ยืนยันส่งแล้ว" เท่านั้น';
  end if;
  if tg_op = 'UPDATE' then
    if old.status = 'delivered' then
      raise exception 'ใบส่งสินค้าที่ส่งแล้วแก้ไขไม่ได้ ให้กด "ยกเลิกการยืนยัน" ก่อน';
    end if;
    if new.status = 'delivered' then
      raise exception 'ต้องยืนยันการส่งผ่านปุ่ม "ยืนยันส่งแล้ว" เท่านั้น';
    end if;
  end if;
  if tg_op = 'DELETE' and old.status = 'delivered' then
    raise exception 'ลบใบส่งสินค้าที่ส่งแล้วไม่ได้ ให้กด "ยกเลิกการยืนยัน" ก่อน';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_guard_shipment on public.shipments;
create trigger trg_guard_shipment before insert or update or delete on public.shipments
  for each row execute function public.guard_shipment();

create or replace function public.guard_shipment_items() returns trigger
language plpgsql as $$
declare st text;
begin
  if coalesce(current_setting('app.stock_rpc', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  select status into st from public.shipments
   where id = coalesce(new.shipment_id, old.shipment_id);
  if st = 'delivered' then
    raise exception 'ใบส่งสินค้าที่ส่งแล้วแก้ไขรายการไม่ได้';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_guard_items on public.shipment_items;
create trigger trg_guard_items before insert or update or delete on public.shipment_items
  for each row execute function public.guard_shipment_items();

-- ---------------------------------------------------------------------
-- 3) ฟังก์ชันจัดการสต็อก (เรียกจากหน้าเว็บผ่าน supabase.rpc)
-- ---------------------------------------------------------------------

-- บันทึกใบส่งสินค้า (สร้างใหม่/แก้ไข) พร้อมรายการในครั้งเดียว (แอดมิน)
--   p_items = [{"product_id":1,"qty":5,"unit_price":50}, ...]
create or replace function public.save_shipment(
  p_id bigint, p_branch_id bigint, p_ship_date date, p_note text, p_status text, p_items jsonb
) returns bigint language plpgsql security definer set search_path = public as $$
declare sid bigint;
begin
  if not public.is_admin() then raise exception 'เฉพาะแอดมินเท่านั้น'; end if;
  if p_status not in ('draft','shipping','cancelled') then
    raise exception 'สถานะไม่ถูกต้อง';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ';
  end if;

  if p_id is null then
    insert into public.shipments (branch_id, ship_date, note, status)
    values (p_branch_id, coalesce(p_ship_date, current_date), p_note, p_status)
    returning id into sid;
  else
    update public.shipments
       set branch_id = p_branch_id, ship_date = coalesce(p_ship_date, ship_date),
           note = p_note, status = p_status
     where id = p_id
     returning id into sid;
    if sid is null then raise exception 'ไม่พบใบส่งสินค้า'; end if;
    delete from public.shipment_items where shipment_id = sid;
  end if;

  insert into public.shipment_items (shipment_id, product_id, qty, unit_price)
  select sid, (x->>'product_id')::bigint, sum((x->>'qty')::numeric),
         max(coalesce((x->>'unit_price')::numeric, 0))
    from jsonb_array_elements(p_items) x
   group by (x->>'product_id')::bigint;

  return sid;
end $$;

-- ยืนยันส่งแล้ว → ตัดสต็อก
create or replace function public.confirm_delivery(p_shipment_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  s   public.shipments%rowtype;
  r   record;
  n   int;
begin
  select * into s from public.shipments where id = p_shipment_id for update;
  if not found then raise exception 'ไม่พบใบส่งสินค้า'; end if;

  if not (public.is_admin() or (public.my_branch() is not null and public.my_branch() = s.branch_id)) then
    raise exception 'ไม่มีสิทธิ์ยืนยันใบส่งสินค้านี้';
  end if;
  if s.status not in ('draft','shipping') then
    raise exception 'ใบส่งสินค้านี้อยู่ในสถานะที่ยืนยันไม่ได้';
  end if;

  select count(*) into n from public.shipment_items where shipment_id = s.id;
  if n = 0 then raise exception 'ใบส่งสินค้ายังไม่มีรายการสินค้า'; end if;

  -- ล็อกสินค้าและตรวจสต็อกก่อนตัด
  for r in
    select i.product_id, i.qty, p.name, p.stock_qty, p.unit
      from public.shipment_items i
      join public.products p on p.id = i.product_id
     where i.shipment_id = s.id
     order by i.product_id
     for update of p
  loop
    if r.stock_qty < r.qty then
      raise exception 'สต็อก "%" ไม่พอ (คงเหลือ % %, ต้องการ % %)',
        r.name, r.stock_qty, r.unit, r.qty, r.unit;
    end if;
  end loop;

  perform set_config('app.stock_rpc', 'on', true);

  update public.products p
     set stock_qty = p.stock_qty - i.qty
    from public.shipment_items i
   where i.shipment_id = s.id and p.id = i.product_id;

  insert into public.stock_movements (product_id, change_qty, reason, shipment_id, created_by)
  select product_id, -qty, 'จ่ายไปสาขา ' || s.doc_no, s.id, auth.uid()
    from public.shipment_items where shipment_id = s.id;

  update public.shipments
     set status = 'delivered', delivered_at = now(), delivered_by = auth.uid()
   where id = s.id;

  perform set_config('app.stock_rpc', 'off', true);
end $$;

-- ยกเลิกการยืนยัน (แอดมิน) → คืนสต็อก แล้วกลับเป็น "กำลังจัดส่ง" เพื่อแก้ไขได้
create or replace function public.revert_delivery(p_shipment_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare s public.shipments%rowtype;
begin
  if not public.is_admin() then raise exception 'เฉพาะแอดมินเท่านั้น'; end if;
  select * into s from public.shipments where id = p_shipment_id for update;
  if not found then raise exception 'ไม่พบใบส่งสินค้า'; end if;
  if s.status <> 'delivered' then raise exception 'ใบส่งสินค้านี้ยังไม่ได้ยืนยันส่ง'; end if;

  perform set_config('app.stock_rpc', 'on', true);

  update public.products p
     set stock_qty = p.stock_qty + i.qty
    from public.shipment_items i
   where i.shipment_id = s.id and p.id = i.product_id;

  insert into public.stock_movements (product_id, change_qty, reason, shipment_id, created_by)
  select product_id, qty, 'ยกเลิกการยืนยัน ' || s.doc_no, s.id, auth.uid()
    from public.shipment_items where shipment_id = s.id;

  update public.shipments
     set status = 'shipping', delivered_at = null, delivered_by = null
   where id = s.id;

  perform set_config('app.stock_rpc', 'off', true);
end $$;

-- รับสินค้าเข้าคลัง / ปรับยอดสต็อก (แอดมิน)
create or replace function public.adjust_stock(p_product_id bigint, p_change numeric, p_reason text)
returns numeric language plpgsql security definer set search_path = public as $$
declare new_qty numeric;
begin
  if not public.is_admin() then raise exception 'เฉพาะแอดมินเท่านั้น'; end if;
  if p_change = 0 then raise exception 'จำนวนต้องไม่เป็นศูนย์'; end if;

  update public.products set stock_qty = stock_qty + p_change
   where id = p_product_id
   returning stock_qty into new_qty;
  if not found then raise exception 'ไม่พบสินค้า'; end if;

  insert into public.stock_movements (product_id, change_qty, reason, created_by)
  values (p_product_id, p_change, coalesce(nullif(p_reason,''), 'ปรับยอด'), auth.uid());
  return new_qty;
exception when check_violation then
  raise exception 'ยอดสต็อกติดลบไม่ได้';
end $$;

-- ห้ามแก้ stock_qty ตรงๆ (ต้องผ่าน adjust_stock เพื่อมีประวัติ)
create or replace function public.guard_product_stock() returns trigger
language plpgsql as $$
begin
  if new.stock_qty is distinct from old.stock_qty
     and coalesce(current_setting('app.stock_rpc', true), '') <> 'on'
     and current_user not in ('postgres','supabase_admin','service_role') then
    -- adjust_stock เป็น security definer จึงรันเป็นเจ้าของฟังก์ชัน (postgres)
    raise exception 'แก้ยอดสต็อกได้ผ่านเมนู "รับเข้า/ปรับยอด" เท่านั้น';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_stock on public.products;
create trigger trg_guard_stock before update on public.products
  for each row execute function public.guard_product_stock();

-- ---------------------------------------------------------------------
-- 4) วิวสำหรับรายงาน (ใช้สิทธิ์ของผู้เรียก)
-- ---------------------------------------------------------------------
create or replace view public.v_dispatch_lines
with (security_invoker = true) as
select
  s.id            as shipment_id,
  s.doc_no,
  s.branch_id,
  b.name          as branch_name,
  coalesce(s.delivered_at, s.created_at) as delivered_at,
  to_char(coalesce(s.delivered_at, s.created_at) at time zone 'Asia/Bangkok', 'YYYY-MM') as month,
  i.product_id,
  p.name          as product_name,
  p.unit,
  c.id            as category_id,
  coalesce(c.name, 'ไม่ระบุประเภท') as category_name,
  i.qty,
  i.unit_price,
  i.qty * i.unit_price as amount
from public.shipments s
join public.branches b on b.id = s.branch_id
join public.shipment_items i on i.shipment_id = s.id
join public.products p on p.id = i.product_id
left join public.categories c on c.id = p.category_id
where s.status = 'delivered';

-- ---------------------------------------------------------------------
-- 5) Row Level Security
-- ---------------------------------------------------------------------
alter table public.branches        enable row level security;
alter table public.profiles        enable row level security;
alter table public.employees       enable row level security;
alter table public.categories      enable row level security;
alter table public.products        enable row level security;
alter table public.shipments       enable row level security;
alter table public.shipment_items  enable row level security;
alter table public.stock_movements enable row level security;

-- ลบ policy เดิม (เพื่อรันซ้ำได้)
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public'
           and tablename in ('branches','profiles','employees','categories','products',
                             'shipments','shipment_items','stock_movements')
  loop execute format('drop policy %I on public.%I', r.policyname, r.tablename); end loop;
end $$;

-- profiles: เห็นของตัวเอง, แอดมินเห็น/แก้ได้ทั้งหมด
create policy p_profiles_self  on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy p_profiles_admin on public.profiles for update using (public.is_admin()) with check (public.is_admin());
create policy p_profiles_del   on public.profiles for delete using (public.is_admin());

-- branches / categories / products: ผู้ที่อนุมัติแล้วดูได้, แอดมินแก้ได้
create policy p_branches_read  on public.branches for select using (public.is_approved());
create policy p_branches_admin on public.branches for all using (public.is_admin()) with check (public.is_admin());
create policy p_cat_read       on public.categories for select using (public.is_approved());
create policy p_cat_admin      on public.categories for all using (public.is_admin()) with check (public.is_admin());
create policy p_prod_read      on public.products for select using (public.is_approved());
create policy p_prod_admin     on public.products for all using (public.is_admin()) with check (public.is_admin());

-- employees: แอดมินเท่านั้น (มีเลขบัตรประชาชน/บัญชีธนาคาร)
create policy p_emp_admin on public.employees for all using (public.is_admin()) with check (public.is_admin());

-- shipments: แอดมินทั้งหมด, พนักงานสาขาเห็นเฉพาะสาขาตัวเอง
create policy p_ship_read  on public.shipments for select
  using (public.is_admin() or branch_id = public.my_branch());
create policy p_ship_admin on public.shipments for all using (public.is_admin()) with check (public.is_admin());

create policy p_items_read on public.shipment_items for select
  using (public.is_admin() or exists (select 1 from public.shipments s
         where s.id = shipment_id and s.branch_id = public.my_branch()));
create policy p_items_admin on public.shipment_items for all using (public.is_admin()) with check (public.is_admin());

create policy p_moves_admin on public.stock_movements for select using (public.is_admin());

-- สิทธิ์เรียกฟังก์ชัน
revoke all on function public.save_shipment(bigint, bigint, date, text, text, jsonb) from public, anon;
grant execute on function public.save_shipment(bigint, bigint, date, text, text, jsonb) to authenticated;
revoke all on function public.confirm_delivery(bigint) from public, anon;
revoke all on function public.revert_delivery(bigint) from public, anon;
revoke all on function public.adjust_stock(bigint, numeric, text) from public, anon;
grant execute on function public.confirm_delivery(bigint) to authenticated;
grant execute on function public.revert_delivery(bigint) to authenticated;
grant execute on function public.adjust_stock(bigint, numeric, text) to authenticated;

grant select on public.v_dispatch_lines to authenticated;

-- ---------------------------------------------------------------------
-- 6) ที่เก็บรูปสินค้า (Supabase Storage)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "product images read"   on storage.objects;
drop policy if exists "product images insert" on storage.objects;
drop policy if exists "product images update" on storage.objects;
drop policy if exists "product images delete" on storage.objects;

create policy "product images read"   on storage.objects for select
  using (bucket_id = 'product-images');
create policy "product images insert" on storage.objects for insert
  with check (bucket_id = 'product-images' and public.is_admin());
create policy "product images update" on storage.objects for update
  using (bucket_id = 'product-images' and public.is_admin());
create policy "product images delete" on storage.objects for delete
  using (bucket_id = 'product-images' and public.is_admin());

-- =====================================================================
-- หลังรันเสร็จ: สมัครสมาชิกผ่านหน้าเว็บ 1 ครั้ง แล้วรันคำสั่งนี้เพื่อตั้งตัวเองเป็นแอดมิน
--   update public.profiles set role = 'admin' where email = 'อีเมลของคุณ';
-- =====================================================================
