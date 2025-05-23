// index.js
require('dotenv').config();
const express = require('express');
const { messagingApi, validateSignature } = require('@line/bot-sdk');
const { OpenAI } = require('openai');
const { supabase } = require('./supabaseClient');

const app = express();
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post('/webhook', async (req, res) => {
  const events = req.body.events;

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

      // ChatGPT API 呼び出し
      const chatResponse = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'あなたは優しい相談相手です。' },
          { role: 'user', content: userMessage }
        ],
      });

      const replyText = chatResponse.choices[0].message.content;

      // LINE 返信
      await messagingApi.replyMessage(process.env.LINE_CHANNEL_ACCESS_TOKEN, {
        replyToken: event.replyToken,
        messages: [
          { type: 'text', text: replyText }
        ]
      });
    }
  }

  res.status(200).send('OK');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
