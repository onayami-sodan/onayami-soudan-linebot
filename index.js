// たっくんLINE Bot：管理者用パスワード確認付き（azu1228） 完全版

const express = require('express');
const app = express();
app.use(express.json());

const ADMIN_SECRET = 'azu1228';

const passwordList = [
  'neko12', 'momo34', 'yume56', 'riri07', 'nana22', 'hono11',
  'koko88', 'rara15', 'chuu33', 'mimi19', 'luna28', 'peko13',
  'yuki09', 'toto77', 'puni45', 'kiki01', 'susu66', 'hime03',
  'pipi17', 'coco29', 'roro04', 'momo99', 'nana73', 'lulu21',
  'meme62', 'popo55', 'koro26', 'chibi8', 'mimi44', 'lala18', 'fufu31'
];

const { messagingApi } = require('@line/bot-sdk');
const line = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

app.post('/webhook', async (req, res) => {
  const events = req.body.events;
  if (!events || events.length === 0) return res.status(200).send("No events");

  for (const event of events) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;

    const userId = event.source.userId;
    const userMessage = event.message.text.trim();
    const today = new Date(new Date().getTime() + 9 * 60 * 60 * 1000); // 日本時間
    const dayIndex = (today.getDate() - 1) % passwordList.length;
    const todayPassword = passwordList[dayIndex];

    // 管理者モード：合言葉入力時に今日のパスワードを返す
    if (userMessage === ADMIN_SECRET) {
      await line.replyMessage({
        replyToken: event.replyToken,
        messages: [
          {
            type: 'text',
            text: `\u2728 管理者モード\n本日(${today.toLocaleDateString('ja-JP')})の note パスワードは「${todayPassword}」ですよ\u2661`
          }
        ]
      });
      continue;
    }

    // 通常のユーザー処理（省略）
    await line.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: 'text',
          text: `こんにちは☺️ ただいま管理者モードではありません。`
        }
      ]
    });
  }

  res.status(200).send('OK');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`\u{1F680} LINEボットがポート${port}で起動中！`);
});
