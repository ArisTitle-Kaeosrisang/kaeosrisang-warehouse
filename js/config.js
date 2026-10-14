// ตั้งค่าการเชื่อมต่อ Supabase
// ไปที่ Supabase Dashboard → Project Settings → API แล้วคัดลอกค่ามาใส่
// ใช้เฉพาะ "anon public" key เท่านั้น ห้ามใส่ service_role key เด็ดขาด
export const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY';

export const COMPANY = {
  name: 'แก้วศรีสังข์ เซอร์วิส',
  system: 'Smart (KAEOSRISANG) Warehouse',
  address: '',   // ที่อยู่บริษัท (แสดงบนหัวใบส่งสินค้า PDF)
  phone: '',     // เบอร์โทรบริษัท
};
