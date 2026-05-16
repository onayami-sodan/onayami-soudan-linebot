/*
 =========================
   callGPT.js｜AI呼び出し専用
   gpt-4.1-mini / 低温度 / systemはaiRouter側で管理
 =========================
*/

import 'dotenv/config'
import OpenAI from 'openai'

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const MODEL = 'gpt-4.1-mini'

export async function aiChat(messagesOrText, opts = {}) {
  const {
    maxTokens = 500,
    temperature = 0.4,
  } = opts

  const messages = Array.isArray(messagesOrText)
    ? messagesOrText
    : [
        {
          role: 'user',
          content: String(messagesOrText || ''),
        },
      ]

  try {
    const res = await openai.chat.completions.create({
      model: MODEL,
      temperature,
      max_tokens: maxTokens,
      messages,
    })

    const raw = (res.choices?.[0]?.message?.content || '').trim()

    return {
      ok: true,
      text: raw || 'うまく言葉にできなかったから もう一度だけ送ってね',
    }
  } catch (e) {
    console.error('[aiChat ERROR]', e?.message || e)

    return {
      ok: false,
      text: 'うまく返せなかったから もう一度だけ送ってね',
    }
  }
}

export default aiChat
