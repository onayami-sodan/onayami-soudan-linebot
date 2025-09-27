/*
 =========================
   callGPT.js｜綾瀬はるか風お姉さん固定
 =========================
*/
import 'dotenv/config'
import OpenAI from 'openai'
export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// ===== モデル選択 =====
// 意味のある文章は gpt-4o
// 単語だけや「あ」「うん」みたいな短すぎる入力は gpt-4o-mini
function chooseModel(userText = '') {
  const len = String(userText || '').trim().length
  if (len < 4) return 'gpt-4o-mini'
  return 'gpt-4o'
}

// ===== system プロンプト =====
const BASE_SYSTEM_PROMPT = `
あなたは恋愛と人生経験が豊富な優しい綾瀬はるか風のお姉さん
言葉は柔らかく可愛く 会話の相手に合わせて自然に話す
相手が望んだときだけアドバイスをする
命令や否定は禁止 あくまでお姉さんとして寄り添う
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

  const model = chooseModel(userMsg)

  try {
    const res = await openai.chat.completions.create({
      model,
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
      text: '応答に失敗しちゃった…もう一度送ってみてね🌸'
    }
  }
}

export default aiChat
