require("dotenv").config();
const express = require("express");
const line = require("@line/bot-sdk");
const { createClient } = require("@supabase/supabase-js");

const app = express();

// LINE Bot設定
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

// LINEクライアント
const client = new line.Client(config);

// Supabaseクライアント
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// LINE webhookエンドポイント
app.post("/webhook", line.middleware(config), async (req, res) => {
  console.log("📩 Webhook受信:", JSON.stringify(req.body, null, 2));

  const results = await Promise.all(
    req.body.events.map((event) => handleEvent(event))
  );

  res.json(results);
});

// メイン処理
async function handleEvent(event) {
  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }

  const userId = event.source.userId;
  console.log("👤 userId:", userId);

  // Supabaseからセッション取得
  const { data, error } = await supabase
    .from("user_sessions")
    .select("count")
    .eq("user_id", userId)
    .single();

  if (error) console.error("❗SELECTエラー:", error);

  let count = data ? data.count + 1 : 1;
  let reply;

  if (count === 1) {
    reply = "こんにちは。今日はどんなお悩みですか？";
  } else if (count <= 5) {
    reply = await callGPT(event.message.text);
  } else {
    reply =
      "ここから先はnoteの有料記事でご案内しています。\n今日のパスワードはこちら → https://note.com/○○○/n/note-password";
  }

  // Supabaseに保存（upsert）
  const { error: upsertError } = await supabase.from("user_sessions").upsert({
    user_id: userId,
    count: count,
  });

  if (upsertError) {
    console.error("❗UPSERTエラー:", upsertError);
  } else {
    console.log("✅ Supabaseに保存:", { user_id: userId, count });
  }

  return client.replyMessage(event.replyToken, {
    type: "text",
    text: reply,
  });
}

// GPTもどき（今は固定返答）
async function callGPT(userMessage) {
  console.log("🤖 GPT入力:", userMessage);
  return "なるほど…そのお悩み、よくありますよ。";
}

// サーバー起動
app.listen(3000, () => {
  console.log("🚀 Server running on port 3000");
});

