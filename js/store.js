// การเชื่อมต่อ Supabase และข้อมูลที่ใช้ร่วมกันหลายหน้า
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const configured = !SUPABASE_URL.includes('YOUR-PROJECT') && !SUPABASE_ANON_KEY.includes('YOUR-ANON');
export const sb = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

export const state = { profile: null, user: null };
export const isAdmin = () => state.profile?.role === 'admin';

// โยน error ของ Supabase ออกมาให้ try/catch จับได้
export async function q(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}

const cache = {};
export function invalidate(...keys) { keys.forEach((k) => delete cache[k]); }

export const getBranches = async () => cache.branches ??=
  await q(sb.from('branches').select('*').order('code'));
export const getCategories = async () => cache.categories ??=
  await q(sb.from('categories').select('*').order('sort_order'));
export const getProducts = async () => cache.products ??=
  await q(sb.from('products').select('*, categories(name)').order('name'));
