// 必要なライブラリを読み込み
require("dotenv").config();
const express = require("express");
const line = require("@line/bot-sdk");
const { supabase } = require("./supabaseClient");

const app = express();

// LINE BOT 設定
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);

// LINEミドルウェア（署名検証）を先に適用！
app.post("/webhook", line.middleware(config), async (req, res) => {
  try {
    const results = await Promise.all(
      req.body.events.map((event) => handleEvent(event))
    );
    res.json(results);
  } catch (err) {
    console.error("Webhookエラー:", err);
    res.status(500).end();
  }
});

async function handleEvent(event) {
  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }

  const userId = event.source.userId;
  console.log("ユーザー ID:", userId);

  // Supabaseから現在のカウントを取得
  const { data, error: selectError } = await supabase
    .from("user_sessions")
    .select("count")
    .eq("user_id", userId)
    .single();

  if (selectError) {
    console.error("SELECTエラー:", selectError.message);
  }

  let count = data ? data.count + 1 : 1;
  let reply = "";

  if (count === 1) {
    reply = "こんにちは🌷今日はどんなお悩みですか？";
  } else if (count <= 5) {
    reply = await callGPT(event.message.text);
  } else {
    reply =
      "ここから先のご相談は、noteの有料記事でご案内しています。\n今日のパスワードはこちら → https://note.com/○○○/n/note-password";
  }

  // Supabaseにセッション情報を保存（upsertで更新 or 追加）
  const { error: upsertError } = await supabase
    .from("user_sessions")
    .upsert({ user_id: userId, count }, { onConflict: ["user_id"] });

  if (upsertError) {
    console.error("UPSERTエラー:", upsertError.message);
  } else {
    console.log("Supabaseに保存:", { user_id: userId, count });
  }

  return client.replyMessage(event.replyToken, {
    type: "text",
    text: reply,
  });
}

async function callGPT(userMessage) {
  // 仮の応答（実際は GPT連携を追加）
  return `「${userMessage}」…なるほど、それは大事なテーマですね。`;
}

app.listen(3000, () => {
  console.log("🌼 Botサーバー起動中 http://localhost:3000");
});

app.listen(3000, () => {
  console.log("🚀 Server running on port 3000");
});

