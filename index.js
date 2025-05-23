// 必要なライブラリの読み込み
require("dotenv").config();
const express = require("express");
const line = require("@line/bot-sdk");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const app = express();

// LINEの設定（環境変数から）
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);

// webhookエンドポイントに署名検証付きで処理を追加
app.post("/webhook", line.middleware(config), async (req, res) => {
  const results = await Promise.all(req.body.events.map(handleEvent));
  res.json(results);
});

// ユーザーごとのやりとりを処理する関数
async function handleEvent(event) {
  console.log("💬 受信イベント：", JSON.stringify(event, null, 2));

  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }

  const userId = event.source.userId;

  // セッションカウント取得
  const { data, error } = await supabase
    .from("user_sessions")
    .select("count")
    .eq("user_id", userId)
    .single();

  let count = data ? data.count + 1 : 1;
  let replyText = "";

  if (count === 1) {
    replyText = "こんにちは。今日はどんなお悩みですか？";
  } else if (count <= 5) {
    replyText = await callGPT(event.message.text);
  } else {
    replyText =
      "ここから先はnoteの有料記事でご案内しています。\n" +
      "今日のパスワードはこちら → https://note.com/○○○/n/note-password";
  }

  console.log(`📩 Supabaseに保存：user_id=${userId}, count=${count}`);

  // Supabaseへ upsert
  const { error: upsertError } = await supabase.from("user_sessions").upsert({
    user_id: userId,
    count: count,
  });

  if (upsertError) {
    console.error("🔥 Supabase保存エラー:", upsertError.message);
  }

  return client.replyMessage(event.replyToken, {
    type: "text",
    text: replyText,
  });
}

// 仮のAI応答関数（あとで本物にしてもOK）
async function callGPT(userMessage) {
  return `なるほど…「${userMessage}」ですね。\nそのお悩み、よくありますよ。`;
}

// Renderに合わせてポートを自動取得（固定3000だとエラーになるため）
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
