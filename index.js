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

// 日本時間の日付取得
function getJapanDateString() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

// 毎日同じランダムパスワードを生成
function generateDailyPassword() {
  const jst = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  const seed = jst.toISOString().slice(0, 10); // "YYYY-MM-DD"

  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }

  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < 6; i++) {
    password += chars.charAt(Math.abs((hash + i * 17) % chars.length));
  }

  return password;
}

app.post('/webhook', async (req, res) => {
  const events = req.body.events;

  if (!events || events.length === 0) {
    return res.status(200).send("No events");
  }

  // パスワードは1日1回だけ生成して共通で使う！
  const today = getJapanDateString();
  const todayPassword = generateDailyPassword();

  for (const event of events) {
    try {
      if (event.type === 'message' && event.message.type === 'text') {
        const userId = event.source.userId;
        const userMessage = event.message.text.trim();

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

        // 🔐 認証パスワードチェック
        if (userMessage === todayPassword) {
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
            messages: [
              {
                type: 'text',
                text: `パスワード認証できたよ☺️\n今日は回数制限なしで、ゆっくりお話ししようね💕`,
              },
            ],
          });
          continue;
        }

        let replyText = '';
        let newCount = count + 1;

        // 🚫 未認証かつ6回以上 → note誘導
        if (!authenticated && count >= 6) {
          replyText =
            `たくさんお話してくれてありがとうね☺️\n` +
            `明日になれば、またお話しできるよ🥰\n` +
            `このまま続けるなら日替わりパスワードを取得してトークルームに入力してね☺️\n` +
            `今日のパスワード👉 ${todayPassword}\n` +
            `パスワードの詳細はこちら👉 ${NOTE_URL}`;
        } else {
          // 初回のみSystemプロンプト
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
        }

        console.log(`💬 Botの返答: ${replyText}`);

        // 📝 Supabaseへ保存
        const { error: saveError } = await supabase.from('user_sessions').upsert({
          user_id: userId,
          count: newCount,
          messages,
          last_date: today,
          greeted,
          authenticated,
          auth_date: authDate,
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
