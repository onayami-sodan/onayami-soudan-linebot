// index.js
require('dotenv').config();
const express = require('express');
const { messagingApi } = require('@line/bot-sdk');
const { OpenAI } = require('openai');
const { supabase } = require('./supabaseClient');

const app = express();
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const line = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

app.post('/webhook', async (req, res) => {
  const events = req.body.events;
  if (!events || events.length === 0) {
    return res.status(200).send("No events");
  }

  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      const userMessage = event.message.text;
      const userId = event.source.userId;

      // セッション数のカウント
      const { data: session, error } = await supabase
        .from('user_sessions')
        .select('count')
        .eq('user_id', userId)
        .single();

      let count = session?.count || 0;
      count++;

      await supabase.from('user_sessions').upsert({ user_id: userId, count });

      // ChatGPT API 呼び出し（5ターンまでなら続けられるように今後改良可）
      const chatResponse = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'あなたは悩みにやさしく寄り添う相談員です。安心できる言葉で答えてください。' },
          { role: 'user', content: userMessage }
        ],
      });

      const replyText = chatResponse.choices[0].message.content;

      // LINE返信
      await line.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: replyText }],
      });
    }
  }

  res.status(200).send('OK');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
