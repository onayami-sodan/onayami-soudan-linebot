// LINE Bot：セッション履歴保持つき 完全安定バージョン🌸（note 31件 + 誘導付き）

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

const characterPersona = `
あなたはLINE上で相談を受ける信頼されている相談員です。

ユーザーは小学生〜高校生が多く、親や先生に言えない悩みをこっそり相談しに来ています。  
ただし、感情的な共感よりも「最小限のやり取りで、はっきり答えてほしい」というニーズが強く、  
時間制限・回数制限がある中で、最も的確なアドバイスが求められます。

あなたは以下12の専門的視点を内包していますが、それを“専門家”として名乗ることはありません。

- 🔮 占い師（直感や運命の視点）
- 🩺 医者（健康や体の変化への冷静な知識）
- 🧠 心理カウンセラー（感情・トラウマ・自己否定への理解）
- 💘 恋愛マスター（恋の駆け引き・依存・関係性の本質）
- ⚖️ 弁護士（トラブルや関係のリスクと責任）
- 🍑 性アドバイザー（性への不安や関心への適切な説明）
- 🏡 家庭支援員（親や家庭問題への配慮）
- 🎭 感情ナビゲーター（怒り・不安・混乱の整理）
- 🧘 自己肯定感コーチ（自信をなくした子の立ち直り）
- 🧭 キャリアコーチ（将来や勉強への迷いの整理）
- 📚 教育アドバイザー（学校・学業での悩み）
- 🔐 秘密キーパー（誰にも言えないことを安心して話せる相手）

---

## 🎯 応答ルール（明確な即答重視）

1. **結論を最初に伝える（YES/NO・やめた方がいい 等）**
2. **理由は短くシンプルに**
3. **選択肢やリスクがある場合は簡潔に提示**
4. 共感や寄り添い表現は最小限でOK（求められた時だけ）
5. 命令口調は避けるが、**指針ははっきり出す**
6. 回数制限を意識し、**1ターンで役立つ情報を完結させる**
7. 感情的・怒りっぽいユーザーに対しても、**冷静・丁寧な態度を崩さない**

---

## 📝 会話例（不倫相手への気持ち相談）

> それはやめた方がいい  
> どんなに本気でも、相手には守るべき家庭がある  
> あなたが一番傷つく展開になりやすいし、長く続いても幸せになれない可能性が高い  
> それでも関わりたいなら、自己責任になるよ

---

## 📝 会話例（「どうしたらいい？」と聞かれた場合）

> 状況がわからないと正確には言えないけど、  
> まず「何を一番変えたいのか」を自分の中で決めて  
> そこがブレると、どんな選択をしても後悔するから
・絵文字は🌱🌸☁️💬✨など、心が軽くなるものを1つまで使用可  

`;



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
  return noteList[index];
}

function isRecent(timestamp) {
  const now = Date.now();
  const diff = now - new Date(timestamp).getTime();
  return diff < 3 * 24 * 60 * 60 * 1000;
}

// 🌐 Renderスリープ対策
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

        let count = 0, messages = [], greeted = false;
        let lastDate = today, authenticated = false, authDate = null;

        if (session) {
          const isSameDay = session.last_date === today;
          const isRecentUpdate = isRecent(session.updated_at);

          count = isSameDay ? session.count || 0 : 0;
          messages = isRecentUpdate ? session.messages || [] : [];
          greeted = session.greeted || false;
          lastDate = session.last_date || today;
          authenticated = isSameDay ? session.authenticated || false : false;
          authDate = isSameDay ? session.auth_date || null : null;
        }

  if (userMessage === todayNote.password) {
  await supabase.from('user_sessions').upsert({
    user_id: userId,
    count,
    messages, // ← 修正ポイント
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

        if (!authenticated) {
          if (count <= 3) {
            // 通常応答（1〜4回）
          } else if (count === 4) {
            // 5回目
            if (messages.length === 0 && !greeted) {
              messages.push({ role: 'system', content: characterPersona });
              greeted = true;
            }

           messages.push({
  role: 'user',
  content: `※この返信は100トークン以内で完結させてください。話の途中で終わらず、1〜2文でわかりやすくまとめてください。\n\n${userMessage}`
})


            const chatResponse = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages,
  
});


            const assistantMessage = chatResponse.choices[0].message;
            messages.push({ role: 'assistant', content: assistantMessage.content });

            replyText = `${assistantMessage.content}\n\n明日になれば、またお話しできるよ🥰\n🌸 続けて話したい方はこちらから合言葉を入手してね！☺️\n👉 ${todayNote.url} 🔑`;
          } else {
            // 5回目以降
            replyText = `たくさんお話してくれてありがとうね☺️\n明日になれば、またお話しできるよ🥰\n🌸 続けて話したい方はこちらから合言葉を入手してね！☺️\n👉 ${todayNote.url}`;
          }
        }

        if (authenticated || count <= 3) {
          if (messages.length === 0 && !greeted) {
            messages.push({ role: 'system', content: characterPersona });
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
