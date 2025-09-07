// /apps/ai-line/router.js
import { aiChat } from '../../services/callGPT.js'
import { supabase } from '../../services/supabaseClient.js'
import { getCharacterPrompt } from '../../services/userSettings.js'
import { safeReply } from '../../services/lineClient.js'

// ====== ここから下は元コードのロジックをそのまま移植 ======

const ADMIN_SECRET = 'azu1228'
const RESERVE_URL = process.env.RESERVE_URL || ''

// ---- note 一覧 ----（元の配列そのまま）
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

// ---- ユーティリティ ----
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
function isRecent(timestamp) {
  const now = Date.now()
  const diff = now - new Date(timestamp).getTime()
  return diff < 3 * 24 * 60 * 60 * 1000
}
// 📞 電話相談の問い合わせ検知
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

// ====== メイン：index.js から呼ばれる入口 ======
export async function handleEvent(event) {
  const today = getJapanDateString()
  const todayNote = getTodayNoteStable()

  if (!(event.type === 'message' && event.message?.type === 'text')) return

  const userId = event.source.userId
  const userMessage = event.message.text.trim()

  // キャラプロンプト
  const characterPersona = await getCharacterPrompt(userId)
  const needsShortAnswer = /どう思う|どうすれば|した方がいい|どうしたら|あり？|OK？|好き？|本気？/.test(userMessage)
  const systemPrompt = needsShortAnswer
    ? `${characterPersona}\n【ルール】以下を必ず守って答えて\n・結論を最初に出す（YES / NO / やめた方がいい など）\n・最大3行まで\n・回りくどい共感・曖昧表現は禁止\n・一度で終わる返答を意識`
    : characterPersona

  // 管理者パス
  if (userMessage === ADMIN_SECRET) {
    await safeReply(event.replyToken, `✨ 管理者モード
本日(${today})のnoteパスワードは「${todayNote.password}」
URL：${todayNote.url}`)
    return
  }

  // 📞 電話相談案内
  if (isPhoneInquiry(userMessage)) {
    const baseText =
      '電話でもお話しできるよ📞\n' +
      'リッチメニューの「予約」からかんたんに予約してね\n' +
      'お電話はAIじゃなくて人の相談員がやさしく寄りそうよ🌸'
    if (RESERVE_URL) {
      await safeReply(event.replyToken, {
        type: 'text',
        text: baseText,
        quickReply: { items: [{ type: 'action', action: { type: 'uri', label: '予約ページを開く', uri: RESERVE_URL } }] },
      })
    } else {
      await safeReply(event.replyToken, baseText)
    }
    return
  }

  // セッション読み込み
  let { data: session } = await supabase
    .from('user_sessions')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  let count = 0,
    messages = [],
    greeted = false
  let lastDate = today,
    authenticated = false,
    authDate = null

  if (session) {
    const isSameDay = session.last_date === today
    const isRecentUpdate = isRecent(session.updated_at)
    count = isSameDay ? session.count || 0 : 0
    messages = isRecentUpdate ? session.messages || [] : []
    greeted = session.greeted || false
    lastDate = session.last_date || today
    authenticated = isSameDay ? session.authenticated || false : false
    authDate = isSameDay ? session.auth_date || null : null
  }

  // 合言葉
  if (userMessage === todayNote.password) {
    await supabase.from('user_sessions').upsert({
      user_id: userId,
      count,
      messages,
      last_date: today,
      greeted,
      authenticated: true,
      auth_date: today,
      updated_at: new Date().toISOString(),
    })
    await safeReply(event.replyToken, '合言葉が確認できたよ☺️\n今日はずっとお話しできるからね💕')
    return
  }

  let replyText = ''
  const newCount = (count || 0) + 1

  // 初回 system 投入
  if (messages.length === 0 && !greeted) {
    messages.push({ role: 'system', content: systemPrompt })
    greeted = true
  }

  if (!authenticated) {
    if (count <= 3) {
      messages.push({ role: 'user', content: userMessage })
      const result = await aiChat(messages)
      replyText = result.text
      if (result.ok) messages.push({ role: 'assistant', content: result.text })
    } else if (count === 4) {
      messages.push({
        role: 'user',
        content: `※この返信は100トークン以内で完結させてください。話の途中で終わらず、1〜2文でわかりやすくまとめてください\n\n${userMessage}`,
      })
      const result = await aiChat(messages)
      if (result.ok) {
        messages.push({ role: 'assistant', content: result.text })
        replyText = `${result.text}\n\n明日になれば、またお話しできるよ🥰\n🌸 続けて話したい方はこちらから合言葉を入手してね☺️\n👉 ${todayNote.url} 🔑`
      } else {
        replyText = result.text
      }
    } else {
      replyText = `たくさんお話してくれてありがとうね☺️\n明日になれば、またお話しできるよ🥰\n🌸 続けて話したい方はこちらから合言葉を入手してね☺️\n👉 ${todayNote.url}`
    }
  } else {
    messages.push({ role: 'user', content: userMessage })
    const result = await aiChat(messages)
    replyText = result.text
    if (result.ok) messages.push({ role: 'assistant', content: result.text })
  }

  // セッション保存
  await supabase.from('user_sessions').upsert({
    user_id: userId,
    count: newCount,
    messages,
    last_date: today,
    greeted,
    authenticated,
    auth_date: authDate,
    updated_at: new Date().toISOString(),
  })

  await safeReply(event.replyToken, replyText)
}

