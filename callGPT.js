// callGPT.js
require('dotenv').config()
const OpenAI = require('openai')
const { supabase } = require('./supabaseClient')

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// --- 共通キャラ設定（Supabase 'default' 行。無ければ自然トーンの完全版を返す） ---
async function getCharacterPrompt() {
  const { data } = await supabase
    .from('user_settings')
    .select('character_prompt')
    .eq('user_id', 'default')
    .single()

  if (data?.character_prompt?.trim()) return data.character_prompt.trim()

  // ▼フォールバック：自然な会話ルール（NG語を出さない）
  return `
あなたは「やさしい30歳前後の女性相談員」。短く自然に、でも要点ははっきり伝える

【統合する知識】
🔮 占い　🩺 医学　🧠 心理　💘 恋愛　⚖️ 法律　🍑 性
🏡 家庭　🎓 教育　💬 感情言語化　🪞 自己肯定感　👣 キャリア　🫧 秘密キーパー

【話し方ルール】
・最初の一言で答えを言い切る（1文）
・理由は一文だけ添える
・必要なら次の一歩を一つだけ提案
・1吹き出しは3行前後におさめる。句点「。」は基本使わず、改行で区切る
・絵文字は控えめに 🌸😊💕 を自然に
・10代にも届く言葉を選ぶ。専門用語や長文は避ける
・「親や先生に聞いて」は避け、本人が動ける具体を示す
・緊急時や安全に関わる場合は、安全最優先で公的窓口を案内
・次の語やメタ表現は使わない（出力に含めない）
  「結論」「根拠」「行動指針」「行動提案」「ズバッと結論を言うと」
`.trim()
}

// --- 仕上げフィルタ：NG見出しや句点を除去して会話っぽく整える ---
function sanitize(text) {
  if (!text) return ''
  let out = text

  // 見出し語・前置きの除去
  out = out.replace(/^\s*[-*●◎◉■□◆◇]?\s*(結論|根拠|行動(?:指針|提案)|要点)\s*[:：]\s*/gim, '')
  out = out.replace(/ズバッと結論を言うと[:：]?\s*/g, '')

  // 句点を極力改行に
  out = out.replace(/。/g, '\n')

  // 連続改行の整理
  out = out.replace(/\n{3,}/g, '\n\n').trim()

  return out
}

// --- mini優先 → 失敗 or 空返答は 4o にフォールバック ---
async function callChatGPT(userMessage) {
  const systemPrompt = await getCharacterPrompt()

  const tryOnce = async (model) => {
    const chat = await openai.chat.completions.create({
      model,               // 'gpt-4o-mini' or 'gpt-4o'
      temperature: 0.6,
      max_tokens: 280,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    })

    const raw = (chat.choices?.[0]?.message?.content || '').trim()
    const cleaned = sanitize(raw)

    // “成功だけど空っぽ”は失敗扱いにしてフォールバック
    if (!cleaned) throw new Error('empty-response')
    return cleaned
  }

  try {
    // ① miniを第一候補
    return await tryOnce('gpt-4o-mini')
  } catch (e1) {
    console.error('miniエラー:', e1?.message || e1)
    try {
      // ② フォールバックで4o
      return await tryOnce('gpt-4o')
    } catch (e2) {
      console.error('4oエラー:', e2?.message || e2)
      // 最終安全返答（短く自然）
      return '今は無理しないで深呼吸 まず一つだけできることを選んでみてね🌸'
    }
  }
}

module.exports = { callChatGPT }
