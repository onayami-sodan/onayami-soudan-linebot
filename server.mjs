/* =========================
   server.mjs（💌 はじめの画面へ対応版｜TOPでflowをidleにリセット）
   ========================= */
import 'dotenv/config'
import express from 'express'
import { messagingApi } from '@line/bot-sdk'

import { safeReply } from './lineClient.js'
import { handleAI } from './aiRouter.mjs'
import { isOpen, setOpen } from './featureFlags.js'
import { supabase } from './supabaseClient.js'
import { ENTRY_TEXT } from './texts.mjs'

const app = express()
app.use(express.json())

// LINE SDK クライアント（署名検証は省略）
new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
})

// 管理者
const ADMIN_IDS = (process.env.ADMIN_USER_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

// 管理対象サービスキー
const SERVICES = ['ai', 'palm', 'renai']

/** -------- ユーティリティ -------- **/
function parseAdminCommand(text) {
  const t = (text || '').trim()
  // 日本語コマンド
  if (/^(恋愛|れんあい)準備中$/.test(t)) return { app: 'renai', open: false }
  if (/^(恋愛|れんあい)再開$/.test(t))   return { app: 'renai', open: true }
  if (/^手相準備中$/.test(t))            return { app: 'palm',  open: false }
  if (/^手相再開$/.test(t))              return { app: 'palm',  open: true }
  if (/^(AI|ＡＩ)準備中$/.test(t))        return { app: 'ai',    open: false }
  if (/^(AI|ＡＩ)再開$/.test(t))          return { app: 'ai',    open: true }
  if (/^(状態|ステータス)$/.test(t))      return { status: true }

  // スラッシュコマンド
  if (t.startsWith('/')) {
    const [cmdRaw, appRaw] = t.slice(1).split(/\s+/, 2)
    const cmd = (cmdRaw || '').toLowerCase()
    const app = (appRaw || '').toLowerCase()
    if (cmd === 'status') return { status: true }
    if ((cmd === 'open' || cmd === 'close') && SERVICES.includes(app)) {
      return { app, open: cmd === 'open' }
    }
  }
  return null
}

function whoami(event) {
  return `your userId: ${event?.source?.userId || 'unknown'}`
}

/** -------- ルーティング -------- **/
app.get('/ping', (_, res) => res.status(200).send('pong'))

app.post('/webhook', async (req, res) => {
  const events = req.body?.events || []
  res.status(200).send('OK')
  for (const e of events) {
    await handleEventSafely(e)
  }
})

/** -------- イベント処理 -------- **/
async function handleEventSafely(event) {
  try {
    if (event.type === 'message' && event.message?.type === 'text') {
      const text = (event.message.text || '').trim()
      const uid = event.source?.userId
      const isAdmin = ADMIN_IDS.includes(uid)

      // /whoami は誰でも使える
      if (text === '/whoami') {
        return safeReply(event.replyToken, whoami(event))
      }

      // 💌 はじめの画面へ（トークTOP）→ flow=idle にして ENTRY_TEXT を返す
      if (text === 'トークTOP') {
        try {
          const { data, error } = await supabase
            .from('user_sessions')
            .select('*')
            .eq('user_id', uid)
            .maybeSingle()
          if (error) throw error

          const row = data || { user_id: uid }
          const { error: upErr } = await supabase.from('user_sessions').upsert({
            ...row,
            user_id: uid,
            flow: 'idle',
            palm_step: null,
            love_step: null,
            
            // 必要に応じて完全初期化したい場合は以下をアンコメント
            // count: 0,
            // messages: [],
            // greeted: false,
            // authenticated: false,
            // auth_date: null,
            updated_at: new Date().toISOString(),
          })
          if (upErr) throw upErr
        } catch (e) {
          console.error('[RESET_TO_TOP ERROR]', e)
        }
        return safeReply(event.replyToken, ENTRY_TEXT)
      }

      // 管理者コマンド
      const cmd = parseAdminCommand(text)
      if (cmd) {
        if (!isAdmin) {
          return safeReply(event.replyToken, 'これは管理者コマンドです。権限がありません🙏')
        }
        if (cmd.status) {
          const rows = await Promise.all(
            SERVICES.map(async k => `- ${k}: ${(await isOpen(k)) ? 'OPEN' : '準備中'}`)
          )
          return safeReply(event.replyToken, `状態\n${rows.join('\n')}`)
        }
        if (cmd.app) {
          await setOpen(cmd.app, cmd.open)
          return safeReply(
            event.replyToken,
            cmd.open ? `✅ ${cmd.app} を OPEN にしました`
                     : `⛔ ${cmd.app} を 準備中 にしました`
          )
        }
      }
    }

    // 通常処理は aiRouter に委譲（★必ず await）
    await handleAI(event)
    return
  } catch (err) {
    console.error('[ERROR] handleEventSafely:', err)
    if (event?.replyToken) {
      try {
        await safeReply(event.replyToken, 'エラーが発生しました。少し待って再試行してください🙏')
      } catch {}
    }
  }
}

/** -------- 起動 -------- **/
const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`server.mjs listening on ${PORT}`))
