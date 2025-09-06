// server.js
// ✅ 完全版：Supabase連携 + GPT-4o（4o→4o-mini自動フォールバック）+ 断定アクション型 + 裏ルール非公開ガード + LINE返信
require('dotenv').config()
const express = require('express')
const { messagingApi, middleware } = require('@line/bot-sdk')
const OpenAI = require('openai')
const { supabase } = require('./supabaseClient') // 既存のSupabaseクライアント
const app = express()
app.use(express.json())

// --- LINE設定 ---
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
}
const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: lineConfig.channelAccessToken,
})

// --- OpenAI ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// --- 裏にだけ効く“出力ルール”コア（メタ語を表に出さない） ---
const CORE_SYSTEM_PROMPT = `
出力は日本語の会話文のみ 最大2文
1文目＝結論を断定 2文目＝具体アクション（名詞＋動詞＋期限/条件）
弱い共感語・回避語は禁止（例：大丈夫／怖かったね／つらいよね／不安だよね／寄り添う／様子を見る／考えてみてね／無理しないでね）
メタ語は禁止（結論／根拠／行動指針／ガイドライン／ステップ／方針 等）
箇条書き・見出し・番号・装飾・引用・コードブロックを出さない
推測しない／安全優先／断定はやわらかい命令形（〜しよう／〜を取る）で
文末の「。」は基本外す（不自然な場合のみ許可）
`.trim()

// --- DBから“12カテゴリ方針”を取得（なければ既定値） ---
async function getCharacterPromptFromDB(userId) {
  const { data } = await supabase
    .from('user_settings')
    .select('character_prompt')
    .eq('user_id', userId)
    .single()

  if (data?.character_prompt?.trim()) return data.character_prompt.trim()

  // 既定：12カテゴリ（必要ならそのままDBに保存して差し替えOK）
  return `
あなたは、以下12カテゴリの知識を統合した「信頼できる相談員」です
🔮 占い視点（直感・相性・運命）
🩺 医学的知識（体調や変化への対応）
🧠 心理カウンセラー（感情・自己肯定感・トラウマ）
💘 恋愛アドバイス（駆け引きと本音の見抜き）
⚖️ 法律的視点（人間関係やトラブルの知識）
🍑 性アドバイス（性への不安や行動の理解）
🏡 家庭支援視点（親・家族・家庭環境）
🎓 教育アドバイス（学校・進路・不登校）
💬 感情ナビゲーション（気持ちの言語化）
🪞 自己肯定感コーチ（自信・強み）
👣 キャリア視点（夢・進路・働き方）
🫧 秘密キーパー（誰にも言えない話への安心）
`.trim()
}

// --- 出力フィルタ：裏語・寄り添い語・見出し等を除去し、2文に制限 ---
function postProcess(text) {
  let out = String(text || '')

  // コード/引用/装飾除去
  out = out.replace(/```[\s\S]*?```/g, ' ')
  out = out.replace(/^>.*$/gm, ' ')
  out = out.replace(/^[#*\-・●>◼◆\s]+/gm, '')
  out = out.replace(/\n{2,}/g, '\n')

  // メタ語・ラベル除去
  out = out.replace(/(結論|根拠|理由|行動指針|ポイント|ガイドライン|ステップ|方針)\s*[:：]?\s*/g, '')

  // 内部ワード除去
  out = out.replace(/(ズバッと|ズバット|内部指示|プロンプト|3ステップ|テンプレ)/g, '')

  // 弱い共感/回避語除去
  out = out.replace(/(大丈夫|怖かったね|つらいよね|不安だよね|寄り添(う|って)|様子を見(よう|ましょう)?|考えてみてね|無理しないでね)/g, '')

  // 余白整形
  out = out.split('\n').map(s => s.trim()).filter(Boolean).join(' ')
  out = out.replace(/\s{2,}/g, ' ').trim()

  // 2文に制限（。.!?！？ で区切る）
  const sentences = out.split(/(?<=[。.!?！？])/).map(s => s.trim()).filter(Boolean)
  out = [sentences[0] || '', sentences[1] || ''].filter(Boolean).join(' ')
  out = out.replace(/。(?=\s|$)/g, '') // 文末の「。」は基本外す

  if (!out) out = '方針を決めて動こう 次の一手を取る'
  return out
}

// --- OpenAI呼び出し（4o→4o-mini フォールバック付き） ---
async function callChat(userMessage, systemPrompt) {
  const tryOnce = async (model) => {
    const chat = await openai.chat.completions.create({
      model,
      temperature: 0.6,
      max_tokens: 280,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    })
    return (chat.choices?.[0]?.message?.content || '').trim()
  }

  try {
    const raw = await tryOnce('gpt-4o')
    return postProcess(raw)
  } catch (e1) {
    console.error('OpenAI 4o error:', e1?.message || e1)
    try {
      const raw = await tryOnce('gpt-4o-mini')
      return postProcess(raw)
    } catch (e2) {
      console.error('OpenAI 4o-mini error:', e2?.message || e2)
      return '処理を中断する 次の一手を自分で決めて動く'
    }
  }
}

// --- LINE Webhook ---
app.post('/webhook', middleware(lineConfig), async (req, res) => {
  const events = req.body?.events || []
  for (const event of events) {
    if (event.type === 'message' && event.message?.type === 'text') {
      const userId = event.source?.userId || 'anonymous'
      const userMessage = event.message.text || ''

      // システムプロンプト合成（ルール → 12カテゴリ）
      const charPrompt = await getCharacterPromptFromDB(userId)
      const systemPrompt = `${CORE_SYSTEM_PROMPT}\n\n${charPrompt}`

      const replyText = await callChat(userMessage, systemPrompt)

      try {
        await lineClient.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: replyText }],
        })
      } catch (err) {
        console.error('LINE reply error:', err?.message || err)
        // 失敗しても200は返す（リトライ防止）
      }
    }
  }
  res.status(200).send('OK')
})

// --- 起動 ---
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`🚀 LINE Bot is running on port ${PORT}`)
})
