// server.js
// ✅ LINE × OpenAI × Supabase 完全版（断定アクション型・裏ルール非公開）

require('dotenv').config()
const express = require('express')
const { messagingApi, middleware } = require('@line/bot-sdk')
const OpenAI = require('openai')
const { supabase } = require('./supabaseClient')

const app = express()
app.use(express.json())

// --- LINE ---
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
}
const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: lineConfig.channelAccessToken,
})

// --- OpenAI ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// --- 出力ルール（裏だけで効くコア） ---
const CORE_SYSTEM_PROMPT = `
出力は日本語の会話文のみ 最大2文
1文目＝結論を断定 2文目＝具体アクション（名詞＋動詞＋期限/条件）
占い・相性・星座・タロット等は助言として扱ってよい（簡潔に）
医療・健康は一般情報とセルフケアは扱ってよいが診断断定と処方はしない
弱い共感語・回避語は禁止（大丈夫/怖かったね/つらいよね/不安だよね/寄り添う/様子を見る/考えてみてね/無理しないでね）
メタ語は禁止（結論/根拠/行動指針/ガイドライン/ステップ/方針 等）
箇条書き・見出し・番号・装飾・引用・コードブロックを出さない
推測しすぎない 安全優先 断定はやわらかい命令形（〜しよう/〜を取る）
文末の「。」は基本外す
`.trim()

// --- 12カテゴリ（DBから取得。なければ既定値） ---
async function getCharacterPromptFromDB(userId) {
  const { data } = await supabase
    .from('user_settings')
    .select('character_prompt')
    .eq('user_id', userId)
    .single()

  if (data?.character_prompt?.trim()) return data.character_prompt.trim()

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

// --- トピック検出（占い/医療で軽いfew-shotを注入） ---
const reFortune = /(占い|相性|タロット|星座|四柱推命|数秘|手相|運勢)/i
const reMedical = /(起立性調節障害|OD|自律神経|頭痛|発熱|咳|腹痛|めまい|アレルギー|喘息|睡眠|不眠|PMS|月経|更年期|メンタル|鬱|不安|パニック|熱中症|脱水)/i

function seedFewShotByTopic(userMessage) {
  if (reFortune.test(userMessage)) {
    return [
      { role: 'user', content: '相性占いして' },
      { role: 'assistant', content: '今は温度差を見極めよう 次は昼の短時間デートでテンポを確認する' },
    ]
  }
  if (reMedical.test(userMessage)) {
    return [
      { role: 'user', content: '起立性調節障害で困ってる' },
      { role: 'assistant', content: '朝の無理は切る 時差登校の許可と水分・塩分補給を今日から徹底する' },
    ]
  }
  return []
}

// --- 出力フィルタ（裏語・寄り添い語を除去し2文に制限） ---
function postProcess(text) {
  let out = String(text || '')

  // 装飾・コード・引用の除去
  out = out.replace(/```[\s\S]*?```/g, ' ')
  out = out.replace(/^>.*$/gm, ' ')
  out = out.replace(/^[#*\-・●>◼◆\s]+/gm, '')
  out = out.replace(/\n{2,}/g, '\n')

  // メタ語・ラベルの除去
  out = out.replace(/(結論|根拠|理由|行動指針|ポイント|ガイドライン|ステップ|方針)\s*[:：]?\s*/g, '')

  // 内部ワードの除去
  out = out.replace(/(ズバッと|ズバット|内部指示|プロンプト|3ステップ|テンプレ|ルール)/g, '')

  // 弱い共感/回避語の除去（医師・相談の文言は残す）
  out = out.replace(/(大丈夫|怖かったね|つらいよね|不安だよね|寄り添(う|って)|様子を見(よう|ましょう)?|考えてみてね|無理しないでね)/g, '')

  // 行結合して余白調整
  out = out.split('\n').map(s => s.trim()).filter(Boolean).join(' ')
  out = out.replace(/\s{2,}/g, ' ').trim()

  // 2文に制限
  const sentences = out.split(/(?<=[。.!?！？])/).map(s => s.trim()).filter(Boolean)
  out = [sentences[0] || '', sentences[1] || ''].filter(Boolean).join(' ')
  out = out.replace(/。(?=\s|$)/g, '')

  if (!out) out = '方針を決めて動こう 次の一手を取る'
  return out
}

// --- OpenAI呼び出し（4o → 4o-mini フォールバック） ---
async function callChat(userMessage, systemPrompt) {
  const shots = seedFewShotByTopic(userMessage)
  const messages = [
    { role: 'system', content: systemPrompt },
    ...shots,
    { role: 'user', content: userMessage },
  ]

  const tryOnce = async (model) => {
    const chat = await openai.chat.completions.create({
      model,
      temperature: 0.6,
      max_tokens: 280,
      messages,
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
