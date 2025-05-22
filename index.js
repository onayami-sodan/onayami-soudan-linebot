// LINEボット × GPT 応答（5ターンでnote誘導）

const express = require('express');
const { Client } = require('@line/bot-sdk');
const session = require('express-session');
const axios = require('axios');

const app = express();

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const client = new Client(config);

// セッション（ユーザーごとのターン数カウント）
app.use(session({
  secret: 'onayami-secret',
  resave: false,
  saveUninitialized: true
}));

app.use(express.json());

app.post('/webhook', (req, res) => {
  Promise
    .all(req.body.events.map(event => handleEvent(event, req.session)))
    .then(result => res.json(result));
});

async function handleEvent(event, session) {
  if (event.type !== 'message' || event.message.type !== 'text') return null;

  const userId = event.source.userId;
  session[userId] = session[userId] || { turn: 0 };
  session[userId].turn++;

  const turn = session[userId].turn;

  if (turn === 1) {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: 'こんにちは。今日はどんなお悩みですか？'
    });
  } else if (turn <= 5) {
    const userMessage = event.message.text;
    const gptResponse = await askGPT(userMessage);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: gptResponse
    });
  } else {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: 'ここから先は有料相談になります。
noteで「今日のパスワード」をご購入くださいね 💌\nhttps://note.com/○○○/n/note-pass-code'
    });
  }
}

async function askGPT(userInput) {
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [{ role: 'user', content: userInput }]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data.choices[0].message.content.trim();
  } catch (error) {
    return 'ごめんなさい、少し混み合っているみたい。時間をおいてまた話しかけてね。';
  }
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Listening on ${port}`);
});
