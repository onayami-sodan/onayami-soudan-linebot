// たっくんLINE Bot：note連携＆管理者認証 安定版パスワード🌼

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

const ADMIN_SECRET = 'azu1228';

const noteList = [
  { password: 'neko12', url: 'https://note.com/noble_loris1361/n/nb55e92147e54' },
  { password: 'momo34', url: 'https://note.com/noble_loris1361/n/nfbd564d7f9fb' },
  { password: 'yume56', url: 'https://note.com/noble_loris1361/n/ndb8877c2b1b6' },
  { password: 'meme62', url: 'https://note.com/noble_loris1361/n/nabcde1234567' },
  { password: 'riri07', url: 'https://note.com/noble_loris1361/n/nriri07123456' },
  // 必要に応じて追加してね！
];

function getJapanDateString() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

// 🌼 安定して同じ日付に同じnoteを返すハッシュ式
function getTodayNoteStable() {
  const today = getJapanDateString();
  let hash = 0;
  for (let i = 0; i < today.length; i++) {
    hash = today.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % noteList.length;
  return noteList[index];
}

app.post('/webhook', async (req, res) => {
  const events = req.body.events;
  if (!events || events.length === 0) return res.status(200).send("No events");

  const today = getJapanDateString();
  const todayNote = getTodayNoteStable();

  for (const event of events) {
    try {
      if (event.type === 'message' && event.message.type === 'text') {
        const userId = event.source.userId;
        const userMessage = event.message.text.trim();

        // 🌟 管理者認証モード
        if (userMessage === ADMIN_SECRET) {
          await line.replyMessage({
            replyToken: event.replyToken,
            messages: [
              {
                type: 'text',
                text: `✨ 管理者モード\n本日(${today})のnoteパスワードは「${todayNote.password}」です\nURL：${todayNote.url}`,
              },
            ],
          });
          continue;
        }

        let { data: session, error } = await supabase
          .from('user_sessions')
          .select('count, messages, last_date, greeted, authenticated, auth_date')
          .eq('user_id', userId)
          .single();

        if (error) console.error('❌ Supabase セッション取得エラー:', error);

        let count = 0;
        let messages = [];
        let greeted = false;
        let lastDate = today;
        let authenticated = false;
        let authDate = null;

        if (session) {
          messages = session.messages || [];
          greeted = session.greeted || false;
          lastDate = session.last_date || today;
          authenticated = session.authenticated || false;
          authDate = session.auth_date || null;

          if (lastDate !== today) {
            count = 0;
            authenticated = false;
            authDate = null;
          } else {
            count = session.count || 0;
          }
        }

        // 🔐 合言葉認証
        if (userMessage === todayNote.password) {
          await supabase.from('user_sessions').upsert({
            user_id: userId,
            count,
            messages,
            last_date: today,
            greeted,
            authenticated: true,
            auth_date: today,
          });

          await line.replyMessage({
            replyToken: event.replyToken,
            messages: [{
              type: 'text',
              text: `合言葉が確認できたよ☺️\n今日はずっとお話しできるからね💕`
            }],
          });
          continue;
        }

        let replyText = '';
        let newCount = count + 1;

        if (!authenticated && count >= 6) {
          replyText =
            `たくさんお話してくれてありがとうね☺️\n` +
            `明日になれば、またお話しできるよ🥰\n` +
            `このまま続けるなら、下のリンクから合言葉を入手してね☺️\n` +
            `👉 ${todayNote.url}`;
        } else {
          if (count === 0 && messages.length === 0 && !greeted) {
            messages.push({
              role: 'system',
              content: 'あなたは30歳くらいの、やさしくておっとりした女性相談員です。話し相手の気持ちに寄り添いながら、ふわっとやわらかい口調で返してください。決してきつい言い方はせず、質問の形で会話が続くようにしてください。かわいらしく、安心感のある雰囲気を大切にしてください。意味のない返事には、やさしく相づちを返すだけで大丈夫です。'
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
        }

        await supabase.from('user_sessions').upsert({
          user_id: userId,
          count: newCount,
          messages,
          last_date: today,
          greeted,
          authenticated,
          auth_date: authDate,
        });

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

