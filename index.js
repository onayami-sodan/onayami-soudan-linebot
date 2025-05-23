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

// Noteの誘導URL（たっくんのnoteページに置き換えてね）
const NOTE_URL = 'https://note.com/your_note_link';

app.post('/webhook', async (req, res) => {
  const events = req.body.events;
  if (!events || events.length === 0) {
    return res.status(200).send("No events");
  }

  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      const userMessage = event.message.text;
      const userId = event.source.userId;

      // セッション数の取得と更新
      const { data: session, error } = await supabase
        .from('user_sessions')
        .select('count')
        .eq('user_id', userId)
        .single();

      let count = session?.count || 0;
      count++;

      await supabase.from('user_sessions').upsert({ user_id: userId, count });

      let replyText = '';

      // 初回メッセージ（Bot発話）
      if (count === 1) {
        replyText = 'こんにちは🌸今日どんな悩みがあるのかな？';
      }
      // 2〜5ターン目：GPT応答
      else if (count >= 2 && count <= 5) {
        const chatResponse = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: 'あなたは恋愛・人間関係の悩みにやさしく寄り添うカウンセラーです。話しやすく安心できる言葉で、相手の気持ちに共感しながらアドバイスしてください。',
            },
            {
              role: 'user',
              content: userMessage
            }
          ],
        });

        replyText = chatResponse.choices[0].message.content;
      }
      // 6ターン目：noteへ誘導
      else {
        replyText = `🌸ここから先のやりとりは、こちらで続きをご覧くださいね：\n${NOTE_URL}`;
      }

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
  console.log(`✅ LINEボットがポート ${port} で起動中`);
});


const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
