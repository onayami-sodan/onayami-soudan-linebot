require("dotenv").config();
const express = require("express");
const line = require("@line/bot-sdk");
const { createClient } = require("@supabase/supabase-js");

// Supabaseクライアント初期化
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

// webhookルートには bodyParser を使わない（LINE署名検証のため）
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

  // Supabaseからセッション回数取得
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
      "ここから先はnoteの有料記事でご案内しています。\n今日のパスワードはこちら→ https://note.com/○○○/n/note-password";
  }

  // Supabaseにカウントを保存/更新
  const { error: upsertError } = await supabase
    .from("user_sessions")
    .upsert({ user_id: userId, count });

  if (upsertError) {
    console.error("UPSERエラー:", upsertError);
  }

  return client.replyMessage(event.replyToken, {
    type: "text",
    text: reply,
  });
}

// ダミーのGPT応答（本番ではAPI連携可能）
async function callGPT(userMessage) {
  return `「${userMessage}」についてですね。少し考えさせてください…`;
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
