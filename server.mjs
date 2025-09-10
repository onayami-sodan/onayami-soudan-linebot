/*
 =========================
  server.mjs（本番運用 ESM｜LINE署名検証＋冪等化＋200速返し＋ヘルスチェック）
 =========================
*/
import 'dotenv/config'
import express from 'express'
import crypto from 'crypto'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { dispatchEvent } from './dispatcher.mjs'
import { supabase } from './supabaseClient.js'

// ===== 環境変数（キー名の揺れに両対応） =====
const CHANNEL_SECRET =
  process.env.CHANNEL_SECRET || process.env.LINE_CHANNEL_SECRET
const PORT = Number(process.env.PORT || 3000)

if (!CHANNEL_SECRET) {
  console.error('[FATAL] CHANNEL_SECRET が未設定です。Environment を確認してください。')
  process.exit(1)
}

const app = express()

// Render/プロキシ環境向け（レート制限のIP判定用）
app.set('trust proxy', 1)

// 署名検証で使う raw body を保持（JSONパース前）
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf // Buffer のまま保存
    },
  })
)

// セキュリティヘッダ（必要最低限）
app.use(
  helmet({
    // 追加の制約が必要になったらここに追記（例：contentSecurityPolicy 等）
  })
)

// 簡易レート制限（/health は除外）
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/health',
  })
)

// ===== 署名検証 =====
function verifyLineSignature(req, res, next) {
  try {
    const signature = req.get('x-line-signature') || ''
    const rawBody = req.rawBody
    if (!rawBody || !signature) return res.status(400).send('Bad Request')

    const computed = crypto
      .createHmac('sha256', CHANNEL_SECRET)
      .update(rawBody)
      .digest('base64')

    if (computed !== signature) return res.status(403).send('Invalid signature')
    next()
  } catch (e) {
    console.error('[SIGNATURE VERIFY ERROR]', e)
    return res.status(500).send('Internal Error')
  }
}

// ===== 冪等化（Supabase） =====
// create table if not exists webhook_events (
//   event_id text primary key,
//   created_at timestamptz default now()
// );
async function isDuplicateEvent(eventId) {
  if (!eventId) return false
  const { error } = await supabase.from('webhook_events').insert({ event_id: eventId })
  if (error && error.code === '23505') return true // 一意制約違反＝重複
  if (error) {
    console.error('[IDEMPOTENCY ERROR]', error)
    return false // エラー時は処理続行（安全側）
  }
  return false
}

// ===== Webhook =====
app.post('/webhook', verifyLineSignature, async (req, res) => {
  // 1) 200速返し
  res.sendStatus(200)

  const events = Array.isArray(req.body?.events) ? req.body.events : []

  // 2) 背後で並列処理（個別 try/catch）
  await Promise.allSettled(
    events.map(async (ev) => {
      try {
        const redelivery = ev?.deliveryContext?.redelivery === true
        const eventId = ev?.message?.id || ev?.webhookEventId || ev?.eventId
        const dup = await isDuplicateEvent(eventId)
        if (dup || redelivery) {
          console.log('[SKIP DUPLICATE]', { eventId, redelivery })
          return
        }
        await dispatchEvent(ev)
      } catch (e) {
        console.error('[EVENT ERROR]', e, { ev })
      }
    })
  )
})

// ===== ヘルスチェック & ルート =====
app.get('/health', async (_req, res) => {
  try {
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

app.get('/', (_req, res) => res.status(200).send('ok'))

// ===== フォールバック（未捕捉エラー） =====
app.use((err, _req, res, _next) => {
  console.error('[UNCAUGHT ERROR]', err)
  res.status(500).send('Internal Server Error')
})

// ===== 起動 & Graceful shutdown =====
const server = app.listen(PORT, () => {
  console.log(`[BOOT] listening on :${PORT}`)
})

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`[SHUTDOWN] ${sig} received`)
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 5000)
  })
}
