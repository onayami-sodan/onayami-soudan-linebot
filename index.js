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

        // セッション取得
        const { data: session, error } = await supabase
          .from('user_sessions')
          .select('count, messages, age_group, topic')
          .eq('user_id', userId)
          .single();

        const count = session?.count || 0;
        let messages = session?.messages || [];

        let age_group = session?.age_group || null;
        let topic = session?.topic || null;

        let replyText = '';

        // ステップ①：年齢を聞く
        if (!age_group) {
          const agePattern = /([1-9][0-9])代|([1-9][0-9])歳/;
          const match = userMessage.match(agePattern);

          if (match) {
            const age = parseInt(match[1] || match[2]);
            if (age < 20) age_group = '10代';
            else if (age < 30) age_group = '20代';
            else if (age < 40) age_group = '30代';
            else if (age < 50) age_group = '40代';
            else if (age < 60) age_group = '50代';
            else age_group = '60代以上';

            replyText = `ありがとう🌸 次に、どんなことについて悩んでるか教えてね。\n「恋愛・家族・職場・友人・孤独感」などから選んでね。`;
          } else {
            replyText = 'まず、あなたのご年齢を教えてもらってもいいかな？（例：「30代」「25歳」など）';
          }

          await supabase.from('user_sessions').upsert({
            user_id: userId,
            count: count + 1,
            age_group,
            topic,
            messages,
          });

          await line.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text: replyText }],
          });
          continue;
        }

        // ステップ②：トピック選択
        if (!topic) {
          const validTopics = ['恋愛', '家族', '職場', '友人', '孤独感'];
          if (validTopics.includes(userMessage)) {
            topic = userMessage;
            replyText = `わかったよ🌷それじゃ、${topic}のことで今いちばん気になってることを聞かせてね。`;
          } else {
            replyText = '「恋愛・家族・職場・友人・孤独感」から選んでね🌸';
          }

          await supabase.from('user_sessions').upsert({
            user_id: userId,
            count: count + 1,
            age_group,
            topic,
            messages,
          });

          await line.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text: replyText }],
          });
          continue;
        }

        // ステップ③：通常の会話
        if (count >= 5) {
          replyText = `🌸お話を聞かせてくれてありがとう。\n続きはぜひこちらから読んでみてね：\n${NOTE_URL}`;
        } else {
          // 最初にプロンプトを追加
          if (messages.length === 0) {
            messages.push({
              role: 'system',
              content: `あなたは${age_group}の方の${topic}の悩みにやさしく寄り添う相談員です。共感を大切にしながら、短くやさしい言葉で次の話題につながる質問を添えてください。アドバイスよりも気持ちの理解を優先してください。`,
            });
          }

          messages.push({ role: 'user', content: userMessage });

          const chatResponse = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages,
          });

          const assistantMessage = chatResponse.choices[0].message;
          messages.push({ role: 'assistant', content: assistantMessage.content });

          replyText = assistantMessage.content;
        }

        // セッション保存
        await supabase.from('user_sessions').upsert({
          user_id: userId,
          count: count + 1,
          age_group,
          topic,
          messages,
        });

        // 返信送信
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
