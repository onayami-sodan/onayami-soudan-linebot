require("dotenv").config();
const express = require("express");
const line = require("@line/bot-sdk");
const { supabase } = require("./supabaseClient");

const app = express();

// LINE Bot 設定
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);

// LINEの署名検証を最初に実行する
app.post("/webhook", line.middleware(config), async (req, res) => {
  const events = req.body.events;
  const results = await Promise.all(events.map(handleEvent));
  res.json(results);
});

async function handleEvent(event) {
  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }

  const userId = event.source.userId;
  console.log("ユーザーID:", userId);

  // Supabaseからカウント取得
  const { data, error: selectError } = await supabase
    .from("user_sessions")
    .select("count")
    .eq("user_id", userId)
    .single();

  if (selectError && selectError.code !== "PGRST116") {
    console.error("SELECTエラー:", selectError);
    return client.replyMessage(event.replyToken, {
      type: "text",
      text: "内部エラーが発生しました。少し時間をおいて試してください。",
    });
  }

  const count = data?.count ? data.count + 1 : 1;
  console.log("現在のカウント:", count);

  let reply;

  if (count === 1) {
    reply = "こんにちは。今日はどんなお悩みですか？";
  } else if (count <= 5) {
    reply = await callGPT(event.message.text);
  } else {
    reply =
      "ここから先は note の有料記事でご案内しています。\n今日のパスワードはこちら → https://note.com/○○○/n/note-password";
  }

  const { error: upsertError } = await supabase.from("user_sessions").upsert({
    user_id: userId,
    count: count,
  });

  if (upsertError) {
    console.error("UPSERTエラー:", upsertError);
  } else {
    console.log(`Supabaseに保存: user_id=${userId}, count=${count}`);
  }

  return client.replyMessage(event.replyToken, {
    type: "text",
    text: reply,
  });
}

async function callGPT(message) {
  // 今後 OpenAI 等と接続する場合はここに記述
  return "なるほど…そのお悩み、よくありますよ。";
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
