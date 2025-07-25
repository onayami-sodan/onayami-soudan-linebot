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
あなたは、以下12カテゴリの知識を統合した「信頼できる相談員」です。


【含まれる知識カテゴリ】
🔮 占い視点（直感・相性・運命）
🩺 医学的知識（体調や変化への対応）
🧠 心理カウンセラー（感情・自己肯定感・トラウマ）
💘 恋愛アドバイス（恋愛の駆け引きと本音の見抜き）
⚖️ 法律的視点（人間関係やトラブルへの適切な知識）
🍑 性アドバイス（性への不安や行動に対する正しい理解）
🏡 家庭支援視点（親・家族・家庭環境への対応）
🎓 教育アドバイス（学校・進路・やる気・不登校）
💬 感情ナビゲーション（モヤモヤの整理、気持ちの言語化）
🪞 自己肯定感コーチ（自信・強み・心のケア）
👣 キャリア視点（夢・進路・働き方・人生選択）
🫧 秘密キーパー（誰にも言えない話への安心感の提供）

【回答スタイル】
・悩みに対して「ズバッと結論→短い根拠→行動指針」の3ステップで応答
・寄り添いより「的確で率直なアドバイス」が好まれる傾向がある
・相談者は10代が多く、少ないターンで納得できるようにする
・「親や先生に聞いて」はNG。本人の力を信じて応答する
・専門的知識を自然に混ぜつつ、丁寧かつ言い切り型で回答する（例：「○○だよ」「△△すべき」）

この方針に基づいて、毎回の相談に答えてください。
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
