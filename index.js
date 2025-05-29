// LINE Bot：セッション履歴保持つき 完全安定バージョン🌸（6回目にnote案内追加 + 7回目以降note案内のみ）

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
  // ...（以下省略）noteList をすべて入れてください
  { password: 'fufu31', url: 'https://note.com/noble_loris1361/n/n2f5274805780' },
];

function getJapanDateString() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function getTodayNoteStable() {
  const today = getJapanDateString();
  let hash = 0;
  for (let i = 0; i < today.length; i++) {
    hash = today.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % noteList.length;
  console.log(`[DEBUG] today=${today}, hash=${hash}, index=${index}, noteList.length=${noteList.length}`);
  return noteList[index];
}

function isRecent(timestamp) {
  const now = Date.now();
  const diff = now - new Date(timestamp).getTime();
  return diff < 12 * 60 * 60 * 1000;
}

app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

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

        if (userMessage === ADMIN_SECRET) {
          await line.replyMessage({
            replyToken: event.replyToken,
            messages: [{
              type: 'text',
              text: `✨ 管理者モード\n本日(${today})のnoteパスワードは「${todayNote.password}」です\nURL：${todayNote.url}`,
            }],
          });
          continue;
        }

        let { data: session } = await supabase
          .from('user_sessions')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        let count = 0;
        let messages = [];
        let greeted = false;
        let authenticated = false;
        let authDate = null;

        if (session) {
          const isSameDay = session.last_date === today;
          const isRecentUpdate = isRecent(session.updated_at);
          count = isSameDay ? session.count || 0 : 0;
          messages = isRecentUpdate ? session.messages || [] : [];
          greeted = session.greeted || false;
          authenticated = isSameDay ? session.authenticated || false : false;
          authDate = isSameDay ? session.auth_date || null : null;
        }

        if (userMessage === todayNote.password) {
          await supabase.from('user_sessions').upsert({
            user_id: userId,
            count,
            messages: messages.slice(-6),
            last_date: today,
            greeted,
            authenticated: true,
            auth_date: today,
            updated_at: new Date().toISOString(),
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

        if (!authenticated && count >= 6) {
          await line.replyMessage({
            replyToken: event.replyToken,
            messages: [{
              type: 'text',
              text: `たくさんお話してくれてありがとうね☺️\n明日になれば、またお話しできるよ🥰\nこのまま続けるなら、下のリンクから合言葉を入手してね♪\n👉 ${todayNote.url}`,
            }],
          });
          continue;
        }

        if (messages.length === 0 && !greeted) {
          messages.push({
            role: 'system',
            content: `あなたは「きき」っていう、30歳くらいのおっとりした女の子。やさしくてかわいい口調で話してね。相手の名前は絶対に呼ばないでね。敬語は使わないで。語尾には「〜ね」「〜かな？」「〜してみよっか」。絵文字は文ごとに1つまで。恋愛・感情の話は落ち着いた雰囲気で。否定しないでね🌸`
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

        let replyText = assistantMessage.content;
        if (!authenticated && count === 5) {
          replyText += `\n\n🌸もっとお話したいときは、こちらから合言葉を入手してね♪\n👉 ${todayNote.url}`;
        }

        await supabase.from('user_sessions').upsert({
          user_id: userId,
          count: count + 1,
          messages: messages.slice(-6),
          last_date: today,
          greeted,
          authenticated,
          auth_date: authDate,
          updated_at: new Date().toISOString(),
        });

        await line.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: replyText }],
        });
      }
    } catch (err) {
      console.error('⚠️ エラー発生:', err.message, err.stack);
    }
  }

  res.status(200).send('OK');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ LINEボットがポート ${port} で起動中`);
});
