// supabaseClient.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey =
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
// サーバー側は基本的に SERVICE_KEY を使う
// （Render の環境変数に SUPABASE_SERVICE_KEY を追加しておく）

export const supabase = createClient(supabaseUrl, supabaseKey)
