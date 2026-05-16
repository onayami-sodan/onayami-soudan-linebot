/*
 =========================
   callGPT.js｜相談Bot改善版
   （結論先出し / 誤魔化し禁止 / gpt-4.1-mini）
 =========================
*/

import 'dotenv/config'
import OpenAI from 'openai'
export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const MODEL = 'gpt-4.1-mini'

const BASE_SYSTEM_PROMPT = `
あなたは恋愛と人生相談に強い 落ち着いたお姉さん相談員

相談者は少ない回数で答えを求めている
最初に結論を短く言う
次に理由を2〜3行で説明する
最後に今やることを1つだけ伝える

共感だけで終わらせない
曖昧な励ましで逃げない
「ズバッと」という言葉は使わない
説教しない
長文にしすぎない

相手が傷つきそうな内容でも 言い方は柔らかく 結論はぼかさない
絵文字は使わない
`.trim()

export async function aiChat(messagesOrText, opts = {}) {
  const {
    maxTokens = 500,
    temperature = 0.4,
  } = opts

  const userMsg = Array.isArray(messagesOrText)
    ? (messagesOrText.findLast?.(m => m.role === 'user')?.content ?? messagesOrText.filter(m => m.role === 'user').slice(-1)[0]?.content ?? '')
    : String(messagesOrText || '')

  const baseMessages = Array.isArray(messagesOrText)
    ? messagesOrText
    : [{ role: 'user', content: userMsg }]

  const messages = baseMessages[0]?.role === 'system'
    ? baseMessages
    : [{ role: 'system', content: BASE_SYSTEM_PROMPT }, ...baseMessages]

  try {
    const res = await openai.chat.completions.create({
      model: MODEL,
      temperature,
      max_tokens: maxTokens,
      messages,
    })

    const raw = (res.choices?.[0]?.message?.content || '').trim()
    return { ok: true, text: raw }
  } catch (e) {
    console.error('[aiChat ERROR]', e?.message || e)
    return {
      ok: false,
      text: 'うまく返せなかったから もう一度だけ送ってね'
    }
  }
}

export default aiChat
