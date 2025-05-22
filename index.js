// 修正済み：Redisを使ってセッションを永続化したLINEボットサンプル
require("dotenv").config();

const express = require("express");
const line = require("@line/bot-sdk");
const session = require("express-session");
const RedisStore = require("connect-redis")(session);
const redis = require("redis");

const app = express();

// Redis クライアントの作成
const redisClient = redis.createClient({
  url: process.env.REDIS_URL,
  legacyMode: true, // 必要に応じて
});
redisClient.connect().catch(console.error);

// LINE Bot 認証情報
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const client = new line.Client(config);

// Redisベースのセッション設定
app.use(
  session({
    store: new RedisStore({ client: redisClient }),
    secret: "onayami-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }, // HTTPSを使うなら true に
  })
);

app.use(express.json());

// webhookエンドポイント
app.post("/webhook", line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map((event) => handleEvent(event, req.session)))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error("handleEvent error:", err);
      res.status(500).end();
    });
});

// ユーザーごとの会話処理
async function handleEvent(event, session) {
  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }

  const userId = event.source.userId;
  session[userId] = session[userId] || { count: 0 };
  session[userId].count++;

  console.log("userId:", userId);
  console.log("session:", session[userId]);

  const count = session[userId].count;
  let reply = "";

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

// 仮のGPT応答処理
async function callGPT(userMessage) {
  return "なるほど…そのお悩み、よくありますよ。";
}

app.listen(3000);
console.log("Server running on port 3000");

