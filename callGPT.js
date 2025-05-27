// ✅ 最新版：Supabase連携 + GPT-4o + キャラ保持 + LINE返信対応

require('dotenv').config();
const express = require('express');
const { messagingApi, middleware } = require('@line/bot-sdk');
const OpenAI = require('openai');
const { supabase } = require('./supabaseClient');
const { getCharacterPrompt } = require('./userSettings');

const app = express();
app.use(express.json());

// LINE Bot設定
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const client = new messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken,
});

// OpenAIクライアント
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// GPTを呼び出す関数
async function callChatGPT(userMessage, systemPrompt) {
  try {
    const chatCompletion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.8,
      max_tokens: 1000,
    });
    return chatCompletion.choices[0].message.content.trim();
  } catch (error) {
    console.error('❌ OpenAIエラー:', error.message);
    return 'ごめんね、いまちょっとお返事できないみたい…またあとで話しかけてね🌷';
  }
}

// Supabaseからキャラクター設定を取得
// ファイル: userSettings.js
async function getCharacterPrompt(userId) {
  const { data, error } = await supabase
    .from('user_settings')
    .select('character_prompt')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return `
あなたはおっとりしたやさしい30歳の女性です。
恋愛相談を親身に聞いてくれて、柔らかい言葉と絵文字🌸😊💕で安心感を届けます。
敬語とタメ口の中間くらいで、親しみやすく話してください。
    `.trim();
  }
  return data.character_prompt;
}

// LINE Webhook
app.post('/webhook', middleware(config), async (req, res) => {
  const events = req.body.events;
  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      const userId = event.source.userId;
      const userMessage = event.message.text;

      const systemPrompt = await getCharacterPrompt(userId);
      const replyMessage = await callChatGPT(userMessage, systemPrompt);

      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: replyMessage }],
      });
    }
  }
  res.status(200).send('OK');
});

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 LINE Bot is running on port ${PORT}`);
});
