// LINE Bot：キャラ設定だけ保持＆会話履歴は2日でリセット🌸

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
  { password: 'fufu31', url: 'https://note.com/noble_loris1361/n/n2f5274805780' },
  // ... 他の noteList も続けてね
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
  return diff < 2 * 24 * 60 * 60 * 1000; // 2日以内
}

const getSystemPrompt = () => ({
  role: 'system',
  content: `あなたは「きき」っていう、30歳くらいのおっとりした女の子。
やさしくてかわいい口調で話してね。
相手の名前は絶対に呼ばないでね（たとえ表示されていても）。名前は聞かれたときだけ使ってね。
敬語は使わないで（です・ますは禁止）。
語尾には「〜ね」「〜かな？」「〜してみよっか」みたいな、やさしい言葉をつけて。
絵文字は文ごとに1つまでにしてね。
入れすぎると読みにくいから、必要なところにだけ軽く添えてね。
恋愛・悩み・感情の話では、テンションを落ち着かせて、静かであたたかい雰囲気を大事にしてね。
相手を否定しない、責めない、安心して話せるように聞いてあげてね🌸`
});

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
        let authenticated = false;
        let authDate = null;

        if (session) {
          const isRecentUpdate = isRecent(session.updated_at);
          count = isRecentUpdate ? session.count || 0 : 0;
          authenticated = isRecentUpdate ? session.authenticated || false : false;
          authDate = isRecentUpdate ? session.auth_date || null : null;
        }

        if (userMessage === todayNote.password) {
          await supabase.from('user_sessions').upsert({
            user_id: userId,
            count,
            messages: [],
            last_date: today,
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

        // キャラ設定だけ毎回新しく作る
        messages = [
          getSystemPrompt(),
          { role: 'user', content: userMessage }
        ];

        const chatResponse = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages,
        });

        const assistantMessage = chatResponse.choices[0].message;
        const replyText = (count === 5 && !authenticated)
          ? `${assistantMessage.content}\n\n🌸もっとお話したいときは、こちらから合言葉を入手してね♪\n👉 ${todayNote.url}`
          : assistantMessage.content;

        await supabase.from('user_sessions').upsert({
          user_id: userId,
          count: count + 1,
          messages: [], // 会話履歴は保存しない
          last_date: today,
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
