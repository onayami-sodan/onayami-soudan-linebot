require("dotenv").config();
const express = require("express");
const line = require("@line/bot-sdk");
const { supabase } = require("./supabaseClient");

const app = express();

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);

// LINEミドルウェアは単独で設定（express.json() と併用しない）
app.post("/webhook", line.middleware(config), async (req, res) => {
  const events = req.body.events;

  console.log("🌟 受信イベント:", JSON.stringify(events, null, 2));

  const results = await Promise.all(events.map((event) => handleEvent(event)));
  res.json(results);
});

async function handleEvent(event) {
  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }

  const userId = event.source.userId;
  const userMessage = event.message.text;

  console.log("📥 ユーザーID:", userId);
  console.log("📨 メッセージ:", userMessage);

  // Supabaseからカウント取得
  const { data, error: selectError } = await supabase
    .from("user_sessions")
    .select("count")
    .eq("user_id", userId)
    .single();

  if (selectError && selectError.code !== "PGRST116") {
    console.error("❌ SELECTエラー:", selectError);
  }

  let count = data ? data.count + 1 : 1;

  let reply;
  if (count === 1) {
    reply = "こんにちは。今日はどんなお悩みですか？";
  } else if (count <= 5) {
    reply = await callGPT(userMessage); // モック関数
  } else {
    reply = `ここから先はnoteの有料記事でご案内しています。\n今日のパスワードはこちら → https://note.com/○○○/n/note-password`;
  }

  const { error: upsertError } = await supabase
    .from("user_sessions")
    .upsert({ user_id: userId, count });

  if (upsertError) {
    console.error("❌ UPSERTエラー:", upsertError);
  } else {
    console.log("✅ Supabaseに保存:", { user_id: userId, count });
  }

  return client.replyMessage(event.replyToken, {
    type: "text",
    text: reply,
  });
}

// モックのGPT応答
async function callGPT(userMessage) {
  return `なるほど…「${userMessage}」についてですね。詳しく聞かせてください。`;
}

// Render環境に適応したポート設定
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
