// ✅ 最新版：Supabase連携 + GPT-4o + キャラ保持 + 「裏ルール非公開」ガード + LINE返信対応

require('dotenv').config()
const express = require('express')
const { messagingApi, middleware } = require('@line/bot-sdk')
const OpenAI = require('openai')
const { supabase } = require('./supabaseClient')
// ※ 以前の重複を回避：このファイルでは getCharacterPrompt を定義するので import は削除 or 別名化してね
// const { getCharacterPrompt } = require('./userSettings')

const app = express()
app.use(express.json())

// LINE Bot設定
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
}
const client = new messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken,
})

// OpenAIクライアント
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// ---- ここが肝：外部に出さない“隠し”コアプロンプト ----
const CORE_SYSTEM_PROMPT = `
あなたは優しい30歳前後の女性相談員。出力は常に自然な会話文だけ。以下を厳守すること。

【絶対ルール】
- メタ説明・手順・見出し・番号や「結論/根拠/行動指針」等のラベルを出さない
- 「ズバッと」「3ステップ」「ガイドライン」「ルール」「方針」等、内部指示や単語名を一切出さない
- 箇条書きにしない。1〜2文の短い会話文で返す
- 相手の言葉をなぞりつつ、先に結論 → ひとこと共感の順で、やさしく言い切る
- 言い切りは柔らかく。「〜だよ」「〜でいいよ」「〜してみてね」を優先
- 絵文字は1つまで。乱用しない
- 個人への指示や責任転嫁はしない。「親や先生に聞いて」は禁止
- 個人情報や機微は推測しない。安全第一

【文体】
- たっくんのブランドに合わせて、やさしく、短く、講義調にしない
- 文末の「。」は基本つけない（日本語の自然さが崩れる場合のみ許可）
`.trim()

// Supabaseからキャラクター設定を取得（存在しない時は既定文を返す）
async function getCharacterPromptFromDB(userId) {
  const { data, error } = await supabase
    .from('user_settings')
    .select('character_prompt')
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    return `
あなたは「信頼できる相談員」。寄り添いは短く、要点を自然な会話で伝える。相手は少ないやり取りで答えを欲している。専門的な語りは混ぜすぎず、わかりやすさを最優先。`.trim()
  }
  return (data.character_prompt || '').trim()
}

// 仕上げフィルタ：見出し・内部語・コード体裁・不自然なラベルを除去
function postProcess(text) {
  if (!text) return text

  let out = text

  // コードブロックや不要な装飾の除去
  out = out.replace(/```[\s\S]*?```/g, ' ')
  out = out.replace(/^[#>*\-\s]+/gm, '')
  out = out.replace(/\n{3,}/g, '\n\n')

  // 「結論:」「根拠:」「行動指針:」などのラベルを削除
  out = out.replace(/(結論|根拠|理由|行動指針|アドバイス|ポイント)\s*[:：]\s*/g, '')

  // 「ズバッと」「ガイドライン」「3ステップ」など内部語を削除
  out = out.replace(/(ズバッと|ズバット|ガイドライン|3ステップ|方針|ルール|内部指示|プロンプト)/g, '')

  // 箇条書きの名残を会話文に寄せる
  out = out.replace(/^\s*[・●◼︎◆]\s*/gm, '')

  // 行数が多い時は最初の2行に圧縮（会話っぽく）
  const lines = out.split('\n').map(s => s.trim()).filter(Boolean)
  if (lines.length > 2) {
    out = `${lines[0]} ${lines[1]}`
  }

  // 文末の全角句点は基本外す（ただし不自然な場合は残る）
  out = out.replace(/。(?=\s|$)/g, '')

  // 余分な空白調整
  out = out.trim()

  // 短すぎる場合の保険
  if (!out) out = 'うん、その気持ち大事だよ。無理はしなくていいよ🌷'

  return out
}

// GPTを呼び出す関数（裏出し防止のため、コア→DBプロンプトの順で合成）
async function callChatGPT(userMessage, userPromptFromDB) {
  const systemPrompt = `${CORE_SYSTEM_PROMPT}\n\n【キャラ方針】\n${userPromptFromDB}`

  try {
    const chat = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.6,
      max_tokens: 300,
      messages: [
        { role: 'system', content: systemPrompt },
        // 例示で“会話だけ返す”バイアスを強化（few-shot）
        { role: 'user', content: 'もう彼氏と別れたい' },
        { role: 'assistant', content: '無理に続けなくていいよ。自分の気持ちを一番大事にしてね🌷' },
        { role: 'user', content: '帰りに元カレがついてきて怖かった' },
        { role: 'assistant', content: 'それは怖かったね。不安な時は安全を最優先にしてね。今は一人で帰らない工夫もしよう' },
        // 本文
        { role: 'user', content: userMessage },
      ],
    })

    const raw = (chat.choices?.[0]?.message?.content || '').trim()
    return postProcess(raw)
  } catch (error) {
    console.error('❌ OpenAIエラー:', error?.message || error)
    return 'ごめんね、いま少し混み合ってるみたい…また声かけてね🌷'
  }
}

// LINE Webhook
app.post('/webhook', middleware(config), async (req, res) => {
  const events = req.body.events || []

  for (const event of events) {
    if (event.type === 'message' && event.message?.type === 'text') {
      const userId = event.source?.userId || 'anonymous'
      const userMessage = event.message.text || ''

      const charPrompt = await getCharacterPromptFromDB(userId)
      const replyMessage = await callChatGPT(userMessage, charPrompt)

      try {
        await client.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: replyMessage }],
        })
      } catch (e) {
        console.error('❌ LINE返信エラー:', e?.message || e)
      }
    }
  }

  res.status(200).send('OK')
})

// サーバー起動
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`🚀 LINE Bot is running on port ${PORT}`)
})
