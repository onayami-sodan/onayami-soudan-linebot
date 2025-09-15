// palm.mjs（完全版フル：大きいFlexボタンUX + 最終承諾でニックネーム/性別/年代を表示）

import { supabase } from './supabaseClient.js'
import { safeReply } from './lineClient.js'
import { messagingApi } from '@line/bot-sdk'

const SESSION_TABLE = 'user_sessions'
const LINE_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || ''

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

// 案内（テキスト → 直後に横ボタンFlex）
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
  '1) フル診断（30項目カルテ） 10,000円 → 3,980円',
  
  '',
  '💳 お支払い方法',
  '・PayPay',
  '・クレジットカード（Visa / Master / JCB / AMEX など）',
  '・携帯キャリア決済（SoftBank / au / docomo）',
  '・PayPal',
  '',
  '⏱ お届け：48時間以内',
  '',
  '✅ 進める場合は「承諾」を押してね（キャンセル可）',
]

/* ========== 小物 ========== */

// LINEニックネーム取得
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

/* ========== Flex builders ========== */

// 案内：横並びの大きいボタン（承諾 / はじめの画面へ）
function buildIntroButtonsFlex() {
  return {
    type: 'flex',
    altText: '手相診断を開始しますか？',
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
              { type: 'button', style: 'primary', color: '#4CAF50', height: 'md', action: { type: 'message', label: '承諾', text: '承諾' } },
              { type: 'button', style: 'secondary', height: 'md', action: { type: 'message', label: '💌 はじめの画面へ', text: 'トークTOP' } },
            ],
          },
        ],
      },
      styles: { body: { backgroundColor: '#FFF9FB' } },
    },
  }
}

// 汎用：縦並びの大きい選択ボタン
function buildVerticalButtonsFlex({ title, labels, color = '#81D4FA' }) {
  return {
    type: 'flex',
    altText: title,
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'lg',
        paddingAll: '20px',
        contents: [
          { type: 'text', text: title, weight: 'bold', size: 'md' },
          ...labels.map((label) => ([
            { type: 'button', style: 'primary', height: 'sm', color, action: { type: 'message', label, text: label } },
            { type: 'separator', margin: 'md', color: '#FFFFFF00' },
          ])).flat(),
        ],
      },
      styles: { body: { backgroundColor: '#FFF9FB' } },
    },
  }
}

// HAND専用（左手/右手の説明テキスト付き）
function buildHandFlex() {
  return {
    type: 'flex',
    altText: '左手／右手どちらを診断する？',
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'lg',
        paddingAll: '20px',
        contents: [
          { type: 'text', text: '左手／右手どちらを診断する？', weight: 'bold', size: 'md' },
          { type: 'text', text: '・左手：先天傾向（生まれ持った性質）\n・右手：未来（今の状態・努力の結果）', wrap: true, size: 'sm' },
          { type: 'button', style: 'primary', height: 'sm', color: '#F59FB0', action: { type: 'message', label: '左手', text: '左手' } },
          { type: 'separator', margin: 'md', color: '#FFFFFF00' },
          { type: 'button', style: 'primary', height: 'sm', color: '#F59FB0', action: { type: 'message', label: '右手', text: '右手' } },
        ],
      },
      styles: { body: { backgroundColor: '#FFF9FB' } },
    },
  }
}

// 撮影ガイド + 「準備完了」ボタン
function buildGuideFlex() {
  return {
    type: 'flex',
    altText: '撮影ガイド',
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'lg',
        paddingAll: '20px',
        contents: [
          { type: 'text', text: '📸 撮影ガイド', weight: 'bold', size: 'md' },
          { type: 'text', text: '・手のひら全体が写るように\n・指先まで入れる\n・明るい場所でピントを合わせて', wrap: true },
          { type: 'button', style: 'primary', height: 'md', color: '#4CAF50', action: { type: 'message', label: '準備完了', text: '準備完了' } },
        ],
      },
      styles: { body: { backgroundColor: '#FFF9FB' } },
    },
  }
}

// ★最終承諾：横並びボタン（承諾 / トークTOP）+ ニックネーム/性別/年代を表示
function buildFinalConfirmFlex({ nickname = '', gender = '', ageGroup = '' } = {}) {
  const nameLine = nickname ? `ご依頼者：${nickname}` : 'ご依頼者： (取得できませんでした)'
  const genderLine = gender ? `性別：${gender}` : '性別： (未設定)'
  const ageLine = ageGroup ? `年代：${ageGroup}` : '年代： (未設定)'

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
          { type: 'text', text: `${nameLine}\n${genderLine}\n${ageLine}`, wrap: true, size: 'sm' },
          { type: 'text', text: '承諾する場合は［承諾］、やめる場合は［💌 はじめの画面へ］を押してね', wrap: true, size: 'sm' },
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'md',
            margin: 'lg',
            contents: [
              { type: 'button', style: 'primary', color: '#4CAF50', height: 'md', action: { type: 'message', label: '承諾', text: '承諾' } },
              { type: 'button', style: 'secondary', height: 'md', action: { type: 'message', label: '💌 はじめの画面へ', text: 'トークTOP' } },
            ],
          },
        ],
      },
      styles: { body: { backgroundColor: '#FFF9FB' } },
    },
  }
}

/* =========================
   案内文を表示（ここで必ず初期化）
   ========================= */
export async function sendPalmistryIntro(event) {
  const userId = event.source?.userId
  if (userId) await setSession(userId, { flow: 'palm', palm_step: 'PRICE' })

    await safeReply(event.replyToken, [
    PALM_INTRO_TEXT.join('\n'),
    buildIntroButtonsFlex()
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
      await setSession(userId, { flow: 'idle', palm_step: null }) // フロー終了
      return
    }
    await safeReply(event.replyToken, 'まずはご案内から進めるね。リッチメニューで「手相占い診断」を押してね🌸')
    return
  }

  // テキスト以外は無視
  if (!(event.type === 'message' && event.message?.type === 'text')) return

  const raw = (event.message.text || '').trim().normalize('NFKC')
  const tn = raw.replace(/\s+/g, '') // “準備 完了” などにも対応
  const s = await loadSession(userId)
  const step = s?.palm_step || 'PRICE'

  // PRICE
  if (step === 'PRICE') {
    if (tn === '承諾' || /^(ok|はい)$/i.test(tn)) {
      await setSession(userId, { palm_step: 'GENDER' })
      await safeReply(event.replyToken, buildVerticalButtonsFlex({
        title: '性別を教えてね',
        labels: ['男性', '女性', 'その他'],
        color: '#B39DDB',
      }))
      return
    }
    if (tn === 'キャンセル') {
      await setSession(userId, { flow: 'idle', palm_step: null })
      await safeReply(event.replyToken, 'またいつでもどうぞ🌿')
      return
    }
       await safeReply(event.replyToken, [
      PALM_INTRO_TEXT.join('\n'),
      buildIntroButtonsFlex()
   ])
    return
   }

  // GENDER
  if (step === 'GENDER') {
    const ok = ['男性', '女性', 'その他'].includes(tn)
    if (!ok) {
      await safeReply(event.replyToken, buildVerticalButtonsFlex({
        title: '性別を選んでね',
        labels: ['男性', '女性', 'その他'],
        color: '#B39DDB',
      }))
      return
    }
    await setSession(userId, { palm_step: 'AGE', palm_gender: tn })
    await safeReply(event.replyToken, buildVerticalButtonsFlex({
      title: '年代を選んでね',
      labels: PALM_AGE_OPTIONS,
      color: '#81D4FA',
    }))
    return
  }

  // AGE
  if (step === 'AGE') {
    if (!PALM_AGE_TO_NUMBER.has(tn)) {
      await safeReply(event.replyToken, buildVerticalButtonsFlex({
        title: '年代を選んでね',
        labels: PALM_AGE_OPTIONS,
        color: '#81D4FA',
      }))
      return
    }
    await setSession(userId, {
      palm_step: 'HAND',
      palm_age_group: tn,
      palm_age: PALM_AGE_TO_NUMBER.get(tn),
    })
    await safeReply(event.replyToken, buildHandFlex())
    return
  }

  // HAND
  if (step === 'HAND') {
    if (!(tn === '左手' || tn === '右手')) {
      await safeReply(event.replyToken, buildHandFlex())
      return
    }
    await setSession(userId, { palm_step: 'GUIDE', palm_hand: tn })
    await safeReply(event.replyToken, buildGuideFlex())
    return
  }

  // GUIDE → 最終承諾（Flexのみ表示）
  if (step === 'GUIDE') {
    if (tn === '準備完了') {
      await setSession(userId, { palm_step: 'CONFIRM_PAY' })
      const nickname = await getLineDisplayName(userId)
      const s2 = await loadSession(userId) // 直前のセット後の最新を参照
      await safeReply(event.replyToken, buildFinalConfirmFlex({
        nickname,
        gender: s2?.palm_gender || '',
        ageGroup: s2?.palm_age_group || '',
      }))
      return
    }
    await safeReply(event.replyToken, buildGuideFlex())
    return
  }

  // 最終承諾
  if (step === 'CONFIRM_PAY') {
    if (tn === '承諾' || /^(ok|はい)$/i.test(tn)) {
      await setSession(userId, { palm_step: 'WAIT_IMAGE' })
      await safeReply(event.replyToken, 'OK！画像を送ってください✋（1枚）')
      return
    }
    if (tn === 'トークTOP') {
      await setSession(userId, { flow: 'idle', palm_step: null })
      await safeReply(event.replyToken, 'はじめの画面に戻るね💌')
      return
    }
    // 再掲：常に最新プロフィール付きでFlexのみ
    const nickname = await getLineDisplayName(userId)
    const s2 = await loadSession(userId)
    await safeReply(event.replyToken, buildFinalConfirmFlex({
      nickname,
      gender: s2?.palm_gender || '',
      ageGroup: s2?.palm_age_group || '',
    }))
    return
  }

  // WAIT_IMAGE / PENDING_RESULT でテキストが来た場合
  if (step === 'WAIT_IMAGE' || step === 'PENDING_RESULT') {
    await safeReply(
      event.replyToken,
      '今は画像をお待ちしています📸\n撮影ガイド：明るい場所で手のひら全体が入るように撮ってね！'
    )
    return
  }

  // 未初期化や未知のステップはリセット
  await setSession(userId, { flow: 'palm', palm_step: 'PRICE' })
  await sendPalmistryIntro(event)
}

/* =========================
   セッション I/O（部分更新）
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
  await supabase
    .from(SESSION_TABLE)
    .upsert(
      { user_id: userId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
}
