// love.mjs（回答テキスト化→送信→48時間案内まで実装）

import { safeReply } from './lineClient.js'
import { supabase } from './supabaseClient.js'
import { QUESTIONS } from './questions.js'
import { messagingApi } from '@line/bot-sdk' // ニックネーム取得用

const SESSION_TABLE = 'user_sessions'
const LINE_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN

// ====== 案内文 ======
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
  '1) 承諾 → 2) プロフィール入力 → 3) Q1〜Q40を4択で回答 → 4) レポートお届け',
  '所要時間：5〜8分（途中離脱OK）',
  '',
  '📄 お届け内容：総合タイプ判定、強み/つまずき、今すぐの一歩、相手タイプ別の距離の縮め方、セルフケア',
  '💳 料金：フル 2,980円 / ライト 1,500円（学割あり）',
  '⏱ 目安：48時間以内',
  '🔐 プライバシー：診断以外の目的では利用しません',
  '',
  '✅ 進める場合は「承諾」を押してね（キャンセル可）',
].join('\n')

// ====== Quick Reply 送信用ユーティリティ ======
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

// ====== 長文を分割して送る（LINEの文字数制限対策・概ね4,000字で分割） ======
async function replyChunked(replyToken, bigText, chunkSize = 4000) {
  if (!bigText || typeof bigText !== 'string') return
  for (let i = 0; i < bigText.length; i += chunkSize) {
    const part = bigText.slice(i, i + chunkSize)
    // 連投しすぎ防止のため await で順次送信
    await safeReply(replyToken, part)
  }
}

// ====== LINEニックネーム取得 ======
async function getLineDisplayName(userId) {
  try {
    if (!LINE_ACCESS_TOKEN || !userId) return ''
    const client = new messagingApi.MessagingApiClient({ channelAccessToken: LINE_ACCESS_TOKEN })
    const prof = await client.getProfile(userId)
    return prof?.displayName || ''
  } catch {
    return ''
  }
}

// ====== 公開: 案内文表示 ======
export async function sendLove40Intro(event) {
  await replyWithChoices(event.replyToken, LOVE_INTRO_TEXT, [
    { label: '承諾', text: '承諾' },
    { label: 'キャンセル', text: 'キャンセル' },
    { label: '💌 はじめの画面へ', text: 'トークTOP' },
  ])
}

// ====== 設問出題（4択） ======
async function sendNextLoveQuestion(event, session) {
  const idx = session.love_idx ?? 0
  if (idx >= QUESTIONS.length) {
    // ここで回答テキスト化→送信→案内
    await sendAnswersAsTextAndNotice(event, session)
    // 完了処理
    await setSession(event.source?.userId, { flow: 'idle', love_step: 'DONE' })
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

// ====== 40問の回答をテキスト化してLINEに送信 → 48時間案内 ======
async function sendAnswersAsTextAndNotice(event, session) {
  const userId = event.source?.userId
  const nickname = await getLineDisplayName(userId)
  const profile = session.love_profile || {} // { gender, age }
  const answers = session.love_answers || []

  // 回答テキスト生成
  const lines = []
  lines.push('=== 恋愛診断 回答控え ===')
  lines.push(`LINEニックネーム: ${nickname || '(取得できませんでした)'}`)
  lines.push(`性別: ${profile.gender || '(未設定)'}`)
  lines.push(`年齢: ${profile.age || '(未設定)'}`)
  lines.push(`回答数: ${answers.length}`)
  lines.push('')

  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i]
    const a = answers[i] // '1' | '2' | '3' | '4'
    const idx = a ? Number(a) - 1 : -1
    const choiceText = idx >= 0 ? q.choices[idx] : '(未回答)'
    lines.push(`Q${q.id}. ${q.text}`)
    lines.push(`→ 回答: ${a || '-'} : ${choiceText}`)
    lines.push('')
  }

  const txt = lines.join('\n')

  // 文字数制限対策で分割送信
  await replyChunked(event.replyToken, txt)

  // 48時間案内
  await safeReply(
    event.replyToken,
    '💌 ありがとう！回答を受け取ったよ。\n' +
      '48時間以内に「恋愛診断書」のURLをLINEでお届けするね。\n' +
      '順番に作成しているので、もうちょっと待っててね💛'
  )
}

// ====== 恋愛フロー本体（プロフィール導入つき） ======
export async function handleLove(event) {
  if (!(event.type === 'message' && event.message?.type === 'text')) return
  const userId = event.source?.userId
  if (!userId) return
  const t = (event.message.text || '').trim().normalize('NFKC')
  const s = await loadSession(userId)

  // 料金案内 → 承諾/キャンセル
  if (s?.love_step === 'PRICE') {
    if (t === '承諾') {
      await setSession(userId, { love_step: 'PROFILE_GENDER', love_profile: {}, love_answers: [], love_idx: 0 })
      await replyWithChoices(
        event.replyToken,
        'まずはプロフィールから進めるね。性別を教えてね',
        [
          { label: '女性', text: '女性' },
          { label: '男性', text: '男性' },
          { label: 'その他', text: 'その他' },
        ]
      )
      return
    }
    if (t === 'キャンセル') {
      await setSession(userId, { flow: 'idle', love_step: null, love_idx: null })
      await safeReply(event.replyToken, 'またいつでもどうぞ🌿')
      return
    }
    await replyWithChoices(event.replyToken, '進める場合は「承諾」を押してね🌸', [
      { label: '承諾', text: '承諾' },
      { label: 'キャンセル', text: 'キャンセル' },
    ])
    return
  }

  // プロフィール：性別
  if (s?.love_step === 'PROFILE_GENDER') {
    const ok = ['女性', '男性', 'その他'].includes(t)
    if (!ok) {
      await replyWithChoices(event.replyToken, '性別を選んでね', [
        { label: '女性', text: '女性' },
        { label: '男性', text: '男性' },
        { label: 'その他', text: 'その他' },
      ])
      return
    }
    const profile = { ...(s.love_profile || {}), gender: t }
    await setSession(userId, { love_step: 'PROFILE_AGE', love_profile: profile })
    await replyWithChoices(event.replyToken, '年代を教えてね', [
      { label: '10代未満', text: '10代未満' },
      { label: '10代', text: '10代' },
      { label: '20代', text: '20代' },
      { label: '30代', text: '30代' },
      { label: '40代', text: '40代' },
      { label: '50代', text: '50代' },
      { label: '60代', text: '60代' },
      { label: '70代以上', text: '70代以上' },
    ])
    return
  }

  // プロフィール：年代
  if (s?.love_step === 'PROFILE_AGE') {
    const okAges = ['10代未満','10代','20代','30代','40代','50代','60代','70代以上']
    if (!okAges.includes(t)) {
      await replyWithChoices(event.replyToken, '年代を選んでね', okAges.map(a => ({ label: a, text: a })))
      return
    }
    const profile = { ...(s.love_profile || {}), age: t }
    await setSession(userId, { love_step: 'Q', love_profile: profile, love_idx: 0, love_answers: [] })
    await replyWithChoices(
      event.replyToken,
      'ありがとう🌸\nこのあと少しずつ質問するね。\n準備OKなら「開始」を押してね',
      [{ label: '開始', text: '開始' }]
    )
    return
  }

  // 設問出題・回答
  if (s?.love_step === 'Q') {
    const idx = s.love_idx ?? 0

    // 最初だけ「開始」必須
    if (idx === 0 && t !== '開始') {
      await replyWithChoices(event.replyToken, '準備OKなら「開始」を押してね✨', [
        { label: '開始', text: '開始' },
      ])
      return
    }
    if (idx === 0 && t === '開始') {
      await sendNextLoveQuestion(event, s)
      return
    }

    // 回答：1〜4 または本文一致で拾う
    let pick = t
    const numMap = { '①': '1', '②': '2', '③': '3', '④': '4' }
    if (numMap[pick]) pick = numMap[pick]
    if (!/^[1-4]$/.test(pick)) {
      const prevQ = QUESTIONS[idx - 1] || QUESTIONS[idx]
      const pos = prevQ?.choices?.findIndex((c) => c === t)
      if (pos >= 0) pick = String(pos + 1)
    }
    if (!/^[1-4]$/.test(pick)) {
      await sendNextLoveQuestion(event, s)
      return
    }

    const answers = [...(s.love_answers || []), pick]
    const nextIdx = idx + 1
    await setSession(userId, { love_step: 'Q', love_answers: answers, love_idx: nextIdx })
    await sendNextLoveQuestion(event, { ...s, love_answers: answers, love_idx: nextIdx })
    return
  }

  // 未初期化ならご案内へ
  await setSession(userId, { flow: 'love40', love_step: 'PRICE' })
  await sendLove40Intro(event)
}

// ====== セッション I/O ======
async function loadSession(userId) {
  const { data } = await supabase.from(SESSION_TABLE).select('*').eq('user_id', userId).maybeSingle()
  return data || { user_id: userId, flow: 'love40', love_step: 'PRICE' }
}
async function setSession(userId, patch) {
  const row = await loadSession(userId)
  const payload = { ...row, ...patch, updated_at: new Date().toISOString() }
  await supabase.from(SESSION_TABLE).upsert(payload, { onConflict: 'user_id' })
}

