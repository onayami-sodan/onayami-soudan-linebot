// services/server.js
import 'dotenv/config'
import express from 'express'
import { middleware as lineMiddleware } from '@line/bot-sdk'
import { safeReply } from './lineClient.js'

// ▼ ルーター（存在するパス名に合わせて調整してね）
import handleRenai from '../apps/renai-diagnosis/router.js'
import handlePalm  from '../apps/palmistry-note/router.js'
import handleAI    from '../apps/ai-line/router.js'         // 例: apps/ai-line/router.js

/* =========================
   基本設定
   ========================= */
const PORT = process.env.PORT || 3000
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET

const app = express()
app.use(express.json())

/* =========================
   ヘルスチェック
   ========================= */
app.get('/', (_req, res) => res.status(200).send('multi-app bot running'))
app.get('/healthz', (_req, res) => res.status(200).json({ ok: true }))

/* =========================
   Webhook
   ========================= */
app.post(
  '/webhook',
  lineMiddleware({
    channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: LINE_CHANNEL_SECRET
  }),
  async (req, res) => {
    const events = Array.isArray(req.body?.events) ? req.body.events : []
    await Promise.all(events.map(handleEventSafely))
    res.status(200).end()
  }
)

/* =========================
   ルーティング判定
   ========================= */
function detectAppFromText(text) {
  const t = (text || '').toLowerCase()

  // 手相キーワード
  if (t.includes('手相') || t.includes('palm') || t.includes('てのひら')) return 'palm'

  // AI相談キーワード
  if (t.includes('ai相談') || t.includes('ai') || t.includes('相談') || t.includes('カウンセリング'))
    return 'ai'

  // 恋愛診断キーワード（明示）
  if (t.includes('恋愛') || t.includes('診断') || t.includes('恋愛診断')) return 'renai'

  // 既定は恋愛診断
  return 'renai'
}

async function sendMainMenu(replyToken) {
  const text =
    'メニューを選んでください👇\n' +
    '・手相占い（「手相」と送信）\n' +
    '・AI相談（「AI相談」と送信）\n' +
    '・恋愛診断（「恋愛診断」と送信）'
  const quick = {
    items: [
      { type: 'action', action: { type: 'message', label: '手相占い', text: '手相' } },
      { type: 'action', action: { type: 'message', label: 'AI相談', text: 'AI相談' } },
      { type: 'action', action: { type: 'message', label: '恋愛診断', text: '恋愛診断' } }
    ]
  }
  await safeReply(replyToken, [{ type: 'text', text, quickReply: quick }])
}

/* =========================
   イベント処理
   ========================= */
async function handleEventSafely(event) {
  try {
    // フォロー時はメニューを表示
    if (event.type === 'follow') {
      return sendMainMenu(event.replyToken)
    }

    // 以降はテキストのみ扱う（画像やスタンプは各ルーター側で必要に応じて対応）
    const isText = event?.type === 'message' && event?.message?.type === 'text'
    if (!isText) return

    const text = (event.message.text || '').trim()

    // 共通メニュー表示コマンド
    if (text === 'メニュー' || text === 'menu' || text === 'MENU') {
      return sendMainMenu(event.replyToken)
    }

    // どのアプリへ流すかを判定
    const app = detectAppFromText(text)

    if (app === 'palm')   return handlePalm(event)   // 手相占い
    if (app === 'ai')     return handleAI(event)     // AI相談
    return handleRenai(event)                        // 恋愛診断（既定）
  } catch (err) {
    console.error('[ERROR] event handling failed:', err)
    if (event?.replyToken) {
      try {
        await safeReply(event.replyToken, 'エラーが発生しました。少し待ってからもう一度お試しください🙏')
      } catch {}
    }
  }
}

/* =========================
   起動
   ========================= */
app.listen(PORT, () => {
  console.log(`listening on ${PORT}`)
})
