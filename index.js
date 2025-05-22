require("dotenv").config();

// LINE Bot と GPT を連携したサンプルコード（5ターンでnoteに誘導）

const express = require('express');
const line = require('@line/bot-sdk');
const session = require('express-session');
const bodyParser = require('body-parser');

const app = express();

// LINEの認証情報（Renderの環境変数に設定してね）
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const client = new line.Client(config);

// セッション管理
app.use(session({
  secret: 'onayami-secret',
  resave: false,
  saveUninitialized: true
}));

app.use(express.json());
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(event => handleEvent(event, req.session)))
    .then(result => res.json(result));
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

// 仮のGPT返答関数（後で本物に差し替えられる）
async function callGPT(userMessage) {
  // ここで実際にOpenAI APIにリクエストを送るように書き換えてね
  return 'なるほど…そのお悩み、よくありますよ。';
}

app.listen(3000);
console.log('Server running');

