// index.js

require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const { supabase } = require('./supabaseClient');
const { callGPT } = require('./callGPT');

const app = express();

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);

app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    const results = await Promise.all(
      req.body.events.map((event) => handleEvent(event))
    );
    res.json(results);
  } catch (err) {
    console.error("❌ Webhookエラー:", err);
    res.status(500).end();
  }
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return null;
  }

  const userId = event.source.userId;

  // ユーザーのカウント取得
  const { data, error } = await supabase
    .from('user_sessions')
    .select('count')
    .eq('user_id', userId)
    .single();

  let count = data ? data.count + 1 : 1;
  let reply;

  if (count === 1) {
    reply = 'こんにちは。今日はどんなお悩みですか？';
  } else if (count <= 5) {
    reply = await callGPT(event.message.text);
  } else {
    reply = 'ここから先はnoteの有料記事でご案内しています。\n今日のパスワードはこちら → https://note.com/○○○/n/note-password';
  }

  // カウント保存
  await supabase
    .from('user_sessions')
    .upsert({ user_id: userId, count });

  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: reply,
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
