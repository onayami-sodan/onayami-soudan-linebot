// palm.mjs（置き換え版）

import { supabase } from './supabaseClient.js'
import { safeReply } from './lineClient.js'

const SESSION_TABLE = 'user_sessions'

// 年代ボタン
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

// 案内文
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

/* =========================
   Quick Reply 送信
   ========================= */
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
   案内文を表示（ここで必ず初期化）
   ========================= */
export async function sendPalmistryIntro(event) {
  const userId = event.source?.userId
  if (userId) {
    await setSession(userId, { flow: 'palm', palm_step: 'PRICE' })
  }
  await replyWithChoices(event.replyToken, PALM_INTRO_TEXT, [
    { label: '承諾', text: '承諾' },
    { label: 'キャンセル', text: 'キャンセル' },
    { label: '💌 はじめの画面へ', text: 'トークTOP' },
  ])
}

/* =========================
   手相フロー本体（テキスト＆画像）
   ========================= */
export async function handlePalm(event) {
  const userId = event.source?.userId
  if (!userId) return

  // 画像受付
  if (event.type === 'message' && event.message?.type === 'image') {
    const s = await loadSession(userId)
    if (s?.palm_step === 'WAIT_IMAGE') {
      await setSession(userId, { palm_step: 'PENDING_RESULT' })
      await safeReply(event.replyToken, 'お写真を受け取りました📸\n順番に拝見して診断します。48時間以内にお届けしますね🌸')
      // フロー終了（TOPへ戻す）
      await setSession(userId, { flow: 'idle', palm_step: null })
      return
    }
    // それ以外のタイミングで画像が来たら軽く案内
    await safeReply(event.replyToken, 'まずはご案内から進めるね。リッチメニューで「手相占い診断」を押してね🌸')
    return
  }

  // テキスト以外は無視
  if (!(event.type === 'message' && event.message?.type === 'text')) return

  const raw = (event.message.text || '').trim().normalize('NFKC')
  const tn = raw.replace(/\s+/g, '') // スペース除去版（“準備 完了”“ 左手 ”などにも対応）
  const s = await loadSession(userId)
  const step = s?.palm_step || 'PRICE'

  // PRICE
  if (step === 'PRICE') {
    if (tn === '承諾' || /^(ok|はい)$/i.test(tn)) {
      await setSession(userId, { palm_step: 'GENDER' })
      await replyWithChoices(event.replyToken, '性別を教えてね', [
        { label: '男性', text: '男性' },
        { label: '女性', text: '女性' },
        { label: 'その他', text: 'その他' },
      ])
      return
    }
    if (tn === 'キャンセル') {
      await setSession(userId, { flow: 'idle', palm_step: null })
      await safeReply(event.replyToken, 'またいつでもどうぞ🌿')
      return
    }
    await replyWithChoices(event.replyToken, '進める場合は「承諾」を押してね🌸', [
      { label: '承諾', text: '承諾' },
      { label: 'キャンセル', text: 'キャンセル' },
      { label: '💌 はじめの画面へ', text: 'トークTOP' },
    ])
    return
  }

  // GENDER
  if (step === 'GENDER') {
    const ok = ['男性', '女性', 'その他'].includes(tn)
    if (!ok) {
      await replyWithChoices(event.replyToken, '性別を選んでね', [
        { label: '男性', text: '男性' },
        { label: '女性', text: '女性' },
        { label: 'その他', text: 'その他' },
      ])
      return
    }
    await setSession(userId, { palm_step: 'AGE', palm_gender: tn })
    await replyWithChoices(
      event.replyToken,
      '年代を選んでね',
      PALM_AGE_OPTIONS.map((label) => ({ label, text: label }))
    )
    return
  }

  // AGE
  if (step === 'AGE') {
    if (!PALM_AGE_TO_NUMBER.has(tn)) {
      await replyWithChoices(
        event.replyToken,
        '年代を選んでね',
        PALM_AGE_OPTIONS.map((label) => ({ label, text: label }))
      )
      return
    }
    await setSession(userId, {
      palm_step: 'HAND',
      palm_age_group: tn,
      palm_age: PALM_AGE_TO_NUMBER.get(tn),
    })
    await replyWithChoices(
      event.replyToken,
      '左手／右手どちらを診断する？\n- 左手：先天傾向（生まれ持った性質）\n- 右手：未来（今の状態・努力の結果）',
      [
        { label: '左手', text: '左手' },
        { label: '右手', text: '右手' },
      ]
    )
    return
  }

  // HAND
  if (step === 'HAND') {
    if (!(tn === '左手' || tn === '右手')) {
      await replyWithChoices(event.replyToken, '左手 か 右手 を選んでね', [
        { label: '左手', text: '左手' },
        { label: '右手', text: '右手' },
      ])
      return
    }
    await setSession(userId, { palm_step: 'GUIDE', palm_hand: tn })
    await replyWithChoices(
      event.replyToken,
      '📸 撮影ガイド\n・手のひら全体が写るように\n・指先まで入れる\n・明るい場所でピントを合わせて\n準備OKなら「準備完了」を押してね',
      [{ label: '準備完了', text: '準備完了' }]
    )
    return
  }

  // GUIDE
  if (step === 'GUIDE') {
    if (tn === '準備完了') {
      await setSession(userId, { palm_step: 'WAIT_IMAGE' })
      await safeReply(event.replyToken, 'OK！画像を送ってください✋（1枚）')
      return
    }
    await replyWithChoices(event.replyToken, '準備ができたら「準備完了」を押してね🌸', [
      { label: '準備完了', text: '準備完了' },
    ])
    return
  }

  // WAIT_IMAGE / PENDING_RESULT などでテキストが来た場合
  if (step === 'WAIT_IMAGE' || step === 'PENDING_RESULT') {
    await safeReply(event.replyToken, '今は画像をお待ちしています📸\n撮影ガイド：明るい場所で手のひら全体が入るように撮ってね！')
    return
  }

  // 未初期化や未知のステップはリセット
  await setSession(userId, { flow: 'palm', palm_step: 'PRICE' })
  await sendPalmistryIntro(event)
}

/* =========================
   セッション I/O（palm系プロパティのみ変更）
   ========================= */
async function loadSession(userId) {
  const { data } = await supabase
    .from(SESSION_TABLE)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  return data || { user_id: userId, flow: 'palm', palm_step: 'PRICE' }
}
async function setSession(userId, patch) {
  if (!userId) return
  const row = await loadSession(userId)
  const payload = { ...row, ...patch, updated_at: new Date().toISOString() }
  await supabase.from(SESSION_TABLE).upsert(payload, { onConflict: 'user_id' })
}
