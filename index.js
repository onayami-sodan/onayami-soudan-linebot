// 必要なモジュールを読み込む
const express = require('express');
const line = require('@line/bot-sdk');
const dotenv = require('dotenv');
const { Configuration, OpenAIApi } = require('openai');
const supabase = require('./supabaseClient');

// .envファイルの読み込み
dotenv.config();

// LINEチャネルの設定
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

// Expressアプリケーション作成
const app = express();
app.use(express.json());

// LINEのWebhookイベントハンドラ
app.post('/webhook', line.middleware(config), async (req, res) => {
  const events = req.body.events;

  // 複数イベントに対応
  const results = await Promise.all(events.map(handleEvent));
  res.json(results);
});

// イベント処理の本体
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const userMessage = event.message.text;
  const userId = event.source.userId;

  // Supabaseにセッションを記録（任意）
  await supabase
    .from('user_sessions')
    .upsert({ user_id: userId, updated_at: new Date().toISOString() });

  // OpenAI APIを呼び出す
  const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  });
  const openai = new OpenAIApi(configuration);

  const completion = await openai.createChatCompletion({
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'user', content: userMessage }
    ],
  });

  const aiReply = completion.data.choices[0].message.content;

  // LINEに返信する
  const client = new line.Client(config);
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: aiReply
  });
}

// ポート番号はRenderが指定する環境変数を使う
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
