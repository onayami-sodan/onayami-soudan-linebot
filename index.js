// ✅ 完全版：LINEボット + ChatGPT API + Supabase セッション保存
require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { Configuration, OpenAIApi } = require('openai');
const line = require('@line/bot-sdk');

const app = express();
const port = process.env.PORT || 3000;

// Supabase 初期化
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// OpenAI 初期化
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// LINE Bot設定
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const lineClient = new line.Client(lineConfig);

app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  Promise.all(req.body.events.map(handleEvent)).then((result) =>
    res.json(result)
  );
});

// イベントハンドラー
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return null;
  }

  const userId = event.source.userId;
  const userMessage = event.message.text;

  // セッションカウント取得・更新
  const { data: existing, error } = await supabase
    .from('user_sessions')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (existing) {
    await supabase
      .from('user_sessions')
      .update({ count: existing.count + 1 })
      .eq('user_id', userId);
  } else {
    await supabase
      .from('user_sessions')
      .insert({ user_id: userId, count: 1 });
  }

  // ChatGPT API 呼び出し
  const completion = await openai.createChatCompletion({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: userMessage }],
  });

  const replyText = completion.data.choices[0].message.content.trim();

  // LINE に返信
  return lineClient.replyMessage(event.replyToken, {
    type: 'text',
    text: replyText,
  });
}

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
