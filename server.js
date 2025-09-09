import express from 'express'
import { messagingApi } from '@line/bot-sdk'
import { safeReply } from './lineClient.js'
import handleAI from './aiRouter.js'
import { isOpen, setOpen } from './featureFlags.js'

const app = express()
app.use(express.json())

// LINE SDK（署名検証は必要ならミドルウェアを追加）
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
}
new messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken,
})

const ADMIN_IDS = (process.env.ADMIN_USER_IDS || '').split(',').filter(Boolean)

app.get('/ping', (_, res) => res.status(200).send('pong'))

app.post('/webhook', async (req, res) => {
  const events = req.body?.events || []
  res.status(200).send('OK')
  for (const e of events) await handleEventSafely(e)
})

async function handleEventSafely(event) {
  try {
    // 管理コマンド（/open ai など）
    if (event.type === 'message' && event.message?.type === 'text') {
      const text = (event.message.text || '').trim()
      const uid = event.source?.userId
      const isAdmin = ADMIN_IDS.includes(uid)
      if (isAdmin && text.startsWith('/')) {
        const [cmd, appRaw] = text.slice(1).split(/\s+/, 2)
        const app = (appRaw || '').toLowerCase()
        if (cmd === 'open')  { await setOpen(app, true);  return safeReply(event.replyToken, `✅ ${app} をOPEN`) }
        if (cmd === 'close') { await setOpen(app, false); return safeReply(event.replyToken, `⛔ ${app} を準備中`) }
        if (cmd === 'status') {
          const keys = ['ai','palm','renai']
          const rows = await Promise.all(keys.map(async k => `- ${k}: ${(await isOpen(k))?'OPEN':'準備中'}`))
          return safeReply(event.replyToken, `状態\n${rows.join('\n')}`)
        }
      }
    }
    // すべて aiRouter に委譲（内側で AI/手相/恋愛を振分け）
    return handleAI(event)
  } catch (err) {
    console.error('[ERROR] event handling failed:', err)
    if (event?.replyToken) try { await safeReply(event.replyToken, 'エラーが出ました。少し待ってもう一度🙏') } catch {}
  }
}

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`server.js listening on ${PORT}`))
