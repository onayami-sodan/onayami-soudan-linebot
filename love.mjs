/*
 =========================
   love.mjs（完全版フル）
   - 案内：長文はテキストで全文表示 + 横並びの大きい色付きボタン（Flex）
   - 設問：縦並びの大きいボタン（Flex）
   - 回答テキストをそのまま送信（reply→push 切替で安定）
   - 開始ループ修正
   - セッション保存は部分更新
 =========================
*/

import { safeReply, push } from './lineClient.js'
import { supabase } from './supabaseClient.js'
import { QUESTIONS } from './questions.js'
import { messagingApi } from '@line/bot-sdk'

const SESSION_TABLE = 'user_sessions'
const LINE_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN

// ====== 案内文（全文） ======
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
  '💳 料金：通常9,800円(税込み）が✨今だけ 3,980円（税込み）✨ ',
  '⏱ 目安：48時間以内',
  '🔐 プライバシー：診断以外の目的では利用しません',
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
                style: 'secondary', // 白地に枠線
                color: '#FF4081',   // はじめの画面＝ピンク
                height: 'md',
                action: { type: 'message', label: '💌 はじめの画面へ', text: 'トークTOP' },
              },
            ],
          },
        ],
      },
      styles: { body: { backgroundColor: '#FFF9FB' } },
    },
  }
}

// 設問：縦ボタン（押し間違い防止で余白）
function buildQuestionFlex(q) {
  const circledNums = ['①', '②', '③', '④']
  return {
    type: 'flex',
    altText: `Q${q.id}. ${q.text}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'lg',
        paddingAll: '20px',
        contents: [
          { type: 'text', text: `Q${q.id}. ${q.text}`, wrap: true, weight: 'bold', size: 'md' },
          ...q.choices.map((c, i) => ([
            {
              type: 'button',
              style: 'primary',
              height: 'sm',
              color: '#F59FB0',
              action: { type: 'message', label: `${circledNums[i]} ${c}`, text: String(i + 1) },
            },
            { type: 'separator', margin: 'md', color: '#FFFFFF00' }, // 透明セパレータ＝実質余白
          ])).flat(),
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

  // 1) 案内長文はテキストで全文表示
  await safeReply(event.replyToken, LOVE_INTRO_TEXT.join('\n'))
  // 2) 直後に横並びボタンのFlexを表示
  await push(userId, buildIntroButtonsFlex())
}

/* =========================
   設問出題（Flex縦ボタン）
   ========================= */
async function sendNextLoveQuestion(event, session) {
  const idx = session.love_idx ?? 0
  if (idx >= QUESTIONS.length) {
    await sendAnswersAsTextAndNotice(event, session)
    await setSession(event.source?.userId, { flow: 'idle', love_step: 'DONE' })
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
  lines.push(`年齢: ${profile.age || '(未設定)'}`)
  lines.push(`回答数: ${answers.length}`)
  lines.push('')

  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i]
    const a = answers[i]
    const idx = a ? Number(a) - 1 : -1
    const choiceText = idx >= 0 ? q.choices[idx] : '(未回答)'
    lines.push(`Q${q.id}. ${q.text}`)
    lines.push(`→ 回答: ${a || '-'} : ${choiceText}`)
    lines.push('')
  }

  const txt = lines.join('\n')

  // reply→push で確実に送信
  await replyThenPush(userId, event.replyToken, txt)

  // 案内は push
  await push(
    userId,
    '💌 ありがとう！回答を受け取ったよ。\n' +
      '48時間以内に「恋愛診断書」のURLをLINEでお届けするね。\n' +
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
  const tn = raw.replace(/\s+/g, '') // スペース除去

  const s = await loadSession(userId)

  // PRICE
  if (s?.love_step === 'PRICE') {
    if (tn === '承諾' || /^(ok|はい)$/i.test(tn)) {
      await setSession(userId, { love_step: 'PROFILE_GENDER', love_profile: {}, love_answers: [], love_idx: 0 })

      // 性別選択（Flex縦ボタン）
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
              ...['女性', '男性', 'その他'].map((label) => ([
                {
                  type: 'button',
                  style: 'primary',
                  height: 'sm',
                  color: '#B39DDB',
                  action: { type: 'message', label, text: label },
                },
                { type: 'separator', margin: 'md', color: '#FFFFFF00' },
              ])).flat(),
              {
                type: 'button',
                style: 'secondary',
                height: 'md',
                action: { type: 'message', label: '💌 はじめの画面へ', text: 'トークTOP' },
              },
            ],
          },
        },
      })
      return
    }
    if (tn === 'キャンセル') {
      // 入力しないのと同義だが、互換のため残す（idleへ）
      await setSession(userId, { flow: 'idle', love_step: null, love_idx: null })
      await safeReply(event.replyToken, 'またいつでもどうぞ🌿')
      return
    }
    // 迷い入力 → 案内を再掲
    await safeReply(event.replyToken, LOVE_INTRO_TEXT.join('\n'))
    await push(userId, buildIntroButtonsFlex())
    return
  }

  // PROFILE_GENDER
  if (s?.love_step === 'PROFILE_GENDER') {
    const ok = ['女性', '男性', 'その他'].includes(tn)
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
            contents: ['女性', '男性', 'その他'].map((label) => ({
              type: 'button',
              style: 'primary',
              height: 'sm',
              color: '#B39DDB',
              action: { type: 'message', label, text: label },
            })),
          },
        },
      })
      return
    }
    const profile = { ...(s.love_profile || {}), gender: t }
    await setSession(userId, { love_step: 'PROFILE_AGE', love_profile: profile })

    // 年代選択（Flex縦ボタン）
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
                type: 'button',
                style: 'primary',
                height: 'sm',
                color: '#81D4FA',
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
      const ages = okAges
      await safeReply(event.replyToken, {
        type: 'flex',
        altText: '年代を選んでね',
        contents: {
          type: 'bubble',
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'md',
            contents: ages.map((label) => ({
              type: 'button',
              style: 'primary',
              height: 'sm',
              color: '#81D4FA',
              action: { type: 'message', label, text: label },
            })),
          },
        },
      })
      return
    }
    const profile = { ...(s.love_profile || {}), age: t }
    await setSession(userId, { love_step: 'Q', love_profile: profile, love_idx: 0, love_answers: [] })

    // 「開始」ボタン（縦1ボタン）
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
            {
              type: 'button',
              style: 'primary',
              height: 'md',
              color: '#4CAF50',
              action: { type: 'message', label: '開始', text: '開始' },
            },
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
    const circled = { '①': '1', '②': '2', '③': '3', '④': '4', '１': '1', '２': '2', '３': '3', '４': '4' }
    if (circled[pick]) pick = circled[pick]
    if (!/^[1-4]$/.test(pick)) {
      const refQ = idx === 0 ? QUESTIONS[0] : (QUESTIONS[idx - 1] || QUESTIONS[idx])
      const pos = refQ?.choices?.findIndex((c) => c === t)
      if (pos >= 0) pick = String(pos + 1)
    }

    if (/^[1-4]$/.test(pick)) {
      const answers = [...(s.love_answers || []), pick]
      const nextIdx = idx + 1
      await setSession(userId, { love_step: 'Q', love_answers: answers, love_idx: nextIdx })
      await sendNextLoveQuestion(event, { ...s, love_answers: answers, love_idx: nextIdx })
      return
    }

    // 回答じゃない → 最初だけ開始必須
    if (idx === 0) {
      if (tn === '開始') {
        await sendNextLoveQuestion(event, s)
        return
      }
      // 開始ボタンを再掲
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
