/*
 =========================
   aiRouter.js｜フル完全版
   AI相談 最新改善版
   noteパスワード継続 / 人格固定 / 結論先出し / 履歴短縮
 =========================
*/

import { aiChat } from './callGPT.js'
import { supabase } from './supabaseClient.js'
import { getCharacterPrompt } from './userSettings.js'
import { safeReply } from './lineClient.js'
import { QUESTIONS } from './questions.js'

/*
 =========================
   定数
 =========================
*/

const ADMIN_SECRET = 'azu1228'
const RESERVE_URL = process.env.RESERVE_URL || ''
const SESSION_TABLE = 'user_sessions'

// 12は多すぎるので4に変更
const MAX_HISTORY_PAIRS = 4

const MENU_MAP = new Map([
  ['AI相談員ちゃん', 'ai'],
  ['手相占い診断', 'palm'],
  ['恋愛診断書', 'love40'],
])

const PALM_AGE_OPTIONS = [
  '10代未満',
  '10代',
  '20代',
  '30代',
  '40代',
  '50代',
  '60代',
  '70代以上',
]

const PALM_AGE_TO_NUMBER = new Map([
  ['10代未満', 9],
  ['10代', 15],
  ['20代', 25],
  ['30代', 35],
  ['40代', 45],
  ['50代', 55],
  ['60代', 65],
  ['70代以上', 75],
])

/*
 =========================
   note 一覧（日替わりパスワード用）
 =========================
*/

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

/*
 =========================
   案内文
 =========================
*/

const PALM_INTRO_TEXT = [
  '✋ 手相診断のご案内 🌸',
  '',
  '手のひらには、あなたの運勢や心の傾向が刻まれています',
  '🌙 左手 … 生まれ持った運勢や内面',
  '☀️ 右手 … 自分で切り拓いてきた未来や現在の状態',
  '',
  '診断を受けることで…',
  '・今の恋愛や人間関係の課題を整理',
  '・これからの仕事や人生の方向性を見直し',
  '・自分では気づきにくい性格や強みを発見',
  '',
  '📄 診断作成料金（今だけ特別価格）',
  '1) フル診断（30項目カルテ） 10,000円 → 4,980円',
  '2) 学生支援（1項目診断） 2,500円 → 1,500円',
  '3) 相性診断（右手2枚セット） 6,000円 → 2,980円',
  '',
  '⏱ お届け：48時間以内',
  '',
  '✅ 進める場合は「承諾」を押してね',
].join('\n')

const LOVE_INTRO_TEXT = [
  '💘 恋愛診断書（40問）ご案内',
  '',
  'あなたの恋のクセや相性の傾向を40問の直感テストで読み解きます',
  '',
  '🧭 進み方',
  '1) 承諾',
  '2) 開始',
  '3) Q1〜Q40を4択でタップ',
  '4) レポートお届け',
  '',
  '💳 料金：フル 2,980円 / ライト 1,500円',
  '⏱ 目安：48時間以内',
  '',
  '✅ 進める場合は「承諾」を押してね',
].join('\n')

export const AI_SOUDA_N_ANNOUNCE = {
  type: 'text',
  text: `🌸 AI相談室のご案内 🌸

「ちょっと話を聞いてほしい」
「誰にも言えない悩みを吐き出したい」
「ただ寂しくて、誰かと話したい」

そんなときに使えるAI相談室です

💬 できること
・恋愛や人間関係の相談
・学校や家庭でのモヤモヤ
・自分の気持ちの整理
・寂しいときの話し相手
・秘密の悩みの相談

⚖️ ご利用について
・1日5往復まで無料
・5回を超えると購入ページが表示されます

💡 無制限プラン
通常 980円 → 今だけ500円
購入ページで本日の合言葉を取得して
その合言葉をLINEに入力すると
その日限定でAI相談が無制限になります`,
  quickReply: {
    items: [
      {
        type: 'action',
        action: {
          type: 'message',
          label: '💌 はじめの画面へ',
          text: 'トークTOP',
        },
      },
    ],
  },
}

/*
 =========================
   ユーティリティ
 =========================
*/

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

async function replyWithChoices(replyToken, text, choices = []) {
  return safeReply(replyToken, {
    type: 'text',
    text,
    quickReply: {
      items: choices.map((c) => ({
        type: 'action',
        action: {
          type: 'message',
          label: c.label,
          text: c.text,
        },
      })),
    },
  })
}

/*
 =========================
   セッション I/O
 =========================
*/

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
  const payload = {
    ...s,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from(SESSION_TABLE)
    .upsert(payload)

  if (error) throw error
}

async function setUserFlow(userId, flow, extra = {}) {
  const row = (await loadSession(userId)) || { user_id: userId }

  await saveSession({
    ...row,
    flow,
    ...extra,
  })
}

/*
 =========================
   リッチメニュー判定
 =========================
*/

async function handleRichMenuText(event, userId) {
  if (event.type !== 'message' || event.message?.type !== 'text') return false

  const text = (event.message.text || '').trim().normalize('NFKC')
  const normalized = text.replace(/\s+/g, '')

  const aliasMap = new Map([
    ...MENU_MAP,
    ['AI相談', 'ai'],
    ['相談', 'ai'],
    ['手相', 'palm'],
    ['手相診断', 'palm'],
    ['恋愛診断', 'love40'],
    ['トークTOP', 'top'],
  ])

  const app = aliasMap.get(text) || aliasMap.get(normalized)
  if (!app) return false

  if (app === 'top') {
    await setUserFlow(userId, 'idle')
    await safeReply(event.replyToken, ENTRY_TEXT)
    return true
  }

  if (app === 'ai') {
    await setUserFlow(userId, 'ai')
    await safeReply(event.replyToken, AI_SOUDA_N_ANNOUNCE)
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

/*
 =========================
   手相フロー
 =========================
*/

async function sendPalmistryIntro(event) {
  await replyWithChoices(event.replyToken, PALM_INTRO_TEXT, [
    { label: '承諾', text: '承諾' },
    { label: 'キャンセル', text: 'キャンセル' },
    { label: '💌 はじめの画面へ', text: 'トークTOP' },
  ])
}

async function handlePalmistryFlow(event, session) {
  const msgType = event.message?.type

  if (event.type === 'message' && msgType === 'image') {
    if (session.palm_step === 'WAIT_IMAGE') {
      await setUserFlow(session.user_id, 'palm', { palm_step: 'PENDING_RESULT' })

      await safeReply(
        event.replyToken,
        'お写真を受け取りました📸\n順番に拝見して診断します\n48時間以内にお届けしますね🌸'
      )

      await setUserFlow(session.user_id, 'idle', { palm_step: null })
      return true
    }

    return false
  }

  if (!(event.type === 'message' && msgType === 'text')) return false

  const t = (event.message.text || '').trim().normalize('NFKC')

  if (session.palm_step === 'PRICE') {
    if (t === '承諾') {
      await setUserFlow(session.user_id, 'palm', { palm_step: 'GENDER' })

      await replyWithChoices(event.replyToken, '性別を教えてね', [
        { label: '男性', text: '男性' },
        { label: '女性', text: '女性' },
        { label: 'その他', text: 'その他' },
      ])

      return true
    }

    if (t === 'キャンセル') {
      await setUserFlow(session.user_id, 'idle', { palm_step: null })
      await safeReply(event.replyToken, 'またいつでもどうぞ🌿')
      return true
    }

    await replyWithChoices(event.replyToken, '進める場合は「承諾」を押してね🌸', [
      { label: '承諾', text: '承諾' },
      { label: 'キャンセル', text: 'キャンセル' },
      { label: '💌 はじめの画面へ', text: 'トークTOP' },
    ])

    return true
  }

  if (session.palm_step === 'GENDER') {
    const gender = ['男性', '女性', 'その他'].includes(t) ? t : null

    if (!gender) {
      await replyWithChoices(event.replyToken, '性別を選んでね', [
        { label: '男性', text: '男性' },
        { label: '女性', text: '女性' },
        { label: 'その他', text: 'その他' },
      ])

      return true
    }

    await setUserFlow(session.user_id, 'palm', {
      palm_step: 'AGE',
      palm_gender: gender,
    })

    await replyWithChoices(
      event.replyToken,
      '年代を選んでね',
      PALM_AGE_OPTIONS.map((label) => ({ label, text: label }))
    )

    return true
  }

  if (session.palm_step === 'AGE') {
    if (!PALM_AGE_TO_NUMBER.has(t)) {
      await replyWithChoices(
        event.replyToken,
        '年代を選んでね',
        PALM_AGE_OPTIONS.map((label) => ({ label, text: label }))
      )

      return true
    }

    await setUserFlow(session.user_id, 'palm', {
      palm_step: 'HAND',
      palm_age_group: t,
      palm_age: PALM_AGE_TO_NUMBER.get(t),
    })

    await replyWithChoices(
      event.replyToken,
      '左手／右手どちらを診断する？\n左手：生まれ持った性質\n右手：今の状態や努力の結果',
      [
        { label: '左手', text: '左手' },
        { label: '右手', text: '右手' },
      ]
    )

    return true
  }

  if (session.palm_step === 'HAND') {
    if (!/(左手|右手)/.test(t)) {
      await replyWithChoices(event.replyToken, '左手か右手を選んでね', [
        { label: '左手', text: '左手' },
        { label: '右手', text: '右手' },
      ])

      return true
    }

    await setUserFlow(session.user_id, 'palm', {
      palm_step: 'GUIDE',
      palm_hand: t,
    })

    await replyWithChoices(
      event.replyToken,
      '📸 撮影ガイド\n・手のひら全体を写す\n・指先まで入れる\n・明るい場所でピントを合わせる\n準備OKなら「準備完了」を押してね',
      [{ label: '準備完了', text: '準備完了' }]
    )

    return true
  }

  if (session.palm_step === 'GUIDE') {
    if (t === '準備完了') {
      await setUserFlow(session.user_id, 'palm', { palm_step: 'WAIT_IMAGE' })
      await safeReply(event.replyToken, 'OK！画像を送ってください✋')
      return true
    }

    await replyWithChoices(event.replyToken, '準備ができたら「準備完了」を押してね🌸', [
      { label: '準備完了', text: '準備完了' },
    ])

    return true
  }

  return false
}

/*
 =========================
   恋愛診断フロー
 =========================
*/

async function sendLove40Intro(event) {
  await replyWithChoices(event.replyToken, LOVE_INTRO_TEXT, [
    { label: '承諾', text: '承諾' },
    { label: 'キャンセル', text: 'キャンセル' },
    { label: '💌 はじめの画面へ', text: 'トークTOP' },
  ])
}

async function sendNextLoveQuestion(event, session) {
  const idx = session.love_idx ?? 0

  if (idx >= QUESTIONS.length) {
    const answers = (session.love_answers || []).join(',')

    await safeReply(
      event.replyToken,
      `回答ありがとう💕\n診断レポート作成用の回答を受け取りました\n回答コード：${answers}`
    )

    await setUserFlow(session.user_id, 'idle', {
      love_step: null,
      love_idx: null,
    })

    return true
  }

  const q = QUESTIONS[idx]

  await replyWithChoices(
    event.replyToken,
    `Q${q.id}. ${q.text}`,
    q.choices.map((c, i) => ({
      label: `${i + 1} ${c}`,
      text: String(i + 1),
    }))
  )

  return false
}

async function handleLove40Flow(event, session) {
  if (!(event.type === 'message' && event.message?.type === 'text')) return false

  const t = (event.message.text || '').trim().normalize('NFKC')

  if (session.love_step === 'PRICE') {
    if (t === '承諾') {
      await setUserFlow(session.user_id, 'love40', {
        love_step: 'Q',
        love_answers: [],
        love_idx: 0,
      })

      await replyWithChoices(
        event.replyToken,
        'ありがとう🌸\n準備OKなら「開始」を押してね',
        [{ label: '開始', text: '開始' }]
      )

      return true
    }

    if (t === 'キャンセル') {
      await setUserFlow(session.user_id, 'idle', {
        love_step: null,
        love_idx: null,
      })

      await safeReply(event.replyToken, 'またいつでもどうぞ🌿')
      return true
    }

    await replyWithChoices(event.replyToken, '進める場合は「承諾」を押してね🌸', [
      { label: '承諾', text: '承諾' },
      { label: 'キャンセル', text: 'キャンセル' },
    ])

    return true
  }

  if (session.love_step === 'Q') {
    const idx = session.love_idx ?? 0

    if (idx === 0 && t !== '開始') {
      await replyWithChoices(event.replyToken, '準備OKなら「開始」を押してね✨', [
        { label: '開始', text: '開始' },
      ])

      return true
    }

    if (idx === 0 && t === '開始') {
      return await sendNextLoveQuestion(event, session)
    }

    let pick = t
    const numMap = {
      '①': '1',
      '②': '2',
      '③': '3',
      '④': '4',
    }

    if (numMap[pick]) pick = numMap[pick]

    if (!/^[1-4]$/.test(pick)) {
      const prevQ = QUESTIONS[idx - 1] || QUESTIONS[idx]
      const pos = prevQ?.choices?.findIndex((c) => c === t)

      if (pos >= 0) pick = String(pos + 1)
    }

    if (!/^[1-4]$/.test(pick)) {
      return await sendNextLoveQuestion(event, session)
    }

    const answers = [...(session.love_answers || []), pick]
    const nextIdx = idx + 1

    await setUserFlow(session.user_id, 'love40', {
      love_step: 'Q',
      love_answers: answers,
      love_idx: nextIdx,
    })

    return await sendNextLoveQuestion(event, {
      ...session,
      love_answers: answers,
      love_idx: nextIdx,
    })
  }

  return false
}

/*
 =========================
   AI相談 本体
 =========================
*/

async function handleAiChat(event, session) {
  if (!(event.type === 'message' && event.message?.type === 'text')) return false

  const userId = session.user_id
  const userText = (event.message.text || '').trim()
  const today = getJapanDateString()
  const todayNote = getTodayNoteStable()

  if (userText === ADMIN_SECRET) {
    await safeReply(
      event.replyToken,
      `✨ 管理者モード\n本日(${today})のnoteパスワードは「${todayNote.password}」\nURL：${todayNote.url}`
    )

    return true
  }

  if (isPhoneInquiry(userText)) {
    const base =
      '電話でもお話しできるよ📞\n' +
      'リッチメニューの「予約」からかんたんに予約してね\n' +
      'お電話はAIじゃなくて人の相談員が対応するよ🌸'

    if (RESERVE_URL) {
      await safeReply(event.replyToken, {
        type: 'text',
        text: base,
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
    } else {
      await safeReply(event.replyToken, base)
    }

    return true
  }

  if (userText === todayNote.password) {
    await saveSession({
      ...session,
      flow: 'ai',
      last_date: today,
      authenticated: true,
      auth_date: today,
    })

    await safeReply(
      event.replyToken,
      '合言葉が確認できたよ\n今日は回数制限なしでお話しできるよ'
    )

    return true
  }

  const sameDay = session.last_date === today
  const recent = isRecent(session.updated_at)

  let count = sameDay ? session.count || 0 : 0
  let authenticated = sameDay ? !!session.authenticated : false
  let authDate = sameDay ? session.auth_date || null : null
  let messages = recent ? session.messages || [] : []

  const newCount = count + 1

  if (!authenticated && newCount > 5) {
    const replyText =
      `今日は無料分を使い切ったよ\n` +
      `明日になればまた5回まで話せるよ\n\n` +
      `続けて相談したい場合は、こちらから本日の合言葉を入手してね\n` +
      `${todayNote.url}`

    await saveSession({
      ...session,
      flow: 'ai',
      count: newCount,
      last_date: today,
      messages,
      authenticated,
      auth_date: authDate,
    })

    await safeReply(event.replyToken, replyText)
    return true
  }

  const persona = await getCharacterPrompt(userId)

  const needsShort =
    /どう思う|どうすれば|どうしたら|した方がいい|あり？|OK？|本気？|好き？|脈あり|脈なし|浮気|別れる|復縁|やめた方がいい|付き合う|告白|連絡/i.test(userText)

  const responseRule = needsShort
    ? `
【今回の返答ルール】
・最初の1文で結論を言う
・最大3〜5行
・共感だけで終わらせない
・曖昧に逃げない
・「ズバッと」という言葉は使わない
・最後に今やることを1つだけ伝える
`.trim()
    : `
【今回の返答ルール】
・最初に結論を伝える
・理由を短く説明する
・最後に今やることを1つだけ伝える
・共感だけで終わらせない
・曖昧な励ましで逃げない
・「ズバッと」という言葉は使わない
・長文にしすぎない
`.trim()

  const safetyRule = `
【安全ルール】
自傷 他害 虐待 性被害 重大な危険がある相談だけは
安全確保を最優先にして
信頼できる大人 公的窓口 緊急窓口への相談も案内する
それ以外では外部に丸投げしない
`.trim()

  const systemPrompt = `${persona}\n\n${responseRule}\n\n${safetyRule}`.trim()

  messages = messages.filter((m) => m.role !== 'system')
  messages.push({ role: 'user', content: userText })
  messages = capHistory(messages)

  const messagesForAI = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ]

  let replyText = ''

  try {
    const result = await aiChat(messagesForAI, {
      maxTokens: needsShort ? 300 : 500,
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
    console.error('[AI-CHAT ERROR]', e)
    replyText = 'うまく返せなかったから、もう一度だけ送ってね'
  }

  await saveSession({
    user_id: userId,
    flow: 'ai',
    count: newCount,
    messages,
    last_date: today,
    authenticated,
    auth_date: authDate,
  })

  await safeReply(event.replyToken, replyText)
  return true
}

/*
 =========================
   エントリー文
 =========================
*/

const ENTRY_TEXT = {
  type: 'text',
  text: `どれを使う？`,
  quickReply: {
    items: [
      {
        type: 'action',
        action: {
          type: 'message',
          label: 'AI相談',
          text: 'AI相談',
        },
      },
      {
        type: 'action',
        action: {
          type: 'message',
          label: '手相',
          text: '手相',
        },
      },
      {
        type: 'action',
        action: {
          type: 'message',
          label: '恋愛診断',
          text: '恋愛診断',
        },
      },
    ],
  },
}

/*
 =========================
   イベント処理
 =========================
*/

async function handleAI(event) {
  if (!event) return

  const userId = event.source?.userId
  if (!userId) return

  const handledMenu = await handleRichMenuText(event, userId)
  if (handledMenu) return

  const session = (await loadSession(userId)) || {
    user_id: userId,
    flow: 'idle',
  }

  const flow = session.flow || 'idle'

  if (flow === 'idle') {
    if (event.type === 'message' && event.message?.type === 'text') {
      await safeReply(event.replyToken, ENTRY_TEXT)
      return
    }
  }

  if (flow === 'palm') {
    const done = await handlePalmistryFlow(event, session)
    if (done) return
  }

  if (flow === 'love40') {
    const done = await handleLove40Flow(event, session)
    if (done) return
  }

  if (flow === 'ai' && event.type === 'message' && event.message?.type === 'text') {
    await handleAiChat(event, {
      ...session,
      user_id: userId,
    })

    return
  }

  if (event.type === 'message' && event.message?.type !== 'text') {
    await safeReply(
      event.replyToken,
      'ありがとう！文字で送ってくれたら、もっと具体的にお手伝いできるよ🌸'
    )
  }
}

export { handleAI }
export default handleAI
