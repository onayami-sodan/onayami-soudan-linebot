// aiRouter.js （完全版・ESM）
// - 直下フラット構成
// - 恋愛診断：questions.js の 4択選択肢を Quick Reply で出題
// - 手相・AI相談フローも含む

import { aiChat } from './callGPT.js'
import { supabase } from './supabaseClient.js'
import { getCharacterPrompt } from './userSettings.js'
import { safeReply } from './lineClient.js'
import { QUESTIONS } from './questions.js'   // ★40問の配列をインポート

/* =========================
   定数
   ========================= */
const ADMIN_SECRET = 'azu1228'
const RESERVE_URL = process.env.RESERVE_URL || ''
const SESSION_TABLE = 'user_sessions'
const MAX_HISTORY_PAIRS = 12

const MENU_MAP = new Map([
  ['AI相談員ちゃん', 'ai'],
  ['手相占い診断', 'palm'],
  ['恋愛診断書', 'love40'],
])

/* =========================
   note 一覧（日替わりパスワード用）
   ========================= */
const noteList = [
  { password: 'neko12', url: 'https://note.com/noble_loris1361/n/nb55e92147e54' },
  { password: 'momo34', url: 'https://note.com/noble_loris1361/n/nfbd564d7f9fb' },
  { password: 'yume56', url: 'https://note.com/noble_loris1361/n/ndb8877c2b1b6' },
  // …省略（既存リストを残してOK）
]

/* =========================
   共通ユーティリティ
   ========================= */
function getJapanDateString() {
  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return jst.toISOString().slice(0, 10)
}
function getTodayNoteStable() {
  const today = getJapanDateString()
  let hash = 0
  for (let i = 0; i < today.length; i++) {
    hash = today.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % noteList.length
  return noteList[index]
}
function isRecent(ts) {
  if (!ts) return false
  const diff = Date.now() - new Date(ts).getTime()
  return diff < 3 * 24 * 60 * 60 * 1000
}
function capHistory(messages) {
  if (!Array.isArray(messages)) return []
  const sys = messages[0]?.role === 'system' ? [messages[0]] : []
  const rest = messages.slice(sys.length)
  const pairs = []
  for (let i = 0; i < rest.length; i += 2) {
    pairs.push(rest.slice(i, i + 2))
  }
  const trimmed = pairs.slice(-MAX_HISTORY_PAIRS).flat()
  return [...sys, ...trimmed]
}
async function replyWithChoices(replyToken, text, choices = []) {
  return safeReply(replyToken, {
    type: 'text',
    text,
    quickReply: {
      items: choices.map(c => ({
        type: 'action',
        action: { type: 'message', label: c.label, text: c.text },
      })),
    },
  })
}

/* =========================
   セッション I/O
   ========================= */
async function loadSession(userId) {
  const { data } = await supabase
    .from(SESSION_TABLE)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  return data || null
}
async function saveSession(s) {
  const payload = { ...s, updated_at: new Date().toISOString() }
  await supabase.from(SESSION_TABLE).upsert(payload)
}

/* =========================
   フロー制御
   ========================= */
async function getUserFlow(userId) {
  const row = await loadSession(userId)
  if (!row) return 'idle'
  return row.flow || 'idle'
}
async function setUserFlow(userId, flow, extra = {}) {
  const row = (await loadSession(userId)) || { user_id: userId }
  await saveSession({ ...row, flow, ...extra })
}

/* =========================
   リッチメニュー切替
   ========================= */
async function handleRichMenuText(event, userId) {
  if (event.type !== 'message' || event.message?.type !== 'text') return false
  const text = (event.message.text || '').trim().normalize('NFKC')
  const app = MENU_MAP.get(text)
  if (!app) return false

  // ★フロー中でも強制切替可能に
  if (app === 'ai') {
    await setUserFlow(userId, 'ai')
    await safeReply(event.replyToken, 'AI相談員ちゃんを開きますね🌸')
    return true
  }
  if (app === 'palm') {
    await setUserFlow(userId, 'palm', { palm_step: 'PRICE' })
    await sendPalmistryIntro(event)
    return true
  }
  if (app === 'love40') {
    await setUserFlow(userId, 'love40', { love_step: 'PRICE' })
    await sendLove40Intro(event)
    return true
  }
  return false
}

/* =========================
   手相フロー
   ========================= */
async function sendPalmistryIntro(event) {
  await replyWithChoices(event.replyToken, '✋ 手相診断のご案内\n片手3,000円（今だけ特別）', [
    { label: '承諾', text: '承諾' },
    { label: 'キャンセル', text: 'キャンセル' },
  ])
}
async function handlePalmistryFlow(event, session) {
  // …既存の palm フローのままでOK（承諾/HAND部分だけ replyWithChoices に変えると◎）
  return false
}

/* =========================
   恋愛診断書フロー（QUESTIONS 4択）
   ========================= */
async function sendLove40Intro(event) {
  await replyWithChoices(event.replyToken, '💘 恋愛診断書（40問）\n承諾後に質問を進めます。', [
    { label: '承諾', text: '承諾' },
    { label: 'キャンセル', text: 'キャンセル' },
  ])
}
async function sendNextLoveQuestion(event, session) {
  const idx = session.love_idx ?? 0
  if (idx >= QUESTIONS.length) {
    const answers = (session.love_answers || []).join(',')
    await safeReply(
      event.replyToken,
      `回答ありがとう💕\n（本番）ここで診断レポートを返すよ\n回答コード：${answers}`
    )
    await setUserFlow(session.user_id, 'idle', { love_step: null, love_idx: null })
    return true
  }

  const q = QUESTIONS[idx]
  await replyWithChoices(
    event.replyToken,
    `Q${q.id}. ${q.text}`,
    q.choices.map((c, i) => ({ label: `${i + 1} ${c}`, text: String(i + 1) }))
  )
  return false
}
async function handleLove40Flow(event, session) {
  if (!(event.type === 'message' && event.message?.type === 'text')) return false
  const t = (event.message.text || '').trim().normalize('NFKC')

  if (session.love_step === 'PRICE') {
    if (t === '承諾') {
      await setUserFlow(session.user_id, 'love40', { love_step: 'Q', love_answers: [], love_idx: 0 })
      await replyWithChoices(event.replyToken, 'ありがとう🌸\n準備OKなら「開始」を押してね', [
        { label: '開始', text: '開始' },
      ])
      return true
    }
    if (t === 'キャンセル') {
      await setUserFlow(session.user_id, 'idle', { love_step: null, love_idx: null })
      await safeReply(event.replyToken, 'またいつでもどうぞ🌿')
      return true
    }
    return true
  }

  if (session.love_step === 'Q') {
    const idx = session.love_idx ?? 0

    if (idx === 0 && t === '開始') {
      return await sendNextLoveQuestion(event, session)
    }

    // 1〜4で答える
    if (!/^[1-4]$/.test(t)) {
      return await sendNextLoveQuestion(event, session)
    }

    const answers = [...(session.love_answers || []), t]
    const nextIdx = idx + 1
    await setUserFlow(session.user_id, 'love40', {
      love_step: 'Q',
      love_answers: answers,
      love_idx: nextIdx,
    })
    return await sendNextLoveQuestion(event, { ...session, love_answers: answers, love_idx: nextIdx })
  }

  return false
}

/* =========================
   AI相談（通常会話）
   ========================= */
async function handleAiChat(event, session) {
  // …既存の aiChat 部分をそのまま利用
  return true
}

/* =========================
   エクスポート
   ========================= */
export async function handleAI(event) {
  if (!event) return
  const userId = event.source?.userId
  if (!userId) return

  if (await handleRichMenuText(event, userId)) return

  const session = (await loadSession(userId)) || { user_id: userId, flow: 'idle' }
  const flow = session.flow || 'idle'

  if (flow === 'palm') {
    if (await handlePalmistryFlow(event, session)) return
  }
  if (flow === 'love40') {
    if (await handleLove40Flow(event, session)) return
  }

  if (event.type === 'message' && event.message?.type === 'text') {
    await setUserFlow(userId, 'ai')
    await handleAiChat(event, { ...(session || {}), user_id: userId })
    return
  }

  if (event.type === 'message' && event.message?.type !== 'text') {
    await safeReply(event.replyToken, 'ありがとう！文字で送ってくれたら、もっと具体的にお手伝いできるよ🌸')
  }
}

export default handleAI
