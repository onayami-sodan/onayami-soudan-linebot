import { messagingApi } from '@line/bot-sdk'

export const line = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
})

export async function safeReply(replyToken, payload) {
  const messages =
    typeof payload === 'string' ? [{ type: 'text', text: payload }]
    : Array.isArray(payload) ? payload : [payload]
  await line.replyMessage({ replyToken, messages })
}

// 画像取得ストリーム
export function getMessageContent(messageId) {
  return line.getMessageContent(messageId)
}

