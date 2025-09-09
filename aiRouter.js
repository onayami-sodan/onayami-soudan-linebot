// aiRouter.js  （直下フラット構成用・完全版）
// ESM 前提

import { aiChat } from './callGPT.js'
import { supabase } from './supabaseClient.js'
import { getCharacterPrompt } from './userSettings.js'
import { safeReply } from './lineClient.js'

/* =========================
   定数
   ========================= */
const ADMIN_SECRET = 'azu1228' // 必要なら .env 化推奨
const RESERVE_URL = process.env.RESERVE_URL || ''
const SESSION_TABLE = 'user_sessions'
const MAX_HISTORY_PAIRS = 12 // 保存する user/assistant の最大往復数（肥大化防止）

// リッチメニュー（テキスト送信）完全一致マップ
const MENU_MAP = new Map([
  ['AI相談員ちゃん', 'ai'],
  ['手相占い診断',   'palm'],
  ['恋愛診断書',     'love40'],
])

// note の日替わり一覧（必要なら差し替え）
const noteList = [
  { password: 'neko12', url: 'https://note.com/noble_loris1361/n/nb55e92147e54' },
  { password: 'momo34', url: 'https://note.com/noble_loris1361/n/nfbd564d7f9fb' },
  { password: 'yume56', url: 'https://note.com/noble_loris1361/n/ndb8877c2b1b6' },
  { password: 'riri07', url: 'https://note.com/noble_loris1361/n/n306767c55334' },
  { password: 'nana22', url: 'https://note.com/noble_loris1361/n/nad07c5da665c' },
  { password: 'hono11', url: 'https://note.com/noble_loris1361/n/naa63e451ae21' },
  { password: 'koko88', url: 'https://note.com/noble_loris1361/n/nd60cdc5b729f' },
  { password: 'rara15', url: 'https://note.com/noble_loris1361/n/nd4348855021b' },
  { password: 'chuu33', url: 'https://note.com/noble_loris1361/n/na51ac5885f9e' },
  { password: 'mimi19', url: 'https://note.com/noble_loris1361/n/n6fbfe96dcb4b' },
  { password: 'luna28', url: 'https://note.com/noble_loris1361/n/n3c2e0e045a90' },
  { password: 'peko13', url: 'https://note.com/noble_loris1361/n/n6e0b6456ffcc' },
  { password: 'yuki09', url: 'https://note.com/noble_loris1361/n/nfcbd6eeb5dca' },
  { password: 'toto77', url: 'https://note.com/noble_loris1361/n/n9abc16c0e185' },
  { password: 'puni45', url: 'https://note.com/noble_loris1361/n/n20cfd0524de1' },
  { password: 'kiki01', url: 'https://note.com/noble_loris1361/n/nf766743a0c08' },
  { password: 'susu66', url: 'https://note.com/noble_loris1361/n/n1d1d57bf38f5' },
  { password: 'hime03', url: 'https://note.com/noble_loris1361/n/n2cac5b57d268' },
  { password: 'pipi17', url: 'https://note.com/noble_loris1361/n/nbf7974aabaca' },
  { password: 'coco29', url: 'https://note.com/noble_loris1361/n/nf8849ba3c59c' },
  { password: 'roro04', url: 'https://note.com/noble_loris1361/n/n477c92d85000' },
  { password: 'momo99', url: 'https://note.com/noble_loris1361/n/n332e40058be6' },
  { password: 'nana73', url: 'https://note.com/noble_loris1361/n/n5097160bee76' },
  { password: 'lulu21', url: 'https://note.com/noble_loris1361/n/nd10ed1ef8137' },
  { password: 'meme62', url: 'https://note.com/noble_loris1361/n/n4a344dce3a8c' },
  { password: 'popo55', url: 'https://note.com/noble_loris1361/n/nd7d8de167f37' },
  { password: 'koro26', url: 'https://note.com/noble_loris1361/n/n0fdf4edfa382' },
  { password: 'chibi8', url: 'https://note.com/noble_loris1361/n/n5eaea9b7c2ba' },
  { password: 'mimi44', url: 'https://note.com/noble_loris1361/n/n73b5584bf873' },
  { password: 'lala18', url: 'https://note.com/noble_loris1361/n/nc4db829308a4' },
  { password: 'fufu31', url: 'https://note.com/noble_loris1361/n/n2f5274805780' },
]

/* =========================
   ユーティリティ
   ========================= */
function getJapanDateString() {
  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return jst.toISOString().slice(0, 10) // YYYY-MM-DD
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
function isPhoneInquiry(text = '') {
  const s = (text || '').toLowerCase().replace(/\s+/g, '')
  if (/電話番号|tel[:：]?/.test(s)) return false
  return (
    /^(電話|でんわ|通話)$/.test(s) ||
    /(電話|でんわ|通話).*(相談|予約|できる|可能|ok|おk|話せ|話す|したい|たい|対応|やってる|お願い|\?|？)/.test(s) ||
    /(相談|予約|できる|可能|ok|おk|話せ|話す|したい|たい|対応|やってる|お願い).*(電話|でんわ|通話)/.test(s) ||
    /(電話相談|電話予約|通話相談)/.test(s)
  )
}
function capHistory(messages) {
  // 先頭は system, 以降の user/assistant を MAX_HISTORY_PAIRS に丸める
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

/* =========================
   セッション I/O
   ========================= */
async function loadSession(userId) {
  const { data, error } = await supabase
    .from(SESSION_TABLE)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data || null
}
async function saveSession(s) {
  const payload = { ...s, updated_at: new Date().toISOString() }
  const { error } = await supabase.from(SESSION_TABLE).upsert(payload)
  if (error) throw error
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
   リッチメニュー（テキスト送信）判定
   ========================= */
async function handleRichMenuText(event, userId) {
  if (event.type !== 'message' || event.message?.type !== 'text') return false
  const text = (event.message.text || '').trim().normalize('NFKC')
  const app = MENU_MAP.get(text)
  if (!app) return false

  const flow = await getUserFlow(userId)
  if (flow !== 'idle') return false // 進行中は切替えない

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
   手相フロー（最小実装：PRICE→GENDER→AGE→HAND→GUIDE→WAIT_IMAGE）
   ========================= */
async function sendPalmistryIntro(event) {
  const text =
    '✋ 手相診断のご案内\n' +
    '片手3,000円（今だけ特別）\n' +
    'よろしければ「承諾」と送ってね（キャンセル可）'
  await safeReply(event.replyToken, text)
}
async function handlePalmistryFlow(event, session) {
  const msgType = event.message?.type

  // 画像が届いた時（WAIT_IMAGE）
  if (event.type === 'message' && msgType === 'image') {
    if (session.palm_step === 'WAIT_IMAGE') {
      await setUserFlow(session.user_id, 'palm', { palm_step: 'PENDING_RESULT' })
      await safeReply(
        event.replyToken,
        'お写真を受け取りました📸\n順番に拝見して診断します。48時間以内にお届けしますね🌸'
      )
      await setUserFlow(session.user_id, 'idle', { palm_step: null }) // 受付で終了
      return true
    }
    return false
  }

  // テキストでのステップ遷移
  if (!(event.type === 'message' && msgType === 'text')) return false
  const t = (event.message.text || '').trim().normalize('NFKC')

  if (session.palm_step === 'PRICE') {
    if (t === '承諾') {
      await setUserFlow(session.user_id, 'palm', { palm_step: 'GENDER' })
      await safeReply(event.replyToken, '性別を教えてね（男性／女性／その他）')
      return true
    }
    if (t === 'キャンセル') {
      await setUserFlow(session.user_id, 'idle', { palm_step: null })
      await safeReply(event.replyToken, 'またいつでもどうぞ🌿')
      return true
    }
    await safeReply(event.replyToken, '進める場合は「承諾」と送ってね🌸')
    return true
  }

  if (session.palm_step === 'GENDER') {
    await setUserFlow(session.user_id, 'palm', { palm_step: 'AGE', palm_gender: t })
    await safeReply(event.replyToken, '年齢を教えてね（数字だけでOK）')
    return true
  }

  if (session.palm_step === 'AGE') {
    const age = parseInt(t, 10)
    if (!Number.isFinite(age) || age < 5 || age > 120) {
      await safeReply(event.replyToken, 'ごめんね、年齢は数字でお願い（例：28）')
      return true
    }
    await setUserFlow(session.user_id, 'palm', { palm_step: 'HAND', palm_age: age })
    await safeReply(
      event.replyToken,
      '左手／右手どちらを診断する？\n- 左手：先天傾向（生まれ持った性質）\n- 右手：未来（今の状態・努力の結果）'
    )
    return true
  }

  if (session.palm_step === 'HAND') {
    if (!/(左|右)/.test(t)) {
      await safeReply(event.replyToken, '左手 か 右手 を教えてね（例：左手）')
      return true
    }
    await setUserFlow(session.user_id, 'palm', { palm_step: 'GUIDE', palm_hand: t })
    await safeReply(
      event.replyToken,
      '📸 撮影ガイド\n・手のひら全体が写るように\n・指先まで入れる\n・明るい場所でピントを合わせて\n準備OKなら「準備完了」と送ってね'
    )
    return true
  }

  if (session.palm_step === 'GUIDE') {
    if (t === '準備完了') {
      await setUserFlow(session.user_id, 'palm', { palm_step: 'WAIT_IMAGE' })
      await safeReply(event.replyToken, 'OK！画像を送ってください✋（1枚）')
      return true
    }
    await safeReply(event.replyToken, '準備ができたら「準備完了」と送ってね🌸')
    return true
  }

  return false
}

/* =========================
   恋愛診断書（40問）フロー（最小実装：PRICE→START案内）
   ========================= */
async function sendLove40Intro(event) {
  const text =
    '💘 恋愛診断書（40問）\n' +
    '承諾後に質問を進めます。\n' +
    'よろしければ「承諾」と送ってね（キャンセル可）'
  await safeReply(event.replyToken, text)
}
async function handleLove40Flow(event, session) {
  if (!(event.type === 'message' && event.message?.type === 'text')) return false
  const t = (event.message.text || '').trim().normalize('NFKC')

  if (session.love_step === 'PRICE') {
    if (t === '承諾') {
      await setUserFlow(session.user_id, 'love40', { love_step: 'Q_START', love_answers: [] })
      await safeReply(
        event.replyToken,
        'ありがとう🌸\nこのあと40問を少しずつ聞くね。\nまずは「開始」と送ってスタート！'
      )
      return true
    }
    if (t === 'キャンセル') {
      await setUserFlow(session.user_id, 'idle', { love_step: null })
      await safeReply(event.replyToken, 'またいつでもどうぞ🌿')
      return true
    }
    await safeReply(event.replyToken, '進める場合は「承諾」と送ってね🌸')
    return true
  }

  if (session.love_step === 'Q_START') {
    if (t !== '開始') {
      await safeReply(event.replyToken, 'スタート準備OKなら「開始」と送ってね✨')
      return true
    }
    await safeReply(
      event.replyToken,
      'Q1. 山道で迷ったあなた。A:細い下り坂 / B:広い上り坂\n（A or B で回答）'
    )
    await setUserFlow(session.user_id, 'love40', { love_step: 'Q1' })
    return true
  }

  if (session.love_step === 'Q1') {
    if (!/^(A|B)$/i.test(t)) {
      await safeReply(event.replyToken, 'A か B で答えてね🌸')
      return true
    }
    await safeReply(
      event.replyToken,
      'OK、回答ありがとう！続きは本番の質問配列に接続して進めてね。\n今日はここで受付を完了します✨'
    )
    await setUserFlow(session.user_id, 'idle', { love_step: null })
    return true
  }

  return false
}

/* =========================
   AI相談（通常会話）本体
   ========================= */
async function handleAiChat(event, session) {
  if (!(event.type === 'message' && event.message?.type === 'text')) return false

  const userId = session.user_id
  const userText = (event.message.text || '').trim()
  const today = getJapanDateString()
  const todayNote = getTodayNoteStable()

  // 管理者モード（合言葉）
  if (userText === ADMIN_SECRET) {
    await safeReply(
      event.replyToken,
      `✨ 管理者モード\n本日(${today})のnoteパスワードは「${todayNote.password}」\nURL：${todayNote.url}`
    )
    return true
  }

  // 電話相談の問い合わせ
  if (isPhoneInquiry(userText)) {
    const base =
      '電話でもお話しできるよ📞\n' +
      'リッチメニューの「予約」からかんたんに予約してね\n' +
      'お電話はAIじゃなくて人の相談員がやさしく寄りそうよ🌸'
    if (RESERVE_URL) {
      await safeReply(event.replyToken, {
        type: 'text',
        text: base,
        quickReply: {
          items: [{ type: 'action', action: { type: 'uri', label: '予約ページを開く', uri: RESERVE_URL } }],
        },
      })
    } else {
      await safeReply(event.replyToken, base)
    }
    return true
  }

  // 合言葉（noteのパス）で当日解放
  if (userText === todayNote.password) {
    const newSession = {
      ...session,
      last_date: today,
      authenticated: true,
      auth_date: today,
    }
    await saveSession(newSession)
    await safeReply(event.replyToken, '合言葉が確認できたよ☺️\n今日はずっとお話しできるからね💕')
    return true
  }

  // 会話履歴と回数をロード
  const sameDay = session.last_date === today
  const recent = isRecent(session.updated_at)
  let count = sameDay ? (session.count || 0) : 0
  let messages = recent ? (session.messages || []) : []
  let greeted = !!session.greeted
  let authenticated = sameDay ? !!session.authenticated : false
  let authDate = sameDay ? (session.auth_date || null) : null

  // キャラプロンプト + 短文回答モード
  const persona = await getCharacterPrompt(userId)
  const needsShort =
    /どう思う|どうすれば|した方がいい|どうしたら|あり？|OK？|好き？|本気？/i.test(userText)
  const systemPrompt = needsShort
    ? `${persona}\n【ルール】以下を必ず守って答えて\n・結論を最初に出す（YES / NO / やめた方がいい など）\n・最大3行まで\n・回りくどい共感・曖昧表現は禁止\n・一度で終わる返答を意識`
    : persona

  // 初回 system を挿入
  if (messages.length === 0 && !greeted) {
    messages.push({ role: 'system', content: systemPrompt })
    greeted = true
  }

  let replyText = ''
  const newCount = (count || 0) + 1

  try {
    if (!authenticated) {
      if (newCount <= 3) {
        messages.push({ role: 'user', content: userText })
        messages = capHistory(messages)
        const result = await aiChat(messages)
        replyText = result.text
        if (result.ok) messages.push({ role: 'assistant', content: result.text })
      } else if (newCount === 4) {
        messages.push({
          role: 'user',
          content: `※この返信は100トークン以内で完結させてください。話の途中で終わらず、1〜2文でわかりやすくまとめてください\n\n${userText}`,
        })
        messages = capHistory(messages)
        const result = await aiChat(messages)
        if (result.ok) {
          messages.push({ role: 'assistant', content: result.text })
          replyText =
            `${result.text}\n\n明日になれば、またお話しできるよ🥰\n` +
            `🌸 続けて話したい方はこちらから合言葉を入手してね☺️\n👉 ${todayNote.url} 🔑`
        } else {
          replyText = result.text
        }
      } else {
        replyText =
          `たくさんお話してくれてありがとうね☺️\n明日になれば、またお話しできるよ🥰\n` +
          `🌸 続けて話したい方はこちらから合言葉を入手してね☺️\n👉 ${todayNote.url}`
      }
    } else {
      messages.push({ role: 'user', content: userText })
      messages = capHistory(messages)
      const result = await aiChat(messages)
      replyText = result.text
      if (result.ok) messages.push({ role: 'assistant', content: result.text })
    }
  } catch (e) {
    console.error('[AI-CHAT ERROR]', e)
    replyText = 'いま少し混み合ってるみたい…もう一度だけ送ってみてね🙏'
  }

  // セッション保存
  const toSave = {
    user_id: userId,
    flow: 'ai',
    count: newCount,
    messages,
    last_date: getJapanDateString(),
    greeted,
    authenticated,
    auth_date: authDate,
  }
  try {
    await saveSession(toSave)
  } catch (e) {
    console.error('[SESSION SAVE ERROR]', e)
  }

  await safeReply(event.replyToken, replyText)
  return true
}

/* =========================
   エクスポート（イベント1件を処理）
   ========================= */
export default async function handleAI(event) {
  const userId = event.source?.userId
  if (!userId) return

  // 1) リッチメニュー（完全一致）を最優先で判定
  const handledMenu = await handleRichMenuText(event, userId)
  if (handledMenu) return

  // 2) 進行中フローに応じて処理
  const session = (await loadSession(userId)) || { user_id: userId, flow: 'idle' }
  const flow = session.flow || 'idle'

  // 手相フロー（画像／テキスト両方に対応）
  if (flow === 'palm') {
    const done = await handlePalmistryFlow(event, session)
    if (done) return
  }

  // 恋愛40問フロー
  if (flow === 'love40') {
    const done = await handleLove40Flow(event, session)
    if (done) return
  }

  // AI相談（idle または ai の時は通常会話）
  if (event.type === 'message' && event.message?.type === 'text') {
    await setUserFlow(userId, 'ai') // idle の場合は ai として扱う
    await handleAiChat(event, { ...(session || {}), user_id: userId })
    return
  }

  // 未対応イベント（画像スタンプ等）→軽いガイド
  if (event.type === 'message' && event.message?.type !== 'text') {
    await safeReply(
      event.replyToken,
      'ありがとう！文字で送ってくれたら、もっと具体的にお手伝いできるよ🌸'
    )
  }
}
