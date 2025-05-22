require("dotenv").config();

const express = require("express");
const line = require("@line/bot-sdk");

const app = express();

// LINEの認証情報（環境変数に合わせてね）
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const client = new line.Client(config);

// JSONパース用
app.use(express.json());

// ユーザーのカウント保存用（セッションではなくメモリで一時的に）
const userSessions = {};

// Webhookエンドポイント
app.post("/webhook", line.middleware(config), async (req, res) => {
  try {
    const results = await Promise.all(
      req.body.events.map(event => handleEvent(event))
    );
    res.status(200).json(results); // ← LINEが喜ぶ返答
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).end(); // ← エラーがあっても終了させる
  }
});

async function handleEvent(event) {
  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }

  const userId = event.source.userId;
  userSessions[userId] = userSessions[userId] || { count: 0 };
  userSessions[userId].count++;

  const count = userSessions[userId].count;
  let reply = "";

  if (count === 1) {
    reply = "こんにちは。今日はどんなお悩みですか？";
  } else if (count <= 5) {
    reply = await callGPT(event.message.text);
  } else {
    reply = "ここから先はnoteの有料記事でご案内しています。\n今日のパスワードはこちら → https://note.com/○○○/n/note-password";
  }

  return client.replyMessage(event.replyToken, {
    type: "text",
    text: reply
  });
}

// GPTの仮の返答関数（本番ではAPIに変更してね）
async function callGPT(userMessage) {
  return "なるほど…そのお悩み、よくありますよ。";
}

// Render用：PORT変数が使われる
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
