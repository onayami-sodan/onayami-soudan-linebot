// callGPT.js（ESM完全版）
// ・Node.js ESM（import/export）で統一
// ・gpt-4o-mini を優先、失敗/空返答は gpt-4o に自動フォールバック
// ・aiRouter.js からは `import { aiChat } from './callGPT.js'` で利用

import 'dotenv/config'
import OpenAI from 'openai'

// OpenAI クライアント
export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// 出力の体裁を整える（句点→改行、不要見出しの除去 など）
export function sanitize(text) {
  if (!text) return ''
  let out = text
  out = out.replace(/^\s*[-*●◎◉■□◆◇]?\s*(結論|根拠|行動(?:指針|提案)|要点)\s*[:：]\s*/gim, '')
  out = out.replace(/ズバッと結論を言うと[:：]?\s*/g, '')
  out = out.replace(/。/g, '\n')
  out = out.replace(/\n{3,}/g, '\n\n').trim()
  return out
}

/**
 * Chat 補助（mini優先→4o フォールバック）
 * @param {Array|String} messagesOrText - OpenAI Chat 用 messages 配列 もしくは ユーザのテキスト1本
 * @param {Object} opts
 * @param {number} [opts.maxTokens=280]
 * @param {number} [opts.temperature=0.6]
 * @param {string} [opts.modelHint] - 最初に試すモデル（省略時は gpt-4o-mini）
 * @returns {Promise<{ok:boolean, text:string}>}
 */
export async function aiChat(messagesOrText, opts = {}) {
  const {
    maxTokens = 280,
    temperature = 0.6,
    modelHint,
  } = opts

  const messages = Array.isArray(messagesOrText)
    ? messagesOrText
    : [{ role: 'user', content: String(messagesOrText || '') }]

  async function tryOnce(model) {
    const res = await openai.chat.completions.create({
      model,
      temperature,
      max_tokens: maxTokens,
      messages,
    })
    const raw = (res.choices?.[0]?.message?.content || '').trim()
    const cleaned = sanitize(raw)
    if (!cleaned) throw new Error('empty-response')
    return cleaned
  }

  const order = [modelHint || 'gpt-4o-mini', 'gpt-4o']

  try {
    const text = await tryOnce(order[0])
    return { ok: true, text }
  } catch (e1) {
    console.error('[aiChat mini/hint ERROR]', e1?.message || e1)
    try {
      const text = await tryOnce(order[1])
      return { ok: true, text }
    } catch (e2) {
      console.error('[aiChat 4o ERROR]', e2?.message || e2)
      return { ok: false, text: '今は無理しないで深呼吸 まず一つだけできることを選んでみてね🌸' }
    }
  }
}

export default aiChat
