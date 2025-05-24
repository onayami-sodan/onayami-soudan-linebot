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

const NOTE_URL = 'https://note.com/your_note_link'; // ← たっくんのnoteリンクに差し替えてね

// ⏰ 日本時間でやさしい挨拶を返す関数
function getGreeting() {
  const now = new Date();
  const jstHour = (now.getUTCHours() + 9) % 24;

  if (jstHour < 10) return 'おはようございます☀️';
  if (jstHour < 18) return 'こんにちは🌸';
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

        const { data: session } = await supabase
          .from('user_sessions')
          .select('count, messages')
          .eq('user_id', userId)
          .single();

        const count = session?.count || 0;
        let messages = session?.messages || [];

        let replyText = '';

        // 🌸 1ターン目のあいさつ（日本時間対応）
        if (count === 0) {
          const greeting = getGreeting();
          replyText = `${greeting}、はじめまして♪\nどんなことが気になっているのかな？よかったら、お話してみてね🍀`;
        }

        // 🌸 10ターン目以降：note誘導（やさしい語り口）
        else if (count >= 9) {
          replyText = `たくさんお話してくれてありがとうね☺️\nよかったら、続きをこちらで読んでみてね…\n${NOTE_URL}`;
        }

        // 🌸 2〜9ターン目：やさしい相談スタイル
        else {
          if (messages.length === 0) {
            messages.push({
              role: 'system',
              content: `あなたは30歳くらいの、やさしくておっとりした女性相談員です。話し相手の気持ちに寄り添いながら、ふわっとやわらかい口調で返してください。決してきつい言い方はせず、質問の形で会話が続くようにしてください。かわいらしく、安心感のある雰囲気を大切にしてください。`,
            });
          }

          messages.push({ role: 'user', content: userMessage });

          const chatResponse = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages,
          });

          const assistantMessage = chatResponse.choices[0].message;
          messages.push({ role: 'assistant', content: assistantMessage.content });

          replyText = assistantMessage.content;
        }

        // 🔸 Supabaseに保存
        await supabase.from('user_sessions').upsert({
          user_id: userId,
          count: count + 1,
          messages,
        });

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
