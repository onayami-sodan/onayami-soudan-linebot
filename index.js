require('dotenv').config();
const express = require('express');
const { messagingApi } = require('@line/bot-sdk');
const OpenAI = require('openai');
const { supabase } = require('./supabaseClient');

const app = express();
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const line = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

const ADMIN_SECRET = 'azu1228';

const noteList = [  
  { password: 'neko12', url: 'https://note.com/noble_loris1361/n/nb55e92147e54' },
  { password: 'momo34', url: 'https://note.com/noble_loris1361/n/nfbd564d7f9fb' },
  { password: 'yume56', url: 'https://note.com/noble_loris1361/n/ndb8877c2b1b6' },
  { password: 'riri07', url: 'https://note.com/noble_loris1361/n/n306767c55334' },
  { password: 'nana22', url: 'https://note.com/noble_loris1361/n/nad07c5da665c' },
  { password: 'hono11', url: 'https://note.com/noble_loris1361/n/naa63e451ae21' },
  { password: 'koko88', url: 'https://note.com/noble_loris1361/n/nd60cdc5b729f' },
  { password: 'rara15', url: 'https://note.com/noble_loris1361/n/nd4348855021b' },
  { password: 'chuu33', url: 'https://note.com/noble_loris1361/n/na51ac5885f9e' },
  { password: 'mimi19', url: 'https://note.com/noble_loris1361/n/n6fbfe96dcb4b' },
  { password: 'luna28', url: 'https://note.com/noble_loris1361/n/n3c2e0e045a90' },
  { password: 'peko13', url: 'https://note.com/noble_loris1361/n/n6e0b6456ffcc' },
  { password: 'yuki09', url: 'https://note.com/noble_loris1361/n/nfcbd6eeb5dca' },
  { password: 'toto77', url: 'https://note.com/noble_loris1361/n/n9abc16c0e185' },
  { password: 'puni45', url: 'https://note.com/noble_loris1361/n/n20cfd0524de1' },
  { password: 'kiki01', url: 'https://note.com/noble_loris1361/n/nf766743a0c08' },
  { password: 'susu66', url: 'https://note.com/noble_loris1361/n/n1d1d57bf38f5' },
  { password: 'hime03', url: 'https://note.com/noble_loris1361/n/n2cac5b57d268' },
  { password: 'pipi17', url: 'https://note.com/noble_loris1361/n/nbf7974aabaca' },
  { password: 'coco29', url: 'https://note.com/noble_loris1361/n/nf8849ba3c59c' },
  { password: 'roro04', url: 'https://note.com/noble_loris1361/n/n477c92d85000' },
  { password: 'momo99', url: 'https://note.com/noble_loris1361/n/n332e40058be6' },
  { password: 'nana73', url: 'https://note.com/noble_loris1361/n/n5097160bee76' },
  { password: 'lulu21', url: 'https://note.com/noble_loris1361/n/nd10ed1ef8137' },
  { password: 'meme62', url: 'https://note.com/noble_loris1361/n/n4a344dce3a8c' },
  { password: 'popo55', url: 'https://note.com/noble_loris1361/n/nd7d8de167f37' },
  { password: 'koro26', url: 'https://note.com/noble_loris1361/n/n0fdf4edfa382' },
  { password: 'chibi8', url: 'https://note.com/noble_loris1361/n/n5eaea9b7c2ba' },
  { password: 'mimi44', url: 'https://note.com/noble_loris1361/n/n73b5584bf873' },
  { password: 'lala18', url: 'https://note.com/noble_loris1361/n/nc4db829308a4' },
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
  return diff < 2 * 24 * 60 * 60 * 1000;
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
      if (event.type === 'follow') {
        const userId = event.source.userId;
        console.log(`[LOG] 👤 新しい友だち追加: userId=${userId}, timestamp=${new Date().toISOString()}`);
        continue;
      }

      if (event.type === 'message' && event.message.type === 'text') {
        const userId = event.source.userId;
        const userMessage = event.message.text.trim();

       // ユーザー情報の取得（ここを修正）
const { data: charRow } = await supabase
  .from('user_characters')
  .select('character_persona, character_name')
  .eq('user_id', userId)
  .maybeSingle();

const characterPersona = charRow?.character_persona || `27歳くらいのおっとりした女の子。...`;



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

        let { data: session } = await supabase
          .from('user_sessions')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        let count = 0, messages = [], greeted = false, authenticated = false, authDate = null;

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
          const trimmedMessages = messages.slice(-7);
          await supabase.from('user_sessions').upsert({
            user_id: userId, count, messages: trimmedMessages, last_date: today,
            greeted, authenticated: true, auth_date: today, updated_at: new Date().toISOString(),
          });
          await line.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text: `合言葉が確認できたよ☺️\n今日はずっとお話しできるからね💕` }],
          });
          continue;
        }

        let replyText = '';
        let newCount = count + 1;

        if (!authenticated) {
          if (count <= 4) {
            // 通常応答
          } else if (count === 5) {
            if (messages.length === 0 && !greeted) {
              messages.push({ role: 'system', content: fullPersona });
              greeted = true;
            }
            messages.push({ role: 'user', content: userMessage });
            const chatResponse = await openai.chat.completions.create({ model: 'gpt-4o', messages });
            const assistantMessage = chatResponse.choices[0].message;
            messages.push({ role: 'assistant', content: assistantMessage.content });
            replyText = assistantMessage.content + `\n\n🌸 続けて話したい方はこちらから合言葉を入手してね！\n👉 ${todayNote.url}\n🔑 `;
          } else {
            replyText = `たくさんお話してくれてありがとうね☺️\n明日になれば、またお話しできるよ🥰\nこのまま続けるなら、下のリンクから合言葉を入手してね☺️\n👉 ${todayNote.url}`;
          }
        }

        if (replyText === '') {
          if (messages.length === 0 && !greeted) {
            messages.push({ role: 'system', content: fullPersona });
            greeted = true;
          }
          messages.push({ role: 'user', content: userMessage });
          const chatResponse = await openai.chat.completions.create({ model: 'gpt-4o', messages });
          const assistantMessage = chatResponse.choices[0].message;
          messages.push({ role: 'assistant', content: assistantMessage.content });
          replyText = assistantMessage.content;
        }

        await supabase.from('user_sessions').upsert({
          user_id: userId, count: newCount, messages, last_date: today,
          greeted, authenticated, auth_date: authDate, updated_at: new Date().toISOString(),
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
