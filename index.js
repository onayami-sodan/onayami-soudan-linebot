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

        // 🔸 Supabaseから履歴取得
        const { data: session, error } = await supabase
          .from('user_sessions')
          .select('count, messages')
          .eq('user_id', userId)
          .single();

        let count = session?.count || 0;
        let messages = session?.messages || [
          {
            role: 'system',
            content: `あなたは恋愛に悩む人をやさしく支える相談員です。相手の気持ちを否定せず共感しながら、短く優しい言葉で、次の話題につなげる質問を1つ添えてください。話を終わらせず、自然な会話の流れを大切にしてください。`,
          },
        ];

        // 会話履歴にユーザー発言追加
        messages.push({ role: 'user', content: userMessage });

        let replyText = '';

        if (count >= 5) {
          replyText = `🌸お話を聞かせてくれてありがとう。\n続きはぜひこちらから読んでみてね：\n${NOTE_URL}`;
        } else {
          // ChatGPTへ問い合わせ
          const chatResponse = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages,
          });

          const assistantMessage = chatResponse.choices[0].message;
          messages.push({ role: 'assistant', content: assistantMessage.content });
          replyText = assistantMessage.content;

          // 🔸 Supabaseに履歴保存
          await supabase.from('user_sessions').upsert({
            user_id: userId,
            count: count + 1,
            messages,
          });
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
