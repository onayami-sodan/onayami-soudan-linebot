// aiRouter.js  （直下フラット構成・ESM・フル完全版）
// - リッチメニュー即切替（同義語対応）
// - 恋愛診断：questions.js の4択を Quick Reply ボタンで出題
// - 手相診断：全ステップをボタン化（承諾/性別/年代/診断手/撮影ガイド）
// - PRICEステップに保存済みの案内文をフルで組み込み
// - AI相談：回数制限・note日替わりパス

import { aiChat } from './callGPT.js'
import { supabase } from './supabaseClient.js'
import { getCharacterPrompt } from './userSettings.js'
import { safeReply } from './lineClient.js'
import { QUESTIONS } from './questions.js' // export const QUESTIONS = [...]（4択×40問）前提

/* =========================
   定数
   ========================= */
const ADMIN_SECRET = 'azu1228' // .env 推奨
const RESERVE_URL = process.env.RESERVE_URL || ''
const SESSION_TABLE = 'user_sessions'
const MAX_HISTORY_PAIRS = 12 // user/assistant の往復上限

// リッチメニュー（厳密一致のベース）
const MENU_MAP = new Map([
  ['AI相談員ちゃん', 'ai'],
  ['手相占い診断',   'palm'],
  ['恋愛診断書',     'love40'],
])

// 手相：年代ボタン
const PALM_AGE_OPTIONS = [
  '10代未満', '10代', '20代', '30代', '40代', '50代', '60代', '70代以上',
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

/* =========================
   note 一覧（日替わりパスワード用）
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
   案内文（保存版）　※LINEの1メッセージに収めてQuick Reply添付
   ========================= */
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
  '気になる人の手相を見れば…',
  '・相手の性格や恋愛傾向がわかる',
  '・相性や距離感のヒントになる',
  '・家族や子どもの運勢を知るきっかけにも',
  '',
  '📄 診断作成料金（今だけ特別価格）',
  '1) フル診断（30項目カルテ） 10,000円 → 4,980円',
  '2) 学生支援（1項目診断）   2,500円 → 1,500円',
  '3) 相性診断（右手2枚セット） 6,000円 → 2,980円',
  '',
  '⏱ お届け：48時間以内',
  '',
  '✅ 進める場合は「承諾」を押してね（キャンセル可）',
].join('\n')

const LOVE_INTRO_TEXT = [
  '💘 恋愛診断書（40問）ご案内',
  '',
  'あなたの「恋のクセ」「相性の傾向」「距離感の取り方」を、40問の直感テストで読み解きます',
  '結果は読みやすいレポート形式でお届け',
  '',
  'おすすめ：片思い/復縁/結婚の迷いを整理・同じ失敗の要因を把握・魅力や“刺さる距離感”を知って関係を進めたい方に',
  '',
  'わかること：恋愛タイプ・依存/尽くしサイン・連絡/デート頻度の最適解・つまずきやすい場面と回避・相手タイプ別アプローチ',
  '',
  '🧭 進み方（選択式）',
  '1) 承諾 → 2) 開始 → 3) Q1〜Q40を4択でタップ → 4) レポートお届け',
  '所要時間：5〜8分（途中離脱OK）',
  '',
  '📄 お届け内容：総合タイプ判定、強み/つまずき、今すぐの一歩、相手タイプ別の距離の縮め方、セルフケア',
  '💳 料金：フル 2,980円 / ライト 1,500円（学割あり）',
  '⏱ 目安：48時間以内',
  '🔐 プライバシー：診断以外の目的では利用しません',
  '',
  '✅ 進める場合は「承諾」を押してね（キャンセル可）',
].join('\n')　/* 
　　=========================
   AI相談案内文（保存版｜Quick Replyつき｜おしゃれ戻るボタン）
   ========================= */
export const AI_SOUDA_N_ANNOUNCE = {
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
・1日5往復まで無料でご利用いただけます
・5回を超えると、自動的に購入ページが表示されます

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
  quickReply: {
    items: [
      {
        type: 'action',
        action: {
          type: 'message',
          label: '💌 はじめの画面へ',
          text: 'トークTOP'
        }
      }
    ]
  }
}


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

// Quick Reply でボタン選択させる共通関数
async function replyWithChoices(replyToken, text, choices = []) {
  return safeReply(replyToken, {
    type: 'text',
    text,
    quickReply: {
      items: choices.map((c) => ({
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
   リッチメニュー（テキスト切替）判定
   ========================= */
async function handleRichMenuText(event, userId) {
  if (event.type !== 'message' || event.message?.type !== 'text') return false

  // 厳密一致 + 同義語（スペース除去版も見る）
  const text = (event.message.text || '').trim().normalize('NFKC')
  const normalized = text.replace(/\s+/g, '')
  const aliasMap = new Map([
    ...MENU_MAP, // 完全一致
    ['AI相談', 'ai'],
    ['相談', 'ai'],
    ['占い', 'ai'],
    ['手相', 'palm'],
    ['恋愛診断', 'love40'],
  ])
  const app = aliasMap.get(text) || aliasMap.get(normalized)
  if (!app) return false

  // ★flowに関係なく即切替（ユーザー操作最優先）
  if (app === 'ai') {
  await setUserFlow(userId, 'ai')
  // ★ 案内文を返す（ここに AI_SOUDA_N_ANNOUNCE を呼ぶ）
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

/* =========================
   手相フロー（全部ボタン）
   ステップ：PRICE → GENDER → AGE_GROUP → HAND → GUIDE → WAIT_IMAGE
   ========================= */
async function sendPalmistryIntro(event) {
  await replyWithChoices(
    event.replyToken,
    PALM_INTRO_TEXT,
    [
      { label: '承諾', text: '承諾' },
      { label: 'キャンセル', text: 'キャンセル' },
      { label: '💌 はじめの画面へ', text: 'トークTOP' }, // 追加
    ]
  );
} // ← これが欠けてた！

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

  // テキスト（ボタン押下想定）
  if (!(event.type === 'message' && msgType === 'text')) return false
  const t = (event.message.text || '').trim().normalize('NFKC')

// PRICE
if (session.palm_step === 'PRICE') {
  if (t === '承諾') {
    await setUserFlow(session.user_id, 'palm', { palm_step: 'GENDER' });
    await replyWithChoices(event.replyToken, '性別を教えてね', [
      { label: '男性', text: '男性' },
      { label: '女性', text: '女性' },
      { label: 'その他', text: 'その他' },
    ]);
    return true;
  }
  if (t === 'キャンセル') {
    await setUserFlow(session.user_id, 'idle', { palm_step: null });
    await safeReply(event.replyToken, 'またいつでもどうぞ🌿');
    return true;
  }
  // ← 誤: LOVE_INTRO_TEXT を使っていた
  await replyWithChoices(
    event.replyToken,
    '進める場合は「承諾」を押してね🌸',
    [
      { label: '承諾', text: '承諾' },
      { label: 'キャンセル', text: 'キャンセル' },
      { label: '💌 はじめの画面へ', text: 'トークTOP' }, // 追加
    ]
  );
  return true;
}

  // GENDER
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
    await setUserFlow(session.user_id, 'palm', { palm_step: 'AGE', palm_gender: gender })
    await replyWithChoices(
      event.replyToken,
      '年代を選んでね',
      PALM_AGE_OPTIONS.map((label) => ({ label, text: label }))
    )
    return true
  }

  // AGE
  if (session.palm_step === 'AGE') {
    if (!PALM_AGE_TO_NUMBER.has(t)) {
      await replyWithChoices(
        event.replyToken,
        '年代を選んでね',
        PALM_AGE_OPTIONS.map((label) => ({ label, text: label }))
      )
      return true
    }
    const ageGroup = t
    const ageNumber = PALM_AGE_TO_NUMBER.get(t)
    await setUserFlow(session.user_id, 'palm', {
      palm_step: 'HAND',
      palm_age_group: ageGroup,
      palm_age: ageNumber,
    })
    await replyWithChoices(
      event.replyToken,
      '左手／右手どちらを診断する？\n- 左手：先天傾向（生まれ持った性質）\n- 右手：未来（今の状態・努力の結果）',
      [
        { label: '左手', text: '左手' },
        { label: '右手', text: '右手' },
      ]
    )
    return true
  }

  // HAND
  if (session.palm_step === 'HAND') {
    if (!/(左手|右手)/.test(t)) {
      await replyWithChoices(event.replyToken, '左手 か 右手 を選んでね', [
        { label: '左手', text: '左手' },
        { label: '右手', text: '右手' },
      ])
      return true
    }
    await setUserFlow(session.user_id, 'palm', { palm_step: 'GUIDE', palm_hand: t })
    await replyWithChoices(
      event.replyToken,
      '📸 撮影ガイド\n・手のひら全体が写るように\n・指先まで入れる\n・明るい場所でピントを合わせて\n準備OKなら「準備完了」を押してね',
      [{ label: '準備完了', text: '準備完了' }]
    )
    return true
  }

  // GUIDE
  if (session.palm_step === 'GUIDE') {
    if (t === '準備完了') {
      await setUserFlow(session.user_id, 'palm', { palm_step: 'WAIT_IMAGE' })
      await safeReply(event.replyToken, 'OK！画像を送ってください✋（1枚）')
      return true
    }
    await replyWithChoices(event.replyToken, '準備ができたら「準備完了」を押してね🌸', [
      { label: '準備完了', text: '準備完了' },
    ])
    return true
  }

  return false
}

/* =========================
   恋愛診断書（4択×40問・選択式）
   ========================= */
async function sendLove40Intro(event) {
  await replyWithChoices(
    event.replyToken,
    LOVE_INTRO_TEXT,
    [
      { label: '承諾', text: '承諾' },
      { label: 'キャンセル', text: 'キャンセル' },
      { label: '💌 はじめの画面へ', text: 'トークTOP' }, // 追加
    ]
  );
}


// 次の設問（4択ボタン）を出す
async function sendNextLoveQuestion(event, session) {
  const idx = session.love_idx ?? 0
  if (idx >= QUESTIONS.length) {
    const answers = (session.love_answers || []).join(',')
    await safeReply(
      event.replyToken,
      `回答ありがとう💕\n（本番）ここで診断レポートを返してね\n回答コード：${answers}`
    )
    await setUserFlow(session.user_id, 'idle', { love_step: null, love_idx: null })
    return true
  }

  const q = QUESTIONS[idx] // { id, text, choices: [4] }
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

  // 料金案内→承諾/キャンセル（ボタン）
  if (session.love_step === 'PRICE') {
    if (t === '承諾') {
      await setUserFlow(session.user_id, 'love40', { love_step: 'Q', love_answers: [], love_idx: 0 })
      await replyWithChoices(
        event.replyToken,
        'ありがとう🌸\nこのあと少しずつ質問するね。\n準備OKなら「開始」を押してね',
        [{ label: '開始', text: '開始' }]
      )
      return true
    }
    if (t === 'キャンセル') {
      await setUserFlow(session.user_id, 'idle', { love_step: null, love_idx: null })
      await safeReply(event.replyToken, 'またいつでもどうぞ🌿')
      return true
    }
    await replyWithChoices(event.replyToken, '進める場合は「承諾」を押してね🌸', [
      { label: '承諾', text: '承諾' },
      { label: 'キャンセル', text: 'キャンセル' },
    ])
    return true
  }

  // 出題・回答（選択式）
  if (session.love_step === 'Q') {
    const idx = session.love_idx ?? 0

    // 最初だけ「開始」ボタンを要求
    if (idx === 0 && t !== '開始') {
      await replyWithChoices(event.replyToken, '準備OKなら「開始」を押してね✨', [
        { label: '開始', text: '開始' },
      ])
      return true
    }
    if (idx === 0 && t === '開始') {
      return await sendNextLoveQuestion(event, session)
    }

    // 回答：1〜4（本文でもOK）
    let pick = t
    const numMap = { '①': '1', '②': '2', '③': '3', '④': '4' }
    if (numMap[pick]) pick = numMap[pick]

    if (!/^[1-4]$/.test(pick)) {
      // 本文マッチで拾う
      const prevQ = QUESTIONS[idx - 1] || QUESTIONS[idx]
      const pos = prevQ?.choices?.findIndex((c) => c === t)
      if (pos >= 0) pick = String(pos + 1)
    }

    if (!/^[1-4]$/.test(pick)) {
      // 入力が不正なら再提示
      return await sendNextLoveQuestion(event, session)
    }

    const answers = [...(session.love_answers || []), pick]
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
   AI相談（通常会話）本体
   ========================= */
async function handleAiChat(event, session) {
  if (!(event.type === 'message' && event.message?.type === 'text')) return false;

  const userId = session.user_id;
  const userText = (event.message.text || '').trim();
  const today = getJapanDateString();
  const todayNote = getTodayNoteStable();

  // 管理者モード（合言葉）
  if (userText === ADMIN_SECRET) {
    await safeReply(
      event.replyToken,
      `✨ 管理者モード\n本日(${today})のnoteパスワードは「${todayNote.password}」\nURL：${todayNote.url}`
    );
    return true;
  }

  // 電話相談の問い合わせ
  if (isPhoneInquiry(userText)) {
    const base =
      '電話でもお話しできるよ📞\n' +
      'リッチメニューの「予約」からかんたんに予約してね\n' +
      'お電話はAIじゃなくて人の相談員がやさしく寄りそうよ🌸';
    if (RESERVE_URL) {
      await safeReply(event.replyToken, {
        type: 'text',
        text: base,
        quickReply: {
          items: [{ type: 'action', action: { type: 'uri', label: '予約ページを開く', uri: RESERVE_URL } }],
        },
      });
    } else {
      await safeReply(event.replyToken, base);
    }
    return true;
  }

  // 合言葉（noteのパス）で当日解放
  if (userText === todayNote.password) {
    const newSession = {
      ...session,
      last_date: today,
      authenticated: true,
      auth_date: today,
    };
    await saveSession(newSession);
    await safeReply(event.replyToken, '合言葉が確認できたよ☺️\n今日はずっとお話しできるからね💕');
    return true;
  }

  // 会話履歴と回数をロード
  const sameDay = session.last_date === today;
  const recent = isRecent(session.updated_at);
  let count = sameDay ? (session.count || 0) : 0;
  let messages = recent ? (session.messages || []) : [];
  let greeted = !!session.greeted;
  let authenticated = sameDay ? !!session.authenticated : false;
  let authDate = sameDay ? (session.auth_date || null) : null;

  // キャラプロンプト + 短文回答モード
  const persona = await getCharacterPrompt(userId);
  const needsShort =
    /どう思う|どうすれば|した方がいい|どうしたら|あり？|OK？|好き？|本気？/i.test(userText);
  const systemPrompt = needsShort
    ? `${persona}\n【ルール】以下を必ず守って答えて\n・結論を最初に出す（YES / NO / やめた方がいい など）\n・最大3行まで\n・回りくどい共感・曖昧表現は禁止\n・一度で終わる返答を意識`
    : persona;

  // 初回 system を挿入
  if (messages.length === 0 && !greeted) {
    messages.push({ role: 'system', content: systemPrompt });
    greeted = true;
  }

  let replyText = '';
  const newCount = (count || 0) + 1;

  try {
    if (!authenticated) {
      if (newCount <= 3) {
        messages.push({ role: 'user', content: userText });
        messages = capHistory(messages);
        const result = await aiChat(messages);
        replyText = result.text;
        if (result.ok) messages.push({ role: 'assistant', content: result.text });
      } else if (newCount === 4) {
        messages.push({
          role: 'user',
          content:
            `※この返信は100トークン以内で完結させてください。話の途中で終わらず、1〜2文でわかりやすくまとめてください\n\n${userText}`,
        });
        messages = capHistory(messages);
        const result = await aiChat(messages);
        if (result.ok) {
          messages.push({ role: 'assistant', content: result.text });
          replyText =
            `${result.text}\n\n明日になれば、またお話しできるよ🥰\n` +
            `🌸 続けて話したい方はこちらから合言葉を入手してね☺️\n👉 ${todayNote.url} 🔑`;
        } else {
          replyText = result.text;
        }
      } else {
        replyText =
          `たくさんお話してくれてありがとうね☺️\n明日になれば、またお話しできるよ🥰\n` +
          `🌸 続けて話したい方はこちらから合言葉を入手してね☺️\n👉 ${todayNote.url}`;
      }
    } else {
      messages.push({ role: 'user', content: userText });
      messages = capHistory(messages);
      const result = await aiChat(messages);
      replyText = result.text;
      if (result.ok) messages.push({ role: 'assistant', content: result.text });
    }
  } catch (e) {
    console.error('[AI-CHAT ERROR]', e);
    replyText = 'いま少し混み合ってるみたい…もう一度だけ送ってみてね🙏';
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
  };
  try {
    await saveSession(toSave);
  } catch (e) {
    console.error('[SESSION SAVE ERROR]', e);
  }

  await safeReply(event.replyToken, replyText);
  return true;
} // ← ここで **必ず関数を閉じる**！

/* =========================
   エクスポート（イベント1件を処理）
   ========================= */
async function handleAI(event) {
  if (!event) return;

  const userId = event.source?.userId;
  if (!userId) return;

  // 1) リッチメニュー（同義語含む）を最優先で判定
  const handledMenu = await handleRichMenuText(event, userId);
  if (handledMenu) return;

  // 2) 進行中フローに応じて処理
  const session = (await loadSession(userId)) || { user_id: userId, flow: 'idle' };
  const flow = session.flow || 'idle';

  // 手相フロー
  if (flow === 'palm') {
    const done = await handlePalmistryFlow(event, session);
    if (done) return;
  }

  // 恋愛40問フロー
  if (flow === 'love40') {
    const done = await handleLove40Flow(event, session);
    if (done) return;
  }

  // AI相談（idle または ai の時は通常会話）
  if (event.type === 'message' && event.message?.type === 'text') {
    await setUserFlow(userId, 'ai'); // idle の場合は ai として扱う
    await handleAiChat(event, { ...(session || {}), user_id: userId });
    return;
  }

  // 未対応イベント（画像・スタンプ等）→軽いガイド
  if (event.type === 'message' && event.message?.type !== 'text') {
    await safeReply(
      event.replyToken,
      'ありがとう！文字で送ってくれたら、もっと具体的にお手伝いできるよ🌸'
    );
  }
}

export { handleAI };       // named export
export default handleAI;   // default export（どちらでimportしてもOK）
