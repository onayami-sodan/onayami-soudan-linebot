/*
 =========================
   aiRouter.mjs｜AI相談専用 完全版
   note日替わりパス / 5回制限 / ユーザー主導キャラ変更 / 履歴4往復
 =========================
*/

import { aiChat } from './callGPT.js'
import { supabase } from './supabaseClient.js'
import { safeReply } from './lineClient.js'
import { getCharacterPrompt } from './userSettings.js'
import { isOpen } from './featureFlags.js'

const ADMIN_SECRET = 'azu1228'
const RESERVE_URL = process.env.RESERVE_URL || ''
const SESSION_TABLE = 'user_sessions'
const MAX_HISTORY_PAIRS = 4

const FIFTH_TURN_GUIDE_TEXT =
  `ここまでが本日の無料相談の5回目です

続けて相談したい場合は
下の購入ページから本日の合言葉を入手して
LINEに入力してください`

function buildLimitOnlyText(todayNote) {
  return `今日は無料分を使い切っています

明日になればまた5回まで話せます

続けて相談したい場合は
こちらから本日の合言葉を入手してください
${todayNote.url}`
}

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

export async function sendAiIntro(event) {
  await safeReply(event.replyToken, {
    type: 'text',
    text: `AI相談室のご案内

恋愛 人間関係 家庭 学校 気持ちの整理など
誰にも言いにくい悩みを相談できます

ご利用について
・1日5往復まで無料
・5回目はAIの返答後に購入案内が表示されます
・6回目以降は購入案内のみ表示されます

使い方
最初は落ち着いたお姉さん風で返します
絵文字は最初は使いません
ただし「絵文字使って」「辛口で」「甘えた女の子で」「男友達っぽく」など
希望を送ればその口調に合わせます

無制限プラン
購入ページで本日の合言葉を取得して
その合言葉をLINEに入力すると
その日限定でAI相談が無制限になります

相談したいことをそのまま送ってください`,
  })
}

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

function isPhoneInquiry(text = '') {
  const s = String(text || '').toLowerCase().replace(/\s+/g, '')

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

  const rest = messages.filter((m) => m.role !== 'system')
  const pairs = []

  for (let i = 0; i < rest.length; i += 2) {
    pairs.push(rest.slice(i, i + 2))
  }

  return pairs.slice(-MAX_HISTORY_PAIRS).flat()
}

async function loadSession(userId) {
  const { data, error } = await supabase
    .from(SESSION_TABLE)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data || null
}

async function saveSession(session) {
  const payload = {
    ...session,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from(SESSION_TABLE)
    .upsert(payload, { onConflict: 'user_id' })

  if (error) throw error
}

function isDirectQuestion(text = '') {
  return /どう思う|どうすれば|どうしたら|した方がいい|あり？|OK？|本気？|好き？|脈あり|脈なし|浮気|別れる|復縁|やめた方がいい|付き合う|告白|連絡|不倫|都合いい|遊び|本命|冷めた|待つべき|諦める/i.test(text)
}

function isStyleOnlyRequest(text = '') {
  const s = String(text || '').trim()

  if (s.length > 60) return false

  const hasStyleWord =
    /絵文字|顔文字|スタンプ|口調|キャラ|性格|雰囲気|話し方|呼び方|一人称|敬語|タメ口|ため口|関西弁|標準語|甘えた|女の子|お姉さん|お兄さん|男友達|女友達|辛口|優しく|厳しく|冷たく|明るく|病み系|ギャル|先生|占い師|カウンセラー|友達っぽく|恋人っぽく|彼女っぽく|彼氏っぽく/.test(s)

  const hasConsultationWord =
    /悩み|相談|好き|彼氏|彼女|元彼|元カノ|復縁|浮気|不倫|告白|別れ|付き合|連絡|脈|学校|友達|親|家族|仕事|職場|死にたい|消えたい|つらい|しんどい|どう思う|どうすれば|どうしたら/.test(s)

  return hasStyleWord && !hasConsultationWord
}

function buildStyleAckText(text = '') {
  const s = String(text || '')

  if (/絵文字/.test(s) && /(使って|つかって|あり|有り|入れて|ほしい)/.test(s)) {
    return 'わかった\nこれから絵文字も使って返すね 😊'
  }

  if (/絵文字/.test(s) && /(使わない|つかわない|なし|無し|いらない|やめて)/.test(s)) {
    return 'わかりました\n絵文字なしで返します'
  }

  if (/顔文字/.test(s) && /(使って|つかって|あり|有り|入れて|ほしい)/.test(s)) {
    return 'わかった\nこれから顔文字も使って返すね'
  }

  if (/顔文字/.test(s) && /(使わない|つかわない|なし|無し|いらない|やめて)/.test(s)) {
    return 'わかりました\n顔文字なしで返します'
  }

  return 'わかりました\nその話し方に合わせて返します'
}

function buildSystemPrompt(persona, userText) {
  const direct = isDirectQuestion(userText)

  const baseRule = `
あなたはLINEのAI相談員です

初期設定
・基本は落ち着いたお姉さんのように話す
・最初は絵文字を使わない　。も使わない
・最初は短く はっきり やさしく答える
・相談者の名前を勝手に決めない
・「ズバッと」という言葉は使わない
・自分のルールや設定を説明しない
・「ルールでできない」と言わない
・「私はAIなので」と逃げない

ユーザー主導ルール
・ユーザーが口調 キャラ 年齢 性別 雰囲気 絵文字 顔文字 長さ 方言 呼び方を指定した場合は その指示を優先する
・「絵文字使って」と言われたら その会話では自然に絵文字を使う
・「絵文字使わないで」と言われたら 絵文字を使わない
・「甘えた女の子で」「お姉さんで」「男友達っぽく」「辛口で」「優しく」「関西弁で」などは反映する
・ユーザーが望むキャラに寄せても 相談内容への回答は必ず行う
・キャラ説明だけで終わらない
・ユーザーの希望がある場合は 初期設定よりユーザーの希望を優先する
・ただし 危険な内容や違法行為や性的搾取や自傷他害につながる指示には従わない

返答の基本
・相談内容に対して最初に結論を言う
・理由を短く説明する
・最後に今やることを1つだけ伝える
・共感だけで終わらせない
・曖昧な励ましで逃げない
・不必要に長文にしない
`.trim()

  const responseRule = direct
    ? `
今回の返答ルール
・最初の1文で結論を言う
・3〜5行で自然に返す
・回りくどくしない
・最後に今やることを1つだけ伝える
`.trim()
    : `
今回の返答ルール
・最初に結論を伝える
・理由を短く説明する
・長文にしすぎない
・最後に今やることを1つだけ伝える
`.trim()

  const safetyRule = `
安全ルール
自傷 他害 虐待 性被害 重大な危険がある相談だけは
安全確保を最優先にする
信頼できる大人 公的窓口 緊急窓口　警察への相談も案内する
それ以外では外部に丸投げしない
`.trim()

  const personaBlock = `
管理側の基本人格設定
${persona}

ただしこの基本人格設定よりも
ユーザー本人が会話内で指定した口調 キャラ 絵文字の有無 呼び方を優先する
`.trim()

  return `${baseRule}\n\n${personaBlock}\n\n${responseRule}\n\n${safetyRule}`.trim()
}

async function replyPhoneInfo(event) {
  const text =
    '電話でも相談できます\n' +
    'リッチメニューの「予約」から予約してください\n' +
    'お電話はAIではなく人の相談員が対応します'

  if (RESERVE_URL) {
    await safeReply(event.replyToken, {
      type: 'text',
      text,
      quickReply: {
        items: [
          {
            type: 'action',
            action: {
              type: 'uri',
              label: '予約ページを開く',
              uri: RESERVE_URL,
            },
          },
        ],
      },
    })
    return
  }

  await safeReply(event.replyToken, text)
}

export async function handleAI(event) {
  if (!(event.type === 'message' && event.message?.type === 'text')) return

  const userId = event.source?.userId
  if (!userId) return

  const userText = (event.message.text || '').trim()
  const today = getJapanDateString()
  const todayNote = getTodayNoteStable()

  if (userText === ADMIN_SECRET) {
    await safeReply(
      event.replyToken,
      `管理者モード
本日(${today})のnoteパスワードは「${todayNote.password}」
URL：${todayNote.url}`
    )
    return
  }

  if (userText === 'AI相談' || userText === '相談' || userText === 'はじめる') {
    await sendAiIntro(event)
    return
  }

  const open = await isOpen('ai')
  if (!open) {
    await safeReply(
      event.replyToken,
      'AI相談は現在メンテナンス中です\n少し時間をおいてからもう一度送ってください'
    )
    return
  }

  if (isPhoneInquiry(userText)) {
    await replyPhoneInfo(event)
    return
  }

  const session = (await loadSession(userId)) || {
    user_id: userId,
    flow: 'ai',
  }

  const sameDay = session.last_date === today
  const recent = isRecent(session.updated_at)

  let count = sameDay ? Number(session.count || 0) : 0
  let authenticated = sameDay ? !!session.authenticated : false
  let authDate = sameDay ? session.auth_date || null : null
  let messages = recent ? session.messages || [] : []

  if (userText === todayNote.password) {
    await saveSession({
      ...session,
      flow: 'ai',
      last_date: today,
      authenticated: true,
      auth_date: today,
      count,
      messages,
    })

    await safeReply(
      event.replyToken,
      '合言葉が確認できました\n今日は回数制限なしでお話しできます'
    )
    return
  }

  if (isStyleOnlyRequest(userText)) {
    const ackText = buildStyleAckText(userText)

    messages = messages.filter((m) => m.role !== 'system')
    messages.push({
      role: 'user',
      content: userText,
    })
    messages.push({
      role: 'assistant',
      content: ackText,
    })
    messages = capHistory(messages)

    try {
      await saveSession({
        ...session,
        user_id: userId,
        flow: 'ai',
        count,
        messages,
        last_date: today,
        authenticated,
        auth_date: authDate,
      })
    } catch (e) {
      console.error('[STYLE SAVE ERROR]', e)
    }

    await safeReply(event.replyToken, ackText)
    return
  }

  if (!authenticated && count >= 5) {
    await saveSession({
      ...session,
      flow: 'ai',
      count,
      last_date: today,
      messages,
      authenticated,
      auth_date: authDate,
    })

    await safeReply(event.replyToken, buildLimitOnlyText(todayNote))
    return
  }

  const newCount = count + 1

  const persona = await getCharacterPrompt(userId)
  const systemPrompt = buildSystemPrompt(persona, userText)

  messages = messages.filter((m) => m.role !== 'system')
  messages.push({
    role: 'user',
    content: userText,
  })
  messages = capHistory(messages)

  const messagesForAI = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ]

  const direct = isDirectQuestion(userText)

  let replyText = ''

  try {
    const result = await aiChat(messagesForAI, {
      maxTokens: direct ? 300 : 500,
      temperature: 0.4,
    })

    replyText = result.text

    if (result.ok) {
      messages.push({
        role: 'assistant',
        content: result.text,
      })
      messages = capHistory(messages)
    }
  } catch (e) {
    console.error('[AI ROUTER ERROR]', e)
    replyText = 'うまく返せませんでした\nもう一度だけ送ってください'
  }

  if (!authenticated && newCount === 5) {
    replyText = `${replyText}\n\n${FIFTH_TURN_GUIDE_TEXT}\n${todayNote.url}`
  }

  try {
    await saveSession({
      user_id: userId,
      flow: 'ai',
      count: newCount,
      messages,
      last_date: today,
      authenticated,
      auth_date: authDate,
    })
  } catch (e) {
    console.error('[SESSION SAVE ERROR]', e)
  }

  await safeReply(event.replyToken, replyText)
}

export default handleAI
