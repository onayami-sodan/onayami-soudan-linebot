require('dotenv').config();
const express = require('express');
const { messagingApi } = require('@line/bot-sdk');
const OpenAI = require('openai');
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

// 🌞 挨拶関数（時間によって変化）
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 10) return 'おはよう☀️';
  if (hour < 18) return 'こんにちは🌸';
  return 'こんばんは🌙';
}

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

        // Supabaseから会話履歴を取得
        const { data: session } = await supabase
          .from('user_sessions')
          .select('count, messages')
          .eq('user_id', userId)
          .single();

        const count = session?.count || 0;
        let messages = session?.messages || [];

        let replyText = '';

        // 🔹 1ターン目のあいさつ（時間で変化）
        if (count === 0) {
          const greeting = getGreeting();
          replyText = `${greeting} 今日どんな悩みがあるのかな？`;
        }
        // 🔹 6ターン目以降はnote誘導
        else if (count >= 5) {
          replyText = `🌸お話を聞かせてくれてありがとう。\n続きはぜひこちらで読んでみてね：\n${NOTE_URL}`;
        }
        // 🔹 2〜5ターン目：会話対応
        else {
          if (messages.length === 0) {
            messages.push({
              role: 'system',
              content: `あなたは恋愛や人間関係に悩む人をやさしく支える相談員です。相手の気持ちを否定せず共感しながら、短くやさしい言葉で、次の話題につながる質問を添えてください。話を終わらせず、自然な会話の流れを大切にしてください。`,
            });
          }

          messages.push({ role: 'user', content: userMessage });

          const chatResponse = await openai.chat.completions.create({
            model: 'gpt-4o', // ← ここがポイント！
            messages,
          });

          const assistantMessage = chatResponse.choices[0].message;
          messages.push({ role: 'assistant', content: assistantMessage.content });

          replyText = assistantMessage.content;
        }

        // Supabaseに保存（ターン数 +1）
        await supabase.from('user_sessions').upsert({
          user_id: userId,
          count: count + 1,
          messages,
        });

        // LINEに返事
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
