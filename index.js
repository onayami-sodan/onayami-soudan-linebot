// index.js
require("dotenv").config();
const express = require("express");
const line = require("@line/bot-sdk");
const { Configuration, OpenAIApi } = require("openai");
const { supabase } = require("./supabaseClient");

const app = express();

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);

app.post("/webhook", line.middleware(config), async (req, res) => {
  try {
    const results = await Promise.all(
      req.body.events.map((event) => handleEvent(event))
    );
    res.json(results);
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).send("Error");
  }
});

async function handleEvent(event) {
  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }

  const userId = event.source.userId;
  const messageText = event.message.text;
  console.log("\u{1F4AC} ユーザーID:", userId);
  console.log("\u{1F4DD} メッセージ:", messageText);

  let { data, error } = await supabase
    .from("user_sessions")
    .select("count")
    .eq("user_id", userId)
    .single();

  if (error) {
    console.log("\u{1F6AB} SELECTエラー:", error);
  }

  let count = data ? data.count + 1 : 1;
  console.log("\u{1F4CB} Supabaseへ保存:", { user_id: userId, count });

  await supabase.from("user_sessions").upsert({
    user_id: userId,
    count,
  });

  let reply;

  if (count === 1) {
    reply = "こんにちは。今日はどんなお悩みですか？";
  } else if (count <= 5) {
    reply = await callGPT(messageText);
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
  try {
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
    });
    const openai = new OpenAIApi(configuration);

    const res = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "あなたは共感力の高い恋愛アドバイザーです。" },
        { role: "user", content: userMessage },
      ],
    });

    return res.data.choices[0].message.content.trim();
  } catch (error) {
    console.error("OpenAI error:", error);
    return "すみません、いまはちょっとお答えできません...";
  }
}

app.get("/", (req, res) => {
  res.send("OK");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`\uD83D\uDE80 Server running on port ${PORT}`);
});
