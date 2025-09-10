import { supabase } from './supabaseClient.js'
import { safeReply } from './lineClient.js'
import { handleAI, sendAiIntro } from './ai.mjs'
import { handlePalm, sendPalmistryIntro } from './palm.mjs'
import { handleLove, sendLove40Intro } from './love.mjs'

const SESSION_TABLE = 'user_sessions' // flow列: idle / ai / palm / love40

// 🌸 トップの案内（保存版｜1メッセージに収まる形）
const ENTRY_TEXT = [
  '🌸 ご利用ありがとうございます 🌸',
  '',
  'このLINEでは4つのサービスをご用意しています💕',
  '',
  '1️⃣ 恋愛診断書（40問心理テスト）',
  '2️⃣ 手相診断（あなたの手のひらから未来を読み解きます）',
  '3️⃣ AI相談室（毎日5往復無料／無制限プランあり）',
  '4️⃣ 電話相談（経験豊富な相談員と直接お話／予約制・有料）',
  '',
  '下のリッチメニューからお好きなサービスを選んでください💛',
].join('\n')

// リッチメニュー（厳密一致のベース）
const MENU_MAP = new Map([
  ['AI相談員ちゃん', 'ai'],
  ['手相占い診断',   'palm'],
  ['恋愛診断書',     'love40'],
])

// 同義語（スペース除去版も見る）
const ALIAS = new Map([
  ['AI相談', 'ai'],
  ['相談', 'ai'],
  ['占い', 'ai'],
  ['手相', 'palm'],
  ['恋愛診断', 'love40'],
  ['トークTOP', 'top'],
  ['はじめの画面', 'top'],
  ['トップ', 'top'],
  ['最初', 'top'],
  ['戻る', 'top'],
])

export async function dispatchEvent(event) {
  // 画像・スタンプなど非テキスト → 現在フローに委譲
  if (event.type === 'message' && event.message?.type !== 'text') {
    const flow = await getFlow(event.source?.userId)
    if (flow === 'palm') return handlePalm(event) // 手相は画像受付あり
    // それ以外は軽く案内
    await safeReply(event.replyToken, '文字で送ってくれたら、もっと具体的にお手伝いできるよ🌸')
    return
  }

  // テキスト以外はここで終了
  if (!(event.type === 'message' && event.message?.type === 'text')) return

  const userId = event.source?.userId
  const rawText = (event.message.text || '').trim().normalize('NFKC')
  const normalized = rawText.replace(/\s+/g, '')

  // リッチメニュー厳密一致 or 同義語
  const picked =
    MENU_MAP.get(rawText) ||
    MENU_MAP.get(normalized) ||
    ALIAS.get(rawText) ||
    ALIAS.get(normalized)

  // トップに戻す指示
  if (picked === 'top') {
    await setFlow(userId, 'idle')
    await safeReply(event.replyToken, ENTRY_TEXT)
    return
  }

  // メニューでの即切替（ユーザー操作最優先）
  if (picked === 'ai') {
    await setFlow(userId, 'ai')
    await sendAiIntro(event)              // AIの案内文を即表示
    return
  }
  if (picked === 'palm') {
    await setFlow(userId, 'palm', { palm_step: 'PRICE' })
    await sendPalmistryIntro(event)       // 手相の案内文を即表示
    return
  }
  if (picked === 'love40') {
    await setFlow(userId, 'love40', { love_step: 'PRICE' })
    await sendLove40Intro(event)          // 恋愛の案内文を即表示
    return
  }

  // 現在のフローで分岐
  const flow = await getFlow(userId)

  if (flow === 'idle') {
    await safeReply(event.replyToken, ENTRY_TEXT)
    return
  }
  if (flow === 'ai')   return handleAI(event)
  if (flow === 'palm') return handlePalm(event)
  if (flow === 'love40') return handleLove(event)

  // 未設定はトップへ
  await setFlow(userId, 'idle')
  await safeReply(event.replyToken, ENTRY_TEXT)
}

/* =========================
   セッション I/O（flow のみ）
   ========================= */
async function getFlow(userId) {
  if (!userId) return 'idle'
  const { data } = await supabase
    .from(SESSION_TABLE).select('flow').eq('user_id', userId).maybeSingle()
  return data?.flow || 'idle'
}
async function setFlow(userId, flow, extra = {}) {
  if (!userId) return
  const payload = { user_id: userId, flow, ...extra, updated_at: new Date().toISOString() }
  await supabase.from(SESSION_TABLE).upsert(payload, { onConflict: 'user_id' })
}

