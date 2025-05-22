require("dotenv").config();

const express = require("express");
const session = require("express-session");
const Redis = require("ioredis");
const RedisStore = require("connect-redis").default;
const line = require("@line/bot-sdk");

const app = express();
const redisClient = new Redis(process.env.REDIS_URL);

app.use(
  session({
    store: new RedisStore({ client: redisClient }),
    secret: "onayami-secret",
    resave: false,
    saveUninitialized: false,
  })
);

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);

app.use(express.json());

app.post("/webhook", line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map((event) => handleEvent(event, req.session)))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error("Webhook error:", err);
      res.status(500).end();
    });
});

async function handleEvent(event, session) {
  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }

  const userId = event.source.userId;
  session[userId] = session[userId] || { count: 0 };
  session[userId].count++;

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

async function callGPT(userMessage) {
  return "なるほど…そのお悩み、よくありますよ。";
}

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on ${port}`));


app.listen(3000);
console.log("Server running on port 3000");

