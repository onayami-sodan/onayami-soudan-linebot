require("dotenv").config();
const express = require('express');
const line = require('@line/bot-sdk');
const session = require('express-session');

const app = express();

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const client = new line.Client(config);

// セッション（本番環境ではMemoryStoreは非推奨 → 永続DB対応が必要）
app.use(session({
  secret: 'onayami-secret',
  resave: false,
  saveUninitialized: true
}));

// Webhookは LINE middleware + 生ボディで処理（body-parser禁止！）
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(event => handleEvent(event, req.session)))
    .then(result => res.json(result))
    .catch((err) => {
      console.error('Webhook error:', err);
      res.status(500).end();  // これがないとLINE側に「500返し続けるBot」扱いになる
    });
});

async function handleEvent(event, session) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return null;
  }

  const userId = event.source.userId;
  session[userId] = session[userId] || { count: 0 };
  session[userId].count++;

  const count = session[userId].count;
  let reply = '';

  if (count === 1) {
    reply = 'こんにちは。今日はどんなお悩みですか？';
  } else if (count <= 5) {
    reply = await callGPT(event.message.text);
  } else {
    reply = 'ここから先はnoteの有料記事でご案内しています。\n今日のパスワードはこちら → https://note.com/○○○/n/note-password';
  }

  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: reply
  });
}

// GPTの仮返信（本番はAPI連携へ）
async function callGPT(message) {
  return 'なるほど…そのお悩み、よくありますよ。';
}

// サーバー起動
app.listen(3000, () => {
  console.log('LINE Bot running on port 3000');
});
