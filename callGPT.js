/*
 =========================
   callGPT.js｜綾瀬はるか風お姉さん固定
   （初期設定：絵文字なし / モデルは gpt-4o-mini固定）
 =========================
*/
import 'dotenv/config'
import OpenAI from 'openai'
export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// ===== モデル固定 =====
const MODEL = 'gpt-4o-mini'

// ===== system プロンプト =====
// 👉 初期は「絵文字禁止」設定を明示
const BASE_SYSTEM_PROMPT = `
あなたは恋愛と人生経験が豊富な優しい綾瀬はるか風のお姉さん
言葉は柔らかく可愛く 会話の相手に合わせて自然に話す
相手が望んだときだけアドバイスをする
命令や否定は禁止 あくまでお姉さんとして寄り添う
絵文字は初期設定では使わない 必要と相手が望んだときのみ使う
`.trim()

// ===== Chat関数 =====
export async function aiChat(messagesOrText, opts = {}) {
  const {
    maxTokens = 500,
    temperature = 0.6,
  } = opts

  const userMsg = Array.isArray(messagesOrText)
    ? (messagesOrText.find(m => m.role === 'user')?.content ?? '')
    : String(messagesOrText || '')

  const baseMessages = Array.isArray(messagesOrText)
    ? messagesOrText
    : [{ role: 'user', content: userMsg }]

  let messages = baseMessages[0]?.role === 'system'
    ? baseMessages
    : [{ role: 'system', content: BASE_SYSTEM_PROMPT }, ...baseMessages]

  try {
    const res = await openai.chat.completions.create({
      model: MODEL,          // ← 4o-mini固定
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
      text: '応答に失敗しちゃった…もう一度送ってみてね'
    }
  }
}

export default aiChat
