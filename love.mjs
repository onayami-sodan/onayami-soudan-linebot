/*
 =========================
   love.mjs（完全版フル｜支払い方法＋最終承諾フロー＋表示から（）除去）
   - 案内：長文テキスト + 横並びボタン（Flex）
   - 設問：縦ボタン（Flex）※質問文/選択肢の（）はユーザー表示から除去
   - 設問完了後：3,980円（税込）の最終承諾 → 承諾で48h案内
   - 回答控え：選択肢（必要なら質問文も）から（）を除去
   - セッションは upsert（部分更新）
 =========================
*/

import { safeReply, push } from './lineClient.js'
import { supabase } from './supabaseClient.js'
import { QUESTIONS } from './questions.js'
import { messagingApi } from '@line/bot-sdk'

const SESSION_TABLE = 'user_sessions'
const LINE_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN

// ====== 起動時サニティチェック ======
;(function sanityCheckQuestions() {
  const n = QUESTIONS?.length || 0
  const last = QUESTIONS?.[n - 1]
  console.log('[QUESTIONS] count=', n, ' last.id=', last?.id, ' last.choices.len=', last?.choices?.length)
})()

// ====== 案内文（全文｜支払い方法入り） ======
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
  '💳 料金：通常9,800円(税込み）が✨今だけ 3,980円（税込み）✨',
  '⏱ 目安：48時間以内',
  '🔐 プライバシー：診断以外の目的では利用しません',
  '',
  '💳 お支払い方法',
  '・PayPay',
  '・クレジットカード（Visa / Master / JCB / AMEX など）',
  '・携帯キャリア決済（SoftBank / au / docomo）',
  '・PayPal',
  '',
  '✅ 進める場合は「承諾」を押してね（キャンセル可）',
]

// ====== 長文分割送信（1通目 reply、2通目以降 push） ======
function splitChunks(text, size = 4500) {
  const out = []
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size))
  return out
}
async function replyThenPush(userId, replyToken, bigText) {
  if (!bigText) return
  const chunks = splitChunks(bigText, 4500)
  if (chunks.length === 0) return
  await safeReply(replyToken, chunks[0]) // 1通目 reply
  for (let i = 1; i < chunks.length; i++) {
    await push(userId, chunks[i])        // 2通目以降 push
  }
}

// ====== LINEニックネーム ======
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

// ====== ユーザー表示のクリーンアップ（括弧内メモ除去：全角/半角） ======
function cleanForUser(str = '') {
  return String(str)
    .replace(/（[^）]*）/g, '')   // 全角（…）
    .replace(/\([^)]*\)/g, '')    // 半角(...)
    .replace(/\s+/g, ' ')         // 余分な空白を1つに
    .trim()
}

/* =========================
   Flex builders
   ========================= */

// 案内ボタン：横並び・色分け（長文は別送）
function buildIntroButtonsFlex() {
  return {
    type: 'flex',
    altText: '恋愛診断を開始しますか？',
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'lg',
        paddingAll: '20px',
        contents: [
          { type: 'text', text: '進める場合は「承諾」を押してね', size: 'md', wrap: true, weight: 'bold' },
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'md',
            margin: 'lg',
            contents: [
              {
                type: 'button',
                style: 'primary',
                color: '#4CAF50', // 承諾＝グリーン
                height: 'md',
                action: { type: 'message', label: '承諾', text: '承諾' },
              },
              {
                type: 'button',
                style: 'secondary',
                height: 'md',
                action: { type: 'message', label: '💌 はじめの画面へ', text: 'トークTOP' },
              }, // ※ secondary に color は付けない（スキーマ準拠）
            ],
          },
        ],
      },
      styles: { body: { backgroundColor: '#FFF9FB' } },
    },
  }
}

// 設問：縦ボタン（押し間違い防止で余白）※表示はクリーン化
function buildQuestionFlex(q) {
  const circledNums = ['①', '②', '③', '④']
  const qText = cleanForUser(q.text)
  const choiceLabels = q.choices.map((c) => cleanForUser(c))
  return {
    type: 'flex',
    altText: `Q${q.id}. ${qText}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'lg',
        paddingAll: '20px',
        contents: [
          { type: 'text', text: `Q${q.id}. ${qText}`, wrap: true, weight: 'bold', size: 'md' },
          ...choiceLabels.map((label, i) => ([
            {
              type: 'button',
              style: 'primary',
              height: 'sm',
              color: '#F59FB0',
              action: { type: 'message', label: `${circledNums[i]} ${label}`, text: String(i + 1) },
            },
            { type: 'separator', margin: 'md', color: '#FFFFFF00' },
          ])).flat(),
        ],
      },
      styles: { body: { backgroundColor: '#FFF9FB' } },
    },
  }
}

// 最終承諾：横並びボタン（承諾 / トークTOP）
function buildFinalConfirmFlex() {
  return {
    type: 'flex',
    altText: '診断書作成の最終確認',
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'lg',
        paddingAll: '20px',
        contents: [
          { type: 'text', text: '診断書の作成には 3,980円（税込）が必要です。', wrap: true, weight: 'bold' },
          { type: 'text', text: '承諾する場合は［承諾］、やめる場合は［💌 はじめの画面へ］を押してね', wrap: true, size: 'sm' },
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'md',
            margin: 'lg',
            contents: [
              {
                type: 'button',
                style: 'primary',
                color: '#4CAF50',
                height: 'md',
                action: { type: 'message', label: '承諾', text: '承諾' },
              },
              {
                type: 'button',
                style: 'secondary',
                height: 'md',
                action: { type: 'message', label: '💌 はじめの画面へ', text: 'トークTOP' },
              }, // ※ secondary に color は付けない
            ],
          },
        ],
      },
      styles: { body: { backgroundColor: '#FFF9FB' } },
    },
  }
}

/* =========================
   公開: 案内文表示（ここで初期化）
   ========================= */
export async function sendLove40Intro(event) {
  const userId = event.source?.userId
  if (userId) await setSession(userId, { flow: 'love40', love_step: 'PRICE', love_idx: 0 })
  await safeReply(event.replyToken, LOVE_INTRO_TEXT.join('\n'))
  await push(userId, buildIntroButtonsFlex())
}

/* =========================
   設問出題（Flex縦ボタン）＋最終承諾への遷移
   ========================= */
async function sendNextLoveQuestion(event, session) {
  const idx = session.love_idx ?? 0
  if (idx >= (QUESTIONS?.length || 0)) {
    const userId = event.source?.userId
    await setSession(userId, { love_step: 'CONFIRM_PAY' })
    await safeReply(
      event.replyToken,
      '🧾 最終確認\n' +
      'このあとの「診断書の作成・納品」には **3,980円（税込）** が必要です。\n' +
      '承諾する場合は［承諾］、やめる場合は［💌 はじめの画面へ］を押してね。'
    )
    await push(userId, buildFinalConfirmFlex())
    return true
  }
  const q = QUESTIONS[idx]
  await safeReply(event.replyToken, buildQuestionFlex(q))
  return false
}

/* =========================
   回答控え送信＋48h案内（テキストで返す）
   ========================= */
async function sendAnswersAsTextAndNotice(event, session) {
  const userId = event.source?.userId
  const nickname = await getLineDisplayName(userId)
  const profile = session.love_profile || {}
  const answers = session.love_answers || []

  const lines = []
  lines.push('=== 恋愛診断 回答控え ===')
  lines.push(`LINEニックネーム: ${nickname || '(取得できませんでした)'}`)
  lines.push(`性別: ${profile.gender || '(未設定)'}`)
  lines.push(`年代: ${profile.age || '(未設定)'}`)
  lines.push(`回答数: ${answers.length}`)
  lines.push('')

  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i]
    const a = answers[i]
    const idx = a ? Number(a) - 1 : -1
    const qText = cleanForUser(q.text)
    const choiceRaw = idx >= 0 ? q.choices[idx] : ''
    const choiceText = idx >= 0 ? cleanForUser(choiceRaw) : '(未回答)'
    lines.push(`Q${q.id}. ${qText}`)
    lines.push(`→ 回答: ${a || '-'} : ${choiceText}`)
    lines.push('')
  }

  await replyThenPush(userId, event.replyToken, lines.join('\n'))

  await push(
    userId,
    '💌 ありがとう！回答を受け取ったよ\n' +
    '48時間以内に「恋愛診断書」のURLをLINEでお届けするね\n' +
    '順番に作成しているので、もうちょっと待っててね💛'
  )
}

/* =========================
   恋愛フロー本体
   ========================= */
export async function handleLove(event) {
  if (!(event.type === 'message' && event.message?.type === 'text')) return
  const userId = event.source?.userId
  if (!userId) return

  const raw = (event.message.text || '').trim().normalize('NFKC')
  const t = raw
  const tn = raw.replace(/\s+/g, '')

  const s = await loadSession(userId)

  // PRICE
  if (s?.love_step === 'PRICE') {
    if (tn === '承諾' || /^(ok|はい)$/i.test(tn)) {
      await setSession(userId, { love_step: 'PROFILE_GENDER', love_profile: {}, love_answers: [], love_idx: 0 })
      await safeReply(event.replyToken, {
        type: 'flex',
        altText: '性別を選んでね',
        contents: {
          type: 'bubble',
          size: 'mega',
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'lg',
            paddingAll: '20px',
            contents: [
              { type: 'text', text: '性別を選んでね', weight: 'bold', size: 'md' },
              ...['男性', '女性', 'その他'].map((label) => ([
                {
                  type: 'button', style: 'primary', height: 'sm', color: '#B39DDB',
                  action: { type: 'message', label, text: label },
                },
                { type: 'separator', margin: 'md', color: '#FFFFFF00' },
              ])).flat(),
              {
                type: 'button', style: 'secondary', height: 'md',
                action: { type: 'message', label: '💌 はじめの画面へ', text: 'トークTOP' },
              },
            ],
          },
        },
      })
      return
    }
    if (tn === 'キャンセル') {
      await setSession(userId, { flow: 'idle', love_step: null, love_idx: null })
      await safeReply(event.replyToken, 'またいつでもどうぞ🌿')
      return
    }
    await safeReply(event.replyToken, LOVE_INTRO_TEXT.join('\n'))
    await push(userId, buildIntroButtonsFlex())
    return
  }

  // PROFILE_GENDER
  if (s?.love_step === 'PROFILE_GENDER') {
    const ok = ['男性', '女性', 'その他'].includes(tn)
    if (!ok) {
      await safeReply(event.replyToken, {
        type: 'flex',
        altText: '性別を選んでね',
        contents: {
          type: 'bubble',
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            contents: ['男性', '女性', 'その他'].map((label) => ({
              type: 'button', style: 'primary', height: 'sm', color: '#B39DDB',
              action: { type: 'message', label, text: label },
            })),
          },
        },
      })
      return
    }
    const profile = { ...(s.love_profile || {}), gender: t }
    await setSession(userId, { love_step: 'PROFILE_AGE', love_profile: profile })

    // 年代選択
    const ages = ['10代未満','10代','20代','30代','40代','50代','60代','70代以上']
    await safeReply(event.replyToken, {
      type: 'flex',
      altText: '年代を選んでね',
      contents: {
        type: 'bubble',
        size: 'mega',
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'lg',
          paddingAll: '20px',
          contents: [
            { type: 'text', text: '年代を選んでね', weight: 'bold', size: 'md' },
            ...ages.map((label) => ([
              {
                type: 'button', style: 'primary', height: 'sm', color: '#81D4FA',
                action: { type: 'message', label, text: label },
              },
              { type: 'separator', margin: 'md', color: '#FFFFFF00' },
            ])).flat(),
          ],
        },
      },
    })
    return
  }

  // PROFILE_AGE
  if (s?.love_step === 'PROFILE_AGE') {
    const okAges = ['10代未満','10代','20代','30代','40代','50代','60代','70代以上']
    if (!okAges.includes(t)) {
      await safeReply(event.replyToken, {
        type: 'flex',
        altText: '年代を選んでね',
        contents: {
          type: 'bubble',
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            contents: okAges.map((label) => ({
              type: 'button', style: 'primary', height: 'sm', color: '#81D4FA',
              action: { type: 'message', label, text: label },
            })),
          },
        },
      })
      return
    }
    const profile = { ...(s.love_profile || {}), age: t }
    await setSession(userId, { love_step: 'Q', love_profile: profile, love_idx: 0, love_answers: [] })

    // 「開始」ボタン
    await safeReply(event.replyToken, {
      type: 'flex',
      altText: '準備OKなら開始を押してね',
      contents: {
        type: 'bubble',
        size: 'mega',
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'lg',
          paddingAll: '20px',
          contents: [
            { type: 'text', text: 'ありがとう🌸 このあと少しずつ質問するね。準備OKなら「開始」を押してね', wrap: true },
            { type: 'button', style: 'primary', height: 'md', color: '#4CAF50',
              action: { type: 'message', label: '開始', text: '開始' } },
          ],
        },
      },
    })
    return
  }

  // Q（回答解釈→開始チェックの順）
  if (s?.love_step === 'Q') {
    const idx = s.love_idx ?? 0

    // 回答の解釈（〇囲み/全角数字も拾う）
    let pick = t
    const circled = { '①':'1','②':'2','③':'3','④':'4','１':'1','２':'2','３':'3','４':'4' }
    if (circled[pick]) pick = circled[pick]
    if (!/^[1-4]$/.test(pick)) {
      const refQ = idx === 0 ? QUESTIONS[0] : (QUESTIONS[idx - 1] || QUESTIONS[idx])
      const pos = refQ?.choices?.findIndex((c) => cleanForUser(c) === t || c === t)
      if (pos >= 0) pick = String(pos + 1)
    }

    if (/^[1-4]$/.test(pick)) {
      const answers = [...(s.love_answers || []), pick]
      const nextIdx = idx + 1
      await setSession(userId, { love_step: 'Q', love_answers: answers, love_idx: nextIdx })

      // ▼ 保険：次の設問が存在しなければ最終承諾へ
      if (!QUESTIONS[nextIdx]) {
        await setSession(userId, { love_step: 'CONFIRM_PAY' })
        await safeReply(
          event.replyToken,
          '🧾 最終確認\n' +
          'このあとの「診断書の作成・納品」には **3,980円（税込）** が必要です。\n' +
          '承諾する場合は［承諾］、やめる場合は［💌 はじめの画面へ］を押してね。'
        )
        await push(userId, buildFinalConfirmFlex())
        return
      }

      await sendNextLoveQuestion(event, { ...s, love_answers: answers, love_idx: nextIdx })
      return
    }

    // 回答じゃない → 最初だけ開始必須
    if (idx === 0) {
      if (tn === '開始') {
        await sendNextLoveQuestion(event, s)
        return
      }
      await safeReply(event.replyToken, {
        type: 'flex',
        altText: '準備OKなら開始を押してね',
        contents: {
          type: 'bubble',
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            contents: [
              { type: 'text', text: '準備OKなら「開始」を押してね✨' },
              { type: 'button', style: 'primary', action: { type: 'message', label: '開始', text: '開始' } },
            ],
          },
        },
      })
      return
    }

    // それ以外は現在のQを再掲
    await sendNextLoveQuestion(event, s)
    return
  }

  // 最終承諾フロー
  if (s?.love_step === 'CONFIRM_PAY') {
    if (tn === '承諾' || /^(ok|はい)$/i.test(tn)) {
      await sendAnswersAsTextAndNotice(event, s)
      await setSession(userId, { flow: 'idle', love_step: 'DONE' })
      return
    }
    if (tn === 'トークTOP') {
      await setSession(userId, { flow: 'idle', love_step: null, love_idx: null })
      await safeReply(event.replyToken, 'はじめの画面に戻るね💌')
      return
    }
    await safeReply(
      event.replyToken,
      '🧾 最終確認\n' +
      'このあとの「診断書の作成・納品」には **3,980円（税込）** が必要です。\n' +
      '承諾する場合は［承諾］、やめる場合は［💌 はじめの画面へ］を押してね。'
    )
    await push(userId, buildFinalConfirmFlex())
    return
  }

  // 未初期化 → ご案内
  await setSession(userId, { flow: 'love40', love_step: 'PRICE', love_idx: 0 })
  await sendLove40Intro(event)
}

/* =========================
   セッション I/O
   ========================= */
async function loadSession(userId) {
  const { data } = await supabase.from(SESSION_TABLE).select('*').eq('user_id', userId).maybeSingle()
  return data || { user_id: userId, flow: 'love40', love_step: 'PRICE', love_idx: 0 }
}

async function setSession(userId, patch) {
  if (!userId) return
  await supabase
    .from(SESSION_TABLE)
    .upsert(
      { user_id: userId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
}
