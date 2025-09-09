// server.js
import express from 'express'
import { messagingApi } from '@line/bot-sdk'
import { safeReply } from './lineClient.js'
import { handleAI } from './aiRouter.js'            // ← ここが ./aiRouter.js であること
import { isOpen, setOpen } from './featureFlags.js'

const app = express()
app.use(express.json())

// LINE SDK クライアント（署名検証は必要に応じて追加）
const client = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
})

// 管理者（任意）
const ADMIN_IDS = (process.env.ADMIN_USER_IDS || '').split(',').filter(Boolean)

// ヘルスチェック
app.get('/ping', (_, res) => res.status(200).send('pong'))

// Webhook
app.post('/webhook', async (req, res) => {
  const events = req.body?.events || []
  res.status(200).send('OK')
  for (const e of events) await handleEventSafely(e)
})

async function handleEventSafely(event) {
  try {
    // 管理コマンド /open ai /close palm /status
    if (event.type === 'message' && event.message?.type === 'text') {
      const text = (event.message.text || '').trim()
      const uid = event.source?.userId
      const isAdmin = ADMIN_IDS.includes(uid)
      if (isAdmin && text.startsWith('/')) {
        const [cmd, app] = text.slice(1).split(/\s+/, 2)
        if (cmd === 'open')  { await setOpen(app, true);  return safeReply(event.replyToken, `✅ ${app} をOPEN`) }
        if (cmd === 'close') { await setOpen(app, false); return safeReply(event.replyToken, `⛔ ${app} を準備中`) }
        if (cmd === 'status') {
          const keys = ['ai','palm','love40','renai']
          const rows = await Promise.all(keys.map(async k => `- ${k}: ${(await isOpen(k))?'OPEN':'準備中'}`))
          return safeReply(event.replyToken, `状態\n${rows.join('\n')}`)
        }
      }
    }
    // 以降は aiRouter に委譲（AI/手相/恋愛の分岐も内包）
    return handleAI(event)
  } catch (err) {
    console.error('[ERROR] event handling failed:', err)
    if (event?.replyToken) try { await safeReply(event.replyToken, 'エラーが出ました。少し待ってもう一度🙏') } catch {}
  }
}

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`server.js listening on ${PORT}`))
