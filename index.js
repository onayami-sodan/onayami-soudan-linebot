// 必要なライブラリの読み込み
require("dotenv").config();
const express = require("express");
const line = require("@line/bot-sdk");
const { createClient } = require("@supabase/supabase-js");

// Supabaseクライアントの初期化
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const app = express();

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);

app.use(express.json());

app.post("/webhook", line.middleware(config), async (req, res) => {
  const results = await Promise.all(
    req.body.events.map((event) => handleEvent(event))
  );
  res.json(results);
});

async function handleEvent(event) {
  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }

  const userId = event.source.userId;

  // Supabaseから現在のカウントを取得
  const { data, error } = await supabase
    .from("user_sessions")
    .select("count")
    .eq("user_id", userId)
    .single();

  let count = data ? data.count + 1 : 1;
  let reply;

  if (count === 1) {
    reply = "こんにちは。今日はどんなお悩みですか？";
  } else if (count <= 5) {
    reply = await callGPT(event.message.text);
  } else {
    reply =
      "ここから先はnoteの有料記事でご案内しています。\n今日のパスワードはこちら \u2192 https://note.com/○○○/n/note-password";
  }

  // Supabaseへセッションデータを保存・更新
  await supabase.from("user_sessions").upsert({
    user_id: userId,
    count,
  });

  return client.replyMessage(event.replyToken, {
    type: "text",
    text: reply,
  });
}

async function callGPT(userMessage) {
  return "なるほど…そのお悩み、よくありますよ。";
}

app.listen(3000);
console.log("Server running on port 3000");
