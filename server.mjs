// server.mjs — 本番運用向け（ESM）
// - LINE署名検証（x-line-signature）
// - raw body保持（検証用）
// - 冪等化（eventIdで重複処理スキップ; Supabaseテーブル利用）
// - 200速返し（処理は背後で実行）
// - ヘルスチェック / セキュリティヘッダ / 最低限のレート制限

import 'dotenv/config'
import express from 'express'
import crypto from 'crypto'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { dispatchEvent } from './dispatcher.mjs'
import { supabase } from './supabaseClient.js'

// ========= 環境変数 =========
const CHANNEL_SECRET = process.env.CHANNEL_SECRET
const PORT = process.env.PORT || 3000
if (!CHANNEL_SECRET) {
  console.error('[FATAL] CHANNEL_SECRET が未設定です。環境変数を確認してください。')
  process.exit(1)
}

// ========= アプリ初期化 =========
const app = express()

// 署名検証で使う raw body を保持するための設定（JSONパース前）
app.use(
  express.json({
    verify: (req, _res, buf) => {
      // 生バイト列を保存しておく（署名検証に使用）
      req.rawBody = buf
    },
  })
)

// セキュリティヘッダ
app.use(
  helmet({
    // LINE側がUser-Agentや一部ヘッダを期待するが、helmetデフォルトで問題ない
  })
)

// 簡易レート制限（IP単位／WebhookはLINE固定だが、念のため）
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120, // 1分120リクエスト（十分ゆるめ）
    standardHeaders: true,
    legacyHeaders: false,
  })
)

// ========= 署名検証ミドルウェア =========
function verifyLineSignature(req, res, next) {
  try {
    const signature = req.get('x-line-signature') || ''
    const rawBody = req.rawBody
    if (!rawBody || !signature) {
      return res.status(400).send('Bad Request')
    }
    const computed = crypto
      .createHmac('sha256', CHANNEL_SECRET)
      .update(rawBody)
      .digest('base64')
    if (computed !== signature) {
      return res.status(403).send('Invalid signature')
    }
    next()
  } catch (e) {
    console.error('[SIGNATURE VERIFY ERROR]', e)
    return res.status(500).send('Internal Error')
  }
}

// ========= 冪等化（Supabase） =========
// テーブル例：
// create table if not exists webhook_events (
//   event_id text primary key,
//   created_at timestamptz default now()
// );
async function isDuplicateEvent(eventId) {
  if (!eventId) return false
  const { error } = await supabase
    .from('webhook_events')
    .insert({ event_id: eventId })
  // 一意制約違反なら duplicate とみなす
  if (error && error.code === '23505') return true
  if (error) {
    console.error('[IDEMPOTENCY ERROR]', error)
    // エラー時は安全側で duplicate 扱いにはしない
    return false
  }
  return false
}

// ========= Webhook =========
app.post('/webhook', verifyLineSignature, async (req, res) => {
  // 1) 200を速返し
  res.sendStatus(200)

  const body = req.body || {}
  const events = Array.isArray(body.events) ? body.events : []

  // 2) 各イベントを非同期で処理（重かったら落ちないよう個別try/catch）
  //    ※並列で良いが、外部API制限に応じて必要なら直列化など調整
  await Promise.allSettled(
    events.map(async (ev) => {
      try {
        // a) LINEの再送フラグを確認（参考）
        const redelivery = ev?.deliveryContext?.redelivery === true

        // b) 冪等化（eventIdで一度きり）
        const eventId = ev?.message?.id || ev?.webhookEventId || ev?.eventId
        const dup = await isDuplicateEvent(eventId)
        if (dup || redelivery) {
          // 重複は処理しない（ログのみ）
          console.log('[SKIP DUPLICATE]', { eventId, redelivery })
          return
        }

        // c) 実処理：dispatcherに委譲
        await dispatchEvent(ev)
      } catch (e) {
        console.error('[EVENT ERROR]', e, { ev })
      }
    })
  )
})

// ========= ヘルスチェック =========
app.get('/health', async (_req, res) => {
  try {
    // DB疎通の軽い確認（不要なら削除可）
    const { error } = await supabase.from('webhook_events').select('event_id').limit(1)
    if (error) throw error
    res.status(200).json({
      ok: true,
      service: 'line-webhook',
      version: '1.0.0',
      time: new Date().toISOString(),
    })
  } catch (e) {
    console.error('[HEALTH ERROR]', e)
    res.status(500).json({ ok: false, error: 'db_unreachable' })
  }
})

// ========= エラーハンドラ（最後） =========
app.use((err, _req, res, _next) => {
  console.error('[UNCAUGHT ERROR]', err)
  res.status(500).send('Internal Server Error')
})

// ========= 起動 =========
app.listen(PORT, () => {
  console.log(`[BOOT] listening on :${PORT}`)
})
