require('dotenv').config();
const express = require('express');
const { messagingApi } = require('@line/bot-sdk');
const OpenAI = require('openai'); // 🔄 v4ではこう書く
const { supabase } = require('./supabaseClient');

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const line = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

const NOTE_URL = 'https://note.com/your_note_link'; // ← たっくんのnoteリンクに変更してね

app.post('/webhook', async (req, res) => {
  const events = req.body.events;

  if (!events || events.length === 0) {
    return res.status(200).send("No events");
  }

  for (const event of events) {
    try {
      if (event.type === 'message' && event.message.type === 'text') {
        const userId = event.source.userId;
        const userMessage = event.message.text;

        // 🔸 Supabaseからセッションカウントを取得・更新
        const { data: session, error } = await supabase
          .from('user_sessions')
          .select('count')
          .eq('user_id', userId)
          .single();

        let count = session?.count || 0;
        count++;

        await supabase.from('user_sessions').upsert({ user_id: userId, count });

        let replyText = '';

        if (count === 1) {
          replyText = 'こんにちは🌸 今日どんな悩みがあるのかな？';
        } else if (count >= 2 && count <= 5) {
          const chatResponse = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
              {
                role: 'system',
                content: 'あなたは恋愛や人間関係に悩む人に寄り添う、やさしい相談員です。共感と安心を大切にして、言葉を選んで返してください。',
              },
              {
                role: 'user',
                content: userMessage,
              },
            ],
          });

          replyText = chatResponse.choices[0].message.content;
        } else {
          replyText = `🌸お話を聞かせてくれてありがとう。\n続きはぜひこちらで読んでみてね：\n${NOTE_URL}`;
        }

        // 🔸 LINEへ返信
        await line.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: replyText }],
        });
      }
    } catch (err) {
      console.error('⚠️ エラー発生:', err);
    }
  }

  res.status(200).send('OK');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ LINEボットがポート ${port} で起動中`);
});
