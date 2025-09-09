// server.js（直下集約版・完成）
import 'dotenv/config'
import express from 'express'
import { messagingApi } from '@line/bot-sdk'

import { safeReply } from './lineClient.js'
import { handleAI } from './aiRouter.js'        // aiRouter.js は named export: export function handleAI(...) { ... }
import { isOpen, setOpen } from './featureFlags.js'

const app = express()
app.use(express.json())

// LINE SDK クライアント（署名検証は省略運用）
new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
})

// 管理者（カンマ区切り）
const ADMIN_IDS = (process.env.ADMIN_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean)
// フラグ対象のサービス一覧（featureFlagsのキーと一致させる）
const SERVICES = ['ai', 'palm', 'renai']

// ヘルスチェック
app.get('/ping', (_, res) => res.status(200).send('pong'))

// Webhook
app.post('/webhook', async (req, res) => {
  const events = req.body?.events || []
  // 先に200返す（LINEのタイムアウト回避）
  res.status(200).send('OK')
  for (const e of events) {
    await handleEventSafely(e)
  }
})

async function handleEventSafely(event) {
  try {
    // ── 管理コマンド（/open ai /close palm /status）
    if (event.type === 'message' && event.message?.type === 'text') {
      const text = (event.message.text || '').trim()
      const uid = event.source?.userId
      const isAdmin = ADMIN_IDS.includes(uid)

      if (isAdmin && text.startsWith('/')) {
        const [cmdRaw, appRaw] = text.slice(1).split(/\s+/, 2)
        const cmd = (cmdRaw || '').toLowerCase()
        const app = (appRaw || '').toLowerCase()

        if (cmd === 'status') {
          const rows = await Promise.all(
            SERVICES.map(async k => `- ${k}: ${(await isOpen(k)) ? 'OPEN' : '準備中'}`)
          )
          return safeReply(event.replyToken, `状態\n${rows.join('\n')}`)
        }

        if ((cmd === 'open' || cmd === 'close') && SERVICES.includes(app)) {
          const toOpen = cmd === 'open'
          await setOpen(app, toOpen)
          return safeReply(event.replyToken, toOpen
            ? `✅ ${app} を OPEN にしました`
            : `⛔ ${app} を 準備中 にしました`)
        }

        // 不正コマンド
        return safeReply(event.replyToken, `使い方:\n/status\n/open ai|palm|renai\n/close ai|palm|renai`)
      }
    }

    // ── 通常処理：aiRouter 側で（AI/手相/恋愛の分岐も aiRouter 内に実装）
    return handleAI(event)
  } catch (err) {
    console.error('[ERROR] handleEventSafely:', err)
    if (event?.replyToken) {
      try { await safeReply(event.replyToken, 'エラーが発生しました。少し待ってもう一度お試しください🙏') } catch {}
    }
  }
}

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`server.js listening on ${PORT}`))
