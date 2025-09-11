// supabaseClient.js
// Node（サーバー）専用：必ず service_role を使用して RLS を回避するクライアント。
// - 必須: SUPABASE_URL, SUPABASE_SERVICE_KEY（= service_role）
// - ない場合は起動失敗（anon には一切フォールバックしない）
// - セッション保存/自動更新は無効化（サーバー実行前提）

import { createClient } from '@supabase/supabase-js'

// ==== 必須環境変数 ====
const rawUrl = process.env.SUPABASE_URL
const serviceKey =
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||      // 互換
  process.env.SUPABASE_SERVICE_ROLE ||          // 互換
  ''                                            // ← ここで打ち切り（anon へは落とさない）

// URL の軽いバリデーション & 後処理
function normalizeUrl(u) {
  if (!u || typeof u !== 'string') return ''
  const t = u.trim()
  // 例: https://xxxx.supabase.co / https://xxxx.supabase.co/
  if (!/^https?:\/\//i.test(t) || !/supabase\.co/i.test(t)) return t.replace(/\/+$/, '')
  return t.replace(/\/+$/, '')
}

const supabaseUrl = normalizeUrl(rawUrl)

// ==== フェイルファスト（起動時に落として気づけるように） ====
if (!supabaseUrl) {
  console.error('[supabaseClient] FATAL: SUPABASE_URL is missing')
  process.exit(1)
}
if (!serviceKey) {
  console.error(
    '[supabaseClient] FATAL: SUPABASE_SERVICE_KEY (service_role) is missing.\n' +
      '  Set SUPABASE_SERVICE_KEY from Supabase → Settings → API → Service role secret.'
  )
  process.exit(1)
}
if (process.env.SUPABASE_ANON_KEY) {
  // 誤設定の気づき用（実害はないがログで注意喚起）
  console.warn(
    '[supabaseClient] WARN: SUPABASE_ANON_KEY is set but will NOT be used on server (service_role enforced).'
  )
}

// どのキーを使っているかだけ表示（値は出さない）
console.log('[supabaseClient] using service_role key')

// ==== クライアント生成（サーバー利用向け） ====
export const supabase = createClient(supabaseUrl, serviceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})
