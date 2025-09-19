import { aiChat } from './callGPT.js'
import { supabase } from './supabaseClient.js'
import { getCharacterPrompt } from './userSettings.js'
import { safeReply } from './lineClient.js'

const ADMIN_SECRET = 'azu1228' // .env 推奨
const RESERVE_URL = process.env.RESERVE_URL || ''
const SESSION_TABLE = 'user_sessions'
const MAX_HISTORY_PAIRS = 12

/* =========================
   案内文（クイックリプライ削除版）
   ========================= */
export async function sendAiIntro(event) {
  const message = {
    type: 'text',
    text: `🌸 AI相談室のご案内 🌸

「ちょっと話を聞いてほしい」「誰にも言えない悩みを吐き出したい」
「ただ寂しくて、誰かと話したい」
「眠れない夜に、ほんの少しだけ話したい」──
そんなときに寄り添うのが、このAI相談室です💛

💬 できること
・恋愛や人間関係の相談
・学校や家庭でのモヤモヤ
・自分の気持ちの整理や言葉にするお手伝い
・寂しいときの話し相手
・眠れない夜のちょっとしたおしゃべり
・秘密の悩みも安心して話せます

⚖️ ご利用について
・1日6往復まで無料でご利用いただけます
・6回を超えると、自動的に購入ページが表示されます

💡 無制限プランの仕組み
通常 ~980円~ ➡ ✨今だけ500円キャンペーン中！✨
購入ページで「本日の合言葉（パスワード）」を取得してください📖
そのパスワードをLINEトークに入力すると…
👉 その日限定でAI相談が無制限で使い放題になります！

🌿 寂しい夜も、眠れないときも、心の中のモヤモヤも安心してお話しください

📌 補足
まれに通信エラーやアクセス集中により、返事が返ってこないことがあります
その場合は少し時間をおいてから、もう一度入力してみてくださいね🌷

✨ もっと楽しむ使い方 ✨
AIには「名前」をつけたり、あなたの好きなキャラに設定したりできます🎀
やさしい雰囲気・元気なノリ・落ち着いた大人っぽさなど、
話し方をあなた好みに仕上げて楽しんでください💛`,
  }
  await safeReply(event.replyToken, message)
}

/* =========================
   note（日替わりパス）
   ========================= */
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
  if (!Array.isArray(messages)) return []
  const sys = messages[0]?.role === 'system' ? [messages[0]] : []
  const rest = messages.slice(sys.length)
  const pairs = []
  for (let i = 0; i < rest.length; i += 2) pairs.push(rest.slice(i, i + 2))
  const trimmed = pairs.slice(-MAX_HISTORY_PAIRS).flat()
  return [...sys, ...trimmed]
}

/* =========================
   セッション I/O
   ========================= */
async function loadSession(userId) {
  const { data } = await supabase.from(SESSION_TABLE).select('*').eq('user_id', userId).maybeSingle()
  return data || null
}
async function saveSession(s) {
  const payload = { ...s, updated_at: new Date().toISOString() }
  const { error } = await supabase.from(SESSION_TABLE).upsert(payload, { onConflict: 'user_id' })
  if (error) throw error
}

/* =========================
   AI相談（通常会話）本体
   ========================= */
export async function handleAI(event) {
  if (!(event.type === 'message' && event.message?.type === 'text')) return
  const userId = event.source?.userId
  if (!userId) return

  const userText = (event.message.text || '').trim()
  const today = getJapanDateString()
  const todayNote = getTodayNoteStable()

  // 管理者モード（合言葉）
  if (userText === ADMIN_SECRET) {
    await safeReply(
      event.replyToken,
      `✨ 管理者モード\n本日(${today})のnoteパスワードは「${todayNote.password}」\nURL：${todayNote.url}`
    )
    return
  }

  // 電話相談案内
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
    return
  }

  // セッション取得
  const session = (await loadSession(userId)) || { user_id: userId, flow: 'ai' }
  const sameDay = session.last_date === today
  const recent = isRecent(session.updated_at)
  let count = sameDay ? (session.count || 0) : 0
  let messages = recent ? (session.messages || []) : []
  let greeted = !!session.greeted
  let authenticated = sameDay ? !!session.authenticated : false
  let authDate = sameDay ? (session.auth_date || null) : null

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
    return
  }

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
      if (newCount <= 5) {
        messages.push({ role: 'user', content: userText })
        messages = capHistory(messages)
        const result = await aiChat(messages)
        replyText = result.text
        if (result.ok) messages.push({ role: 'assistant', content: result.text })
      } else if (newCount === 6) {
        messages.push({
          role: 'user',
          content:
            `※この返信は100トークン以内で完結させてください。話の途中で終わらず、1〜2文でわかりやすくまとめてください\n\n${userText}`,
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
}
