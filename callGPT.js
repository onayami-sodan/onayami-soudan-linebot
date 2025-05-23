require('dotenv').config();
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function callGPT(userMessage) {
  try {
    const chatCompletion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo', // gpt-4もOK
      messages: [
        {
          role: 'system',
          content: 'あなたは優しく親身に答えてくれる恋愛相談員です。',
        },
        {
          role: 'user',
          content: userMessage,
        },
      ],
    });

    return chatCompletion.choices[0].message.content.trim();
  } catch (err) {
    console.error('❌ ChatGPTエラー:', err);
    return 'ちょっと上手くお返事できなかったみたい…もう一度お願いできる？';
  }
}

module.exports = { callGPT };
