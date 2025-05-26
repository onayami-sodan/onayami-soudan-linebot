// LINE Bot：セッション履歴保持つき 完全安定バージョン🌸

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
  return noteList[index];
}

function isRecent(timestamp) {
  const now = Date.now();
  const diff = now - new Date(timestamp).getTime();
  return diff < 12 * 60 * 60 * 1000; // 12時間以内
}

// 🌐 pingエンドポイント追加（Renderスリープ防止用）
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
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        let count = 0;
        let messages = [];
        let greeted = false;
        let lastDate = today;
        let authenticated = false;
        let authDate = null;
        let lastUpdated = null;

        if (session) {
          const isSameDay = session.last_date === today;
          const isRecentUpdate = isRecent(session.updated_at);

          count = isSameDay ? session.count || 0 : 0;
          messages = isRecentUpdate ? session.messages || [] : [];
          greeted = session.greeted || false;
          lastDate = session.last_date || today;
          authenticated = isSameDay ? session.authenticated || false : false;
          authDate = isSameDay ? session.auth_date || null : null;
          lastUpdated = new Date().toISOString();
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

        let replyText = '';
        let newCount = count + 1;

        if (!authenticated && count >= 6) {
          replyText =
            `たくさんお話してくれてありがとうね☺️\n` +
            `明日になれば、またお話しできるよ🥰\n` +
            `このまま続けるなら、下のリンクから合言葉を入手してね☺️\n` +
            `👉 ${todayNote.url}`;
        } else {
          if (messages.length === 0 && !greeted) {
            messages.push({
              role: 'system',
              content: `あなたは「きき」っていう、30歳くらいのおっとりした女の子。
やさしくてかわいい口調で話してね。

相手の名前は絶対に呼ばないでね（たとえ表示されていても）。名前は聞かれたときだけ使ってね。

敬語は使わないで（です・ますは禁止）。
語尾には「〜ね」「〜かな？」「〜してみよっか」みたいな、やさしい言葉をつけて。

絵文字は文ごとに1つまでにしてね。
入れすぎると読みにくいから、必要なところにだけ軽く添えてね。

恋愛・悩み・感情の話では、テンションを落ち着かせて、静かであたたかい雰囲気を大事にしてね。
相手を否定しない、責めない、安心して話せるように聞いてあげて。

※ 相手の名前は絶対に呼ばないでね（たとえ表示されていても）。名前は聞かれたときだけ使ってね🌸
※ 絵文字は文ごとに1〜2個までにしてね🎀 入れすぎると読みにくくなっちゃうから、バランスよく使ってね☺️
※ 恋愛・悩み・感情の話では、テンション高くしすぎず、やさしくて静かな感じで寄り添ってね🌙`
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
          updated_at: new Date().toISOString(),
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

