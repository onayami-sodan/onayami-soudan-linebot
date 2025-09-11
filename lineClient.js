// lineClient.js
// LINE Messaging API ラッパ（ESM）
// - 文字列/オブジェクト/配列 どれでも渡せる
// - 5件制限に自動対応（分割送信）
// - 軽いリトライ & ログ強化
// - Flexメッセージそのまま送信OK

import { messagingApi } from '@line/bot-sdk'

const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN
if (!CHANNEL_ACCESS_TOKEN) {
  console.warn('[lineClient] LINE_CHANNEL_ACCESS_TOKEN が設定されていません')
}

export const line = new messagingApi.MessagingApiClient({
  channelAccessToken: CHANNEL_ACCESS_TOKEN,
})

// ---- 内部ユーティリティ -------------------------------------------------

// テキスト or 既に整形済み message object を許容
function toTextMsg(m) {
  return typeof m === 'string' ? { type: 'text', text: m } : m
}
function toMessages(payload) {
  if (!payload) return []
  return Array.isArray(payload) ? payload.map(toTextMsg) : [toTextMsg(payload)]
}

// LINEの一度に送れる上限
const MAX_PER_REQUEST = 5

// APIエラー時に少し待って再試行（429/5xx想定）
async function withRetry(fn, { tries = 2, delayMs = 300 } = {}) {
  let lastErr
  for (let i = 0; i < tries; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      // 429系はヘッダ見れないので固定sleep
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  throw lastErr
}

// ---- 公開API -------------------------------------------------------------

/**
 * 返信（replyTokenは1回限り）
 * payload: 文字列 / messageオブジェクト / その配列
 */
export async function safeReply(replyToken, payload) {
  try {
    const all = toMessages(payload)
    if (!replyToken || all.length === 0) return

    // 5件を超える場合は分割（最初のチャンクのみ reply、残りは push に回す想定なら呼び出し側で対応）
    const chunks = []
    for (let i = 0; i < all.length; i += MAX_PER_REQUEST) {
      chunks.push(all.slice(i, i + MAX_PER_REQUEST))
    }

    await withRetry(() =>
      line.replyMessage({ replyToken, messages: chunks[0] })
    )

    // 余った分は呼び出し側で push してね（ここではreplyTokenが1回しか使えないため実施しない）
  } catch (e) {
    console.error('[LINE reply error]', e?.originalError ?? e)
  }
}

/**
 * プッシュ送信（ユーザーID宛 / 複数回OK）
 * payload: 文字列 / messageオブジェクト / その配列
 */
export async function push(to, payload) {
  try {
    const all = toMessages(payload)
    if (!to || all.length === 0) return

    // 5件上限に合わせて分割
    for (let i = 0; i < all.length; i += MAX_PER_REQUEST) {
      const messages = all.slice(i, i + MAX_PER_REQUEST)
      // 空msgを弾く保険（type未指定など）
      const valid = messages.filter(Boolean)
      if (valid.length === 0) continue

      // 軽いリトライ
      await withRetry(() => line.pushMessage({ to, messages: valid }))
    }
  } catch (e) {
    console.error('[LINE push error]', e?.originalError ?? e)
  }
}

/**
 * 長文を5000字近辺で分割して順次プッシュ
 */
export async function pushChunks(to, texts = [], delayMs = 120) {
  for (const t of texts) {
    await push(to, t)
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
  }
}

/**
 * 画像・音声などのバイナリ取得（ストリーム）
 */
export function getMessageContent(messageId) {
  return line.getMessageContent(messageId)
}

/**
 * 便利: Flex送信用ヘルパ（altText必須）
 * 例) await pushFlex(userId, buildSomeFlex())
 */
export async function pushFlex(to, flex) {
  if (!flex || typeof flex !== 'object') return
  // 既に {type:'flex', ...} ならそのまま、contentsだけなら包む
  const msg =
    flex.type === 'flex'
      ? flex
      : { type: 'flex', altText: 'メッセージ', contents: flex }
  return push(to, msg)
}
