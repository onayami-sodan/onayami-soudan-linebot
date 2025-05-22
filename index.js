require("dotenv").config();

const express = require("express");
const session = require("express-session");
const Redis = require("ioredis");
const RedisStore = require("connect-redis").default;
const line = require("@line/bot-sdk");

const app = express();

// Redis クライアントの設定（Render の環境変数 REDIS_URL を使用）
const redisClient = new Redis(process.env.REDIS_URL);

// LINE Bot の認証情報（Render の環境変数に設定）
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);

// セッション管理（Redis永続化）
app.use(
  session({
    store: new RedisStore({ client: redisClient }),
    secret: "onayami-secret",
    resave: false,
    saveUninitialized: false,
  })
);

app.use(express.json());

// LINE Webhookエンドポイント
app.post("/webhook", line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map((event) => handleEvent(event, req.session)))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error("Webhookエラー:", err);
      res.status(500).end();
    });
});

// メッセージ処理ロジック
async function handleEvent(event, session) {
  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }

  const userId = event.source.userId;
  session[userId] = session[userId] || { count: 0 };
  session[userId].count++;
  const count = session[userId].count;

  let reply;
  if (count === 1) {
    reply = "こんにちは。今日はどんなお悩みですか？";
  } else if (count <= 5) {
    reply = await callGPT(event.message.text);
  } else {
    reply =
      "ここから先はnoteの有料記事でご案内しています。\n今日のパスワードはこちら → https://note.com/○○○/n/note-password";
  }

  return client.replyMessage(event.replyToken, {
    type: "text",
    text: reply,
  });
}

// GPTモック（後でAPIに差し替え可）
async function callGPT(userMessage) {
  return `なるほど…「${userMessage}」についてですね。詳しく聞かせてください。`;
}

// ポート起動（Renderでは process.env.PORT が必要）
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});


