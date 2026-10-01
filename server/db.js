import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

let supabase;

export async function initDb() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the project .env file. See .env.example.'
    );
  }

  supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { error } = await supabase.from('products').select('id').limit(1);
  if (error) {
    supabase = undefined;
    throw new Error(
      `Could not connect to Supabase: ${error.message}. Make sure supabase/schema.sql has been run.`
    );
  }

  console.log('Connected to Supabase.');
  return supabase;
}

export function getSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not initialized. Check the server startup error.');
  }
  return supabase;
}
