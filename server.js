// server.js
import express from 'express'
import { messagingApi } from '@line/bot-sdk'
import { safeReply } from './services/lineClient.js'
import handleAI from './apps/ai-line/router.js'
import { isOpen, setOpen } from './featureFlags.js'

const app = express()
app.use(express.json())

// ── LINE SDK
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
}
const client = new messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken,
})

// 管理者ID（任意）
const ADMIN_IDS = (process.env.ADMIN_USER_IDS || '').split(',').filter(Boolean)

// 準備中メッセージ
const MAINTENANCE = {
  palm : '✋ 手相診断は現在「準備中」です。公開まで少しお待ちください🙏',
  ai   : '🤖 AI相談は現在「準備中」です。少し時間をおいてお試しください🙏',
  renai: '💘 恋愛診断は現在「準備中」です。公開まで少しお待ちください🙏',
}

// ── ヘルスチェック
app.get('/ping', (_, res) => res.status(200).send('pong'))

// ── Webhook
app.post('/webhook', async (req, res) => {
  const events = req.body?.events || []
  res.status(200).send('OK')
  for (const event of events) {
    await handleEventSafely(event)
  }
})

// ── イベントハンドラ
async function handleEventSafely(event) {
  try {
    // 管理コマンド（どの画面でも有効）
    if (event.type === 'message' && event.message?.type === 'text') {
      const text = (event.message.text || '').trim()
      const uid = event.source?.userId
      const isAdmin = ADMIN_IDS.includes(uid)
      if (isAdmin && text.startsWith('/')) {
        const [cmd, appRaw] = text.slice(1).split(/\s+/,2)
        const app = appRaw?.toLowerCase()
        if (cmd === 'open'  && ['palm','ai','renai'].includes(app)) { await setOpen(app, true);  return safeReply(event.replyToken, `✅ ${app} を OPEN にしました`) }
        if (cmd === 'close' && ['palm','ai','renai'].includes(app)) { await setOpen(app, false); return safeReply(event.replyToken, `⛔ ${app} を 準備中 にしました`) }
        if (cmd === 'status') {
          const [p,a,r] = await Promise.all([isOpen('palm'), isOpen('ai'), isOpen('renai')])
          return safeReply(event.replyToken, `状態\n- 手相: ${p?'OPEN':'準備中'}\n- AI相談: ${a?'OPEN':'準備中'}\n- 恋愛診断: ${r?'OPEN':'準備中'}`)
        }
        return
      }
    }

    // すべて router.js に任せる
    return handleAI(event)

  } catch (err) {
    console.error('[ERROR] event handling failed:', err)
    if (event?.replyToken) { 
      try { 
        await safeReply(event.replyToken, 'エラーが発生しました。少し待ってからもう一度お試しください🙏') 
      } catch {} 
    }
  }
}

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`server.js listening on ${PORT}`))
