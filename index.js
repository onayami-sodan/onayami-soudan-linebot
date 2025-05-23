// index.js
import express from "express";
import { config } from "dotenv";
import line from "@line/bot-sdk";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

config();

const app = express();
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(lineConfig);

// Webhook handler
app.post("/webhook", line.middleware(lineConfig), async (req, res) => {
  try {
    const events = req.body.events;
    const results = await Promise.all(events.map(handleEvent));
    res.json(results);
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).end();
  }
});

async function handleEvent(event) {
  if (event.type !== "message" || event.message.type !== "text") {
    return Promise.resolve(null);
  }

  const userId = event.source.userId;
  const userMessage = event.message.text;

  // セッション保存
  await supabase.from("user_sessions").insert({ user_id: userId, count: 1 });

  // ChatGPT に投げる
  const chatResponse = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      { role: "system", content: "あなたは優しくて思いやりのある相談員です。" },
      { role: "user", content: userMessage },
    ],
  });

  const replyText = chatResponse.choices[0]?.message?.content || "ごめんね、うまく返事できなかったの。";

  // LINE に返信
  return client.replyMessage(event.replyToken, {
    type: "text",
    text: replyText,
  });
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
