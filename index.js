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

const NOTE_URL = 'https://note.com/your_note_link';

function getJapanDateString() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
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
        const today = getJapanDateString();

        console.log(`📩 [${today}] userId: ${userId}, message: ${userMessage}`);

        let { data: session, error } = await supabase
          .from('user_sessions')
          .select('count, messages, last_date, greeted, noted')
          .eq('user_id', userId)
          .single();

        if (error) console.error('❌ Supabase セッション取得エラー:', error);

        let count = 0;
        let messages = [];
        let greeted = false;
        let lastDate = today;
        let noted = false;

        if (session) {
          messages = session.messages || [];
          greeted = session.greeted || false;
          lastDate = session.last_date || today;
          noted = session.noted || false;

          if (lastDate !== today) {
            count = 0;
          } else {
            count = session.count || 0;
          }
        }

        console.log(`📊 現在のカウント: ${count}, noted: ${noted}`);

        let replyText = '';
        let newCount = count;
        let newNoted = noted;

        if (count >= 6 || noted === true) {
          replyText = `たくさんお話してくれてありがとうね☺️\nよかったら、続きをこちらで読んでみてね…\n${NOTE_URL}`;
          newNoted = true; // 1回だけnote案内
        } else {
          if (count === 0 && messages.length === 0 && !greeted) {
            messages.push({
              role: 'system',
              content:
                'あなたは30歳くらいの、やさしくておっとりした女性相談員です。話し相手の気持ちに寄り添いながら、ふわっとやわらかい口調で返してください。決してきつい言い方はせず、質問の形で会話が続くようにしてください。かわいらしく、安心感のある雰囲気を大切にしてください。意味のない返事には、やさしく相づちを返すだけで大丈夫です。',
            });
            greeted = true;
          }

          messages.push({ role: 'user', content: userMessage });

          const chatResponse = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages,
          });

          const assistantMessage = chatResponse.choices[0].message;
          messages.push({ role: 'assistant', content: assistantMessage.content });

          replyText = assistantMessage.content;
          newCount = count + 1;
        }

        console.log(`💬 Botの返答: ${replyText}`);

        const { error: saveError } = await supabase.from('user_sessions').upsert({
          user_id: userId,
          count: newCount,
          messages,
          last_date: today,
          greeted,
          noted: newNoted,
        });

        if (saveError) console.error('❌ Supabase 保存エラー:', saveError);

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
