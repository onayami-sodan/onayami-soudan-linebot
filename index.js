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

// LINE設定
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);

// LINE専用Webhook（middlewareは必ず先に！）
app.post("/webhook", line.middleware(config), async (req, res) => {
  try {
    const results = await Promise.all(
      req.body.events.map((event) => handleEvent(event))
    );
    res.json(results);
  } catch (err) {
    console.error("エラー:", err);
    res.status(500).end();
  }
});

async function handleEvent(event) {
  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }

  const userId = event.source.userId;

  // セッションカウントを Supabase から取得
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
    reply = await callGPT(event.message.text); // ←仮の返答関数
  } else {
    reply =
      "ここから先はnoteの有料記事でご案内しています。\n今日のパスワードはこちら → https://note.com/○○○/n/note-password";
  }

  // セッション情報をSupabaseへ保存/更新
  await supabase
    .from("user_sessions")
    .upsert({ user_id: userId, count });

  return client.replyMessage(event.replyToken, {
    type: "text",
    text: reply,
  });
}

// 仮の返答（必要なら GPT API に変更可）
async function callGPT(userMessage) {
  return "なるほど…そのお悩み、よくありますよ。";
}

app.listen(3000, () => {
  console.log("🚀 Server running on port 3000");
});
