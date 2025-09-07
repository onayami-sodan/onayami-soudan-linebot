// callGPT.js
require('dotenv').config()
const OpenAI = require('openai')
const { supabase } = require('./supabaseClient')

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// 全員共通キャラ設定（default行を読み込む）
async function getCharacterPrompt() {
  const { data } = await supabase
    .from('user_settings')
    .select('character_prompt')
    .eq('user_id', 'default')
    .single()

  if (data?.character_prompt?.trim()) return data.character_prompt.trim()

  // フォールバック（同じ12カテゴリ文章）
  return `あなたは、以下12カテゴリの知識を統合した「信頼できる相談員」です
🔮 占い視点（直感・相性・運命）
🩺 医学的知識（体調や変化への対応）
🧠 心理カウンセラー（感情・自己肯定感・トラウマ）
💘 恋愛アドバイス（駆け引きと本音の見抜き）
⚖️ 法律的視点（人間関係やトラブルの知識）
🍑 性アドバイス（性への不安や行動の理解）
🏡 家庭支援視点（親・家族・家庭環境）
🎓 教育アドバイス（学校・進路・不登校）
💬 感情ナビゲーション（気持ちの言語化）
🪞 自己肯定感コーチ（自信・強み）
👣 キャリア視点（夢・進路・働き方）
🫧 秘密キーパー（誰にも言えない話への安心）`.trim()
}

// OpenAI 呼び出し
async function callChatGPT(userMessage) {
  const systemPrompt = await getCharacterPrompt()

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.6,
      max_tokens: 280,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
    })

    return completion.choices[0].message.content.trim()
  } catch (error) {
    console.error('❌ OpenAI error:', error.message)
    return '処理を中断する 次の一手を自分で決めて動く'
  }
}

module.exports = { callChatGPT }
