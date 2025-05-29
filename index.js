// LINE Bot：セッション履歴保持つき 完全安定バージョン✨（note 31件 + デバッグ付き）

require('dotenv').config();
const express = require('express');
const { messagingApi } = require('@line/bot-sdk');
const OpenAI = require('openai');
const { supabase } = require('./supabaseClient');

const app = express();
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const line = new messagingApi.MessagingApiClient({ channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN });

const ADMIN_SECRET = 'azu1228';

const noteList = [
  { password: 'neko12', url: 'https://note.com/noble_loris1361/n/nb55e92147e54' },
  { password: 'momo34', url: 'https://note.com/noble_loris1361/n/nfbd564d7f9fb' },
  // ...（省略：残りのnoteListはそのまま）
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
      if (event.type === 'message' && event.message.type === 'text') {
        const userId = event.source.userId;
        const userMessage = event.message.text.trim();

        // キャラ設定と名前を読み込む
        const { data: charRow } = await supabase
          .from('user_characters')
          .select('character_persona, character_name')
          .eq('user_id', userId)
          .maybeSingle();

        const characterPersona = charRow?.character_persona || `27歳くらいのおっとりした女の子。
やさしくてかわいい口誤で話してね。
名前は聞かれたときだけ使ってね。
友達みたいにしゃべってね。
言葉のごびにやさしい言葉をつけて。
絵文字も文中で使って。
恋愛や悩みの話は落ち着いた雰囲気を大切にして。`;

        const characterName = charRow?.character_name || '';
        const fullPersona = `${characterPersona}

※名前を聞かれたら「${characterName || 'まだ名前は決まってないよ〜☺️'}」って答えてね🌟`;

        const namePattern = /名前.*(教えて|なに|何|知りたい)/i;
        if (namePattern.test(userMessage)) {
          const replyText = characterName
            ? `えへへ☺️　わたしの名前は「${characterName}」だよ〜🌸`
            : `ううん…まだ名前は決まってないんだぁ☺️ よかったらつけてくれる？💕`;
          await line.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text: replyText }],
          });
          return;
        }

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
          user_id: userId,
          count: newCount,
          messages,
          last_date: today,
          greeted,
          authenticated,
          auth_date: authDate,
          updated_at: new Date().toISOString(),
        });

        await line.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: replyText }] });
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
