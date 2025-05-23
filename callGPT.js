// callGPT.js
require('dotenv').config();
const { OpenAI } = require('openai');

// OpenAIクライアントの初期化
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * 恋愛相談にやさしく応じるChatGPT応答
 * @param {string} userMessage - ユーザーからの相談内容
 * @returns {Promise<string>} - ChatGPTからのやさしい返信
 */
async function callChatGPT(userMessage) {
  try {
    const chatCompletion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `あなたはやさしくて丁寧な恋愛相談員です。
相手の気持ちに寄り添いながら、あたたかい励ましと共感を届けてください。
言葉づかいはやわらかく、否定せずに安心感を与えるトーンで返答してください。
堅苦しくならず、親しみやすさを意識してください。`,
        },
        {
          role: 'user',
          content: userMessage,
        },
      ],
      temperature: 0.8,
      max_tokens: 1000,
    });

    return chatCompletion.choices[0].message.content.trim();
  } catch (error) {
    console.error('❌ OpenAIエラー:', error.message);
    return 'ごめんね、今ちょっとお返事ができないみたい…。また少ししてから話しかけてくれたらうれしいな🌷';
  }
}

module.exports = callChatGPT;
