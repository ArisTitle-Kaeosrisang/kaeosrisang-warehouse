// ตั้งค่าการเชื่อมต่อ Supabase
// ไปที่ Supabase Dashboard → Project Settings → API แล้วคัดลอกค่ามาใส่
// ใช้เฉพาะ "anon public" key เท่านั้น ห้ามใส่ service_role key เด็ดขาด
export const SUPABASE_URL = 'https://zcfnmegtzgxxacpctwnr.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjZm5tZWd0emd4eGFjcGN0d25yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5NzcyMzksImV4cCI6MjEwNzU1MzIzOX0.-XNvLzmytB6SNUSEt7mfWcyskbtQ8Z18p4xOb5CR1yU';

// โหมดทดสอบ: true = เข้าใช้ทุกเมนูได้ทันทีโดยไม่ต้องล็อกอิน (ต้องรัน supabase/003_open_mode.sql ด้วย)
// ⚠️ ระหว่างเปิด ใครมีลิงก์ก็เห็นและแก้ข้อมูลได้ เมื่อทดสอบเสร็จให้เปลี่ยนเป็น false
export const OPEN_MODE = true;

export const COMPANY = {
  name: 'แก้วศรีสังข์ เซอร์วิส',
  system: 'Smart (KAEOSRISANG) Warehouse',
  address: '',   // ที่อยู่บริษัท (แสดงบนหัวใบส่งสินค้า PDF)
  phone: '',     // เบอร์โทรบริษัท
};
