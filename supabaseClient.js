// supabaseClient.js
// Node（サーバー）側専用の Supabase クライアント。
// - service_role を最優先で使用（RLSを回避して Storage へ書き込み可能）
// - 環境変数名のゆらぎに広く対応
// - サーバー実行なのでセッション保存/自動更新は無効化

import { createClient } from '@supabase/supabase-js'

// 必須：プロジェクトURL
const supabaseUrl = process.env.SUPABASE_URL

// 優先順位：SERVICE_KEY → SERVICE_ROLE_KEY → SERVICE_ROLE → ANON_KEY
const supabaseKey =
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error('[supabaseClient] SUPABASE_URL が設定されていません')
}
if (!supabaseKey) {
  throw new Error(
    '[supabaseClient] Supabaseの鍵が見つかりません。' +
      'SUPABASE_SERVICE_KEY（推奨）または SUPABASE_SERVICE_ROLE_KEY を設定してください'
  )
}

// どのキー種別か（ログに鍵そのものは出さない）
;(function logKeyType() {
  const t = process.env.SUPABASE_SERVICE_KEY
    ? 'service_role (SUPABASE_SERVICE_KEY)'
    : process.env.SUPABASE_SERVICE_ROLE_KEY
    ? 'service_role (SUPABASE_SERVICE_ROLE_KEY)'
    : process.env.SUPABASE_SERVICE_ROLE
    ? 'service_role (SUPABASE_SERVICE_ROLE)'
    : 'anon (SUPABASE_ANON_KEY)'
  console.log(`[supabaseClient] using key: ${t}`)
})()

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})
