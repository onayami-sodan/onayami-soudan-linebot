/*
 =========================
   love.mjs（完全版フル｜重複押下防止QID・最終承諾・表示から（）除去）
   - 案内：長文テキスト + 横並びボタン（Flex）
   - 設問：縦ボタン（Flex）※質問文/選択肢の（）はユーザー表示から除去
   - 設問ボタンは `Q{id}-{n}` を送信 → サーバでID一致＆未回答のみ採用
   - 設問完了後：3,980円（税込）の最終承諾 → 承諾で48h案内
   - 回答控え：質問文/選択肢から（）を除去
   - セッションは upsert（部分更新）
 =========================
*/

import { safeReply, push } from './lineClient.js'
import { supabase } from './supabaseClient.js'
import { QUESTIONS } from './questions.js'
import { messagingApi } from '@line/bot-sdk'

const SESSION_TABLE = 'user_sessions'
const LINE_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN

// ====== 起動時サニティチェック（ログ用） ======
;(() => {
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
  '💳 料金：通常9,800円(税込）が✨今だけ 3,980円（税込）✨',
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
  await safeReply(replyToken, chunks[0])
  for (let i = 1; i < chunks.length; i++) await push(userId, chunks[i])
}

// ====== LINEニックネーム ======
async function getLineDisplayName(userId) {
  try {
    if (!LINE_ACCESS_TOKEN || !userId) return ''
    const client = new messagingApi.MessagingApiClient({ channelAccessToken: LINE_ACCESS_TOKEN })
    const prof = await client.getProfile(userId)
    return prof?.displayName || ''
  } catch { return '' }
}

// ====== ユーザー表示クリーンアップ（括弧内メモ除去：全角/半角） ======
function cleanForUser(str = '') {
  return String(str)
    .replace(/（[^）]*）/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/* =========================
   Flex builders
   ========================= */

// 案内ボタン：横並び（承諾 / はじめの画面へ）
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
              { type: 'button', style: 'primary', color: '#4CAF50', height: 'md',
                action: { type: 'message', label: '承諾', text: '承諾' } },
              { type: 'button', style: 'secondary', height: 'md',
                action: { type: 'message', label: '💌 はじめの画面へ', text: 'トークTOP' } },
            ],
          },
        ],
      },
      styles: { body: { backgroundColor: '#FFF9FB' } },
    },
  }
}

// 設問：縦ボタン（表示はクリーン化）／送信テキストは Q{id}-{n}
function buildQuestionFlex(q) {
  const circled = ['①', '②', '③', '④']
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
              action: {
                type: 'message',
                label: `${circled[i]} ${label}`,
                text: `Q${q.id}-${i + 1}`, // ← 質問ID＋選択肢番号を送る
              },
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
              { type: 'button', style: 'primary', color: '#4CAF50', height: 'md',
                action: { type: 'message', label: '承諾', text: '承諾' } },
              { type: 'button', style: 'secondary', height: 'md',
                action: { type: 'message', label: '💌 はじめの画面へ', text: 'トークTOP' } },
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
   設問出題（Flex）＋最終承諾遷移
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
  await safeReply(event.replyToken, buildQuestionFlex(QUESTIONS[idx]))
  return false
}

/* =========================
   回答控え送信＋48h案内（テキスト）
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

  // ▼ 重複防止（同一メッセージIDの再送を弾く）
  const msgId = event.message?.id || ''
  const s0 = await loadSession(userId)
  if (s0?.last_msg_id === msgId) return
  await setSession(userId, { last_msg_id: msgId })

  const raw = (event.message.text || '').trim().normalize('NFKC')
  const t = raw
  const tn = raw.replace(/\s+/g, '')

  const s = s0 || { user_id: userId, flow: 'love40', love_step: 'PRICE', love_idx: 0 }

  // PRICE
  if (s?.love_step === 'PRICE') {
    if (tn === '承諾' || /^(ok|はい)$/i.test(tn)) {
      await setSession(userId, {
        love_step: 'PROFILE_GENDER',
        love_profile: {},
        love_answers: [],
        love_idx: 0,
      })
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
                { type: 'button', style: 'primary', height: 'sm', color: '#B39DDB',
                  action: { type: 'message', label, text: label } },
                { type: 'separator', margin: 'md', color: '#FFFFFF00' },
              ])).flat(),
              { type: 'button', style: 'secondary', height: 'md',
                action: { type: 'message', label: '💌 はじめの画面へ', text: 'トークTOP' } },
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
              { type: 'button', style: 'primary', height: 'sm', color: '#81D4FA',
                action: { type: 'message', label, text: label } },
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

    // ★ ループ防止：まれにPROFILE_AGEのまま「開始」が届くケースを救済
    if (tn === '開始') {
      await setSession(userId, {
        love_step: 'Q',
        love_profile: s.love_profile || {},
        love_idx: 0,
        love_answers: s.love_answers || [],
        love_answered_map: s.love_answered_map || {},
      })
      await sendNextLoveQuestion(event, { ...s, love_step: 'Q', love_idx: 0 })
      return
    }

    const okAges = ['10代未満','10代','20代','30代','40代','50代','60代','70代以上']
    if (!okAges.includes(tn)) {
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
    const profile = { ...(s.love_profile || {}), age: tn }
    await setSession(userId, {
      love_step: 'Q',
      love_profile: profile,
      love_idx: 0,
      love_answers: [],
      love_answered_map: {}, // 回答済み管理
    })

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

  // Q（ID一致 + 未回答のみ採用）
  if (s?.love_step === 'Q') {
    const idx = s.love_idx ?? 0
    const currentQ = QUESTIONS[idx]
    if (!currentQ) { await sendNextLoveQuestion(event, s); return }

    // 「開始」押下 → 必ずQ1表示
    if (tn === '開始') {
      await sendNextLoveQuestion(event, s)
      return
    }

    const answeredMap = s.love_answered_map || {}

    // 新形式: "Q{ID}-{n}"
    let pick = null, qid = null
    const m = /^Q(\d+)[-: ]?([1-4])$/.exec(t)
    if (m) {
      qid = Number(m[1])
      pick = m[2]
    } else {
      // 後方互換（"1"〜"4" や 選択肢本文）
      const circled = { '①':'1','②':'2','③':'3','④':'4','１':'1','２':'2','３':'3','４':'4' }
      let cand = t
      if (circled[cand]) cand = circled[cand]
      if (/^[1-4]$/.test(cand)) pick = cand
      else {
        const pos = currentQ.choices?.findIndex(c => {
          const label = cleanForUser(c)
          return label === t || c === t
        })
        if (pos >= 0) pick = String(pos + 1)
      }
      qid = currentQ.id
    }

    // 表示中のIDと一致 ＆ 未回答？（ここで二重押し無効化）
    if (qid !== currentQ.id || !/^[1-4]$/.test(pick)) {
      // 認識できない入力 → 現在のQを再掲
      await sendNextLoveQuestion(event, s)
      return
    }
    if (answeredMap[String(qid)]) return

    // 採用
    const answers = [...(s.love_answers || []), pick]
    const nextIdx = idx + 1
    const nextMap = { ...answeredMap, [String(qid)]: true }

    await setSession(userId, {
      love_step: 'Q',
      love_answers: answers,
      love_idx: nextIdx,
      love_answered_map: nextMap,
    })

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

  // 未初期化
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
