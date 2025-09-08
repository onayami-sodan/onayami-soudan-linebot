// services/server.js
import 'dotenv/config'
import express from 'express'
import { middleware as lineMiddleware } from '@line/bot-sdk'
import { safeReply } from './lineClient.js'

// 3本のルーター
import handleRenai from '../apps/renai-diagnosis/router.js'
import handlePalm  from '../apps/palmistry-note/router.js'
import handleAI    from '../apps/ai-line/router.js'

/* ===== 基本設定 ===== */
const PORT = process.env.PORT || 3000
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET

const app = express()
app.use(express.json())

/* ===== ヘルスチェック ===== */
app.get('/', (_req, res) => res.status(200).send('multi-app bot running'))
app.get('/healthz', (_req, res) => res.status(200).json({ ok: true }))

/* ===== Webhook ===== */
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

/* ===== イベント振り分け（postback最優先）===== */
async function handleEventSafely(event) {
  try {
    // 1) リッチメニュー（ポストバック）最優先でルーティング
    if (event.type === 'postback') {
      const data = event.postback?.data || ''
      if (data === 'APP=palm')  return handlePalm(event)      // 手相
      if (data === 'APP=ai')    return handleAI(event)        // AI相談
      if (data === 'APP=renai') return handleRenai(event)     // 恋愛診断
      return
    }

    // 2) フォロー時は軽い案内（必要ならリッチメニューの使い方を表示）
    if (event.type === 'follow') {
      return safeReply(event.replyToken, 'メニューから「手相／AI相談／恋愛診断」を選んでね🌸')
    }

    // 3) テキストメッセージなら、保険としてキーワードでも切替可能（任意）
    if (event.type === 'message' && event.message?.type === 'text') {
      const text = (event.message.text || '').trim()
      if (text === '手相')       return handlePalm(event)
      if (text === 'AI相談')     return handleAI(event)
      if (text === '恋愛診断')   return handleRenai(event)
      // 既定は恋愛診断へ回す（自然入力でも一旦ここへ）
      return handleRenai(event)
    }

    // 4) 画像などは各ルーター側が必要なら個別に対応（例：手相の画像受付）
    // 既定で恋愛診断に渡すと誤作動するので、ここは何もしない
    return
  } catch (err) {
    console.error('[ERROR] event handling failed:', err)
    if (event?.replyToken) {
      try {
        await safeReply(event.replyToken, 'エラーが発生しました。少し待ってからもう一度お試しください🙏')
      } catch {}
    }
  }
}

/* ===== 起動 ===== */
app.listen(PORT, () => {
  console.log(`listening on ${PORT}`)
})
