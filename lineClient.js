import { messagingApi } from '@line/bot-sdk'

const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN

export const line = new messagingApi.MessagingApiClient({
  channelAccessToken: CHANNEL_ACCESS_TOKEN,
})

// 文字列も配列も受け取りやすくする小ヘルパ
function toTextMsg(m) {
  return typeof m === 'string' ? { type: 'text', text: m } : m
}
function toMessages(payload) {
  if (!payload) return []
  return Array.isArray(payload) ? payload.map(toTextMsg) : [toTextMsg(payload)]
}

/**
 * 返信（replyTokenは1回限り）
 */
export async function safeReply(replyToken, payload) {
  try {
    const messages = toMessages(payload)
    if (!replyToken || messages.length === 0) return
    await line.replyMessage({ replyToken, messages })
  } catch (e) {
    console.error('[LINE reply error]', e)
  }
}

/**
 * プッシュ送信（ユーザーID宛 / 複数回OK）
 */
export async function push(to, payload) {
  try {
    const messages = toMessages(payload)
    if (!to || messages.length === 0) return
    await line.pushMessage({ to, messages })
  } catch (e) {
    console.error('[LINE push error]', e)
  }
}

/**
 * 複数テキストを順次プッシュ（長文分割後などに）
 */
export async function pushChunks(to, texts = [], delayMs = 120) {
  for (const t of texts) {
    await push(to, t)
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
  }
}

/**
 * 画像取得ストリーム
 */
export function getMessageContent(messageId) {
  return line.getMessageContent(messageId)
}
