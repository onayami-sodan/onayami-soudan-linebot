import 'dotenv/config'
import OpenAI from 'openai'

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// ===== 出力後処理 =====
function limitEmojis(text, max = 2) {
  if (!text) return ''
  const all = Array.from(text)
  const result = []
  let count = 0
  for (const ch of all) {
    const isEmoji = /\p{Extended_Pictographic}/u.test(ch)
    if (isEmoji) {
      if (count < max) {
        result.push(ch)
        count++
      }
    } else {
      result.push(ch)
    }
  }
  return result.join('')
}

export function sanitize(text, allowPepTalk = false) {
  if (!text) return ''
  let out = String(text || '').trim()

  // 句点 → 改行
  out = out.replace(/。/g, '\n')

  // 見出し語・締めフレーズを削除
  const killPhrases = [
    'ズバッと結論','結論','理由','根拠','行動指針','行動提案','要点','まとめ','総括',
    '今回の相談はここまで','友達としては以上です','本件は以上','以上です'
  ]
  for (const w of killPhrases) {
    const head = new RegExp(
      `^[\\s\\-＊*●◎◉■□◆◇👉➡▶▷・:：\\[\\]()【】]*${w}[\\s　]*[:：]?[\\s　]*`,
      'gim'
    )
    out = out.replace(head, '')
    const mid = new RegExp(`[\\s　]*${w}[\\s　]*[:：]?`, 'g')
    out = out.replace(mid, '')
  }

  // 気休め削除（重症時は残す設定も可能）
  if (!allowPepTalk) {
    const pepTalk = [
      '呼吸を整え','深呼吸','落ち着こう','落ち着くよ','大丈夫','お水を飲んで',
      '休みましょう','一旦休んで','無理しないで','リラックスして'
    ]
    for (const w of pepTalk) out = out.replace(new RegExp(w, 'g'), '')
  }

  // 空行・記号整理
  out = out.replace(/^[-=‐―—–＿＿\s]+$/gm, '')
  out = out.replace(/\n{3,}/g, '\n\n')
  out = out.replace(/[ \t]+$/gm, '').replace(/[\u3000 ]+\n/g, '\n').trim()

  // 3行構成に切り詰め
  const lines = out.split('\n').map(s => s.trim()).filter(Boolean)
  out = lines.slice(0, 3).join('\n')

  // 希望フレーズ「居ると思う」を強制調整
  if (out.split('\n').length === 3 && !out.endsWith('居ると思う')) {
    out = out.replace(/居る$/, '居ると思う')
  }

  // 絵文字を制限
  out = limitEmojis(out, 2)

  return out
}

// ===== 重症判定 =====
const HEAVY_WORDS = [
  '死にたい','消えたい','自傷','虐待','DV','妊娠','中絶','いじめ','自殺',
  '性的','強制','暴力','警察','ストーカー',
  '恋愛','相談','片思い','失恋','浮気','離婚','つらい','しんどい','障害'
]

function containsHeavyWord(text) {
  if (!text) return false
  return HEAVY_WORDS.some(w => text.includes(w))
}

// ===== system プロンプト =====
const BASE_SYSTEM_PROMPT = `
あなたは信頼できる相談員
返答は必ず3行構成
1行目＝厳しくはっきりした結論
2行目＝短い理由
3行目＝優しさを込めた一歩 ただし最後は「居ると思う」で締める
句点は使わない 改行で区切る
絵文字は0〜2個まで
慰めや気休めは禁止
リンク誘導や宣伝はしない
`.trim()

const HEAVY_SYSTEM_PROMPT = `
あなたは信頼できる相談員（センシティブ対応）
返答は必ず3行構成
最初に現状を確認する一言
次に具体的な安全確保や行動を一つ
最後に希望を込めるが「居ると思う」で締める
慰めや気休めは禁止 公的窓口が必要なら案内
句点は使わない 改行で区切る
`.trim()

// ===== モデル選択 =====
function shouldUse4o(userText = '') {
  const len = String(userText || '').length
  return len >= 140 || containsHeavyWord(userText)
}

// ===== Chat関数 =====
export async function aiChat(messagesOrText, opts = {}) {
  const {
    maxTokens = 360,
    temperature = 0.4,
    modelHint,
  } = opts

  const userMsg = Array.isArray(messagesOrText)
    ? (messagesOrText.find(m => m.role === 'user')?.content ?? '')
    : String(messagesOrText || '')

  const baseMessages = Array.isArray(messagesOrText)
    ? messagesOrText
    : [{ role: 'user', content: userMsg }]

  const isHeavy = containsHeavyWord(userMsg)

  let messages = baseMessages[0]?.role === 'system'
    ? baseMessages
    : [{ role: 'system', content: BASE_SYSTEM_PROMPT }, ...baseMessages]

  if (isHeavy) {
    messages = [{ role: 'system', content: HEAVY_SYSTEM_PROMPT }, ...baseMessages]
  }

  const prefer4o = shouldUse4o(userMsg)
  const order = [
    modelHint || (prefer4o ? 'gpt-4o' : 'gpt-4o-mini'),
    prefer4o ? 'gpt-4o-mini' : 'gpt-4o',
  ]

  async function tryOnce(model) {
    const res = await openai.chat.completions.create({
      model,
      temperature: isHeavy ? 0.3 : temperature,
      max_tokens: isHeavy ? Math.max(maxTokens, 800) : maxTokens,
      messages,
      frequency_penalty: 0.3,
      presence_penalty: 0.0,
    })
    const raw = (res.choices?.[0]?.message?.content || '').trim()
    const cleaned = sanitize(raw, isHeavy)
    if (!cleaned) throw new Error('empty-response')
    return cleaned
  }

  try {
    const text = await tryOnce(order[0])
    return { ok: true, text }
  } catch (e1) {
    console.error('[aiChat first ERROR]', e1?.message || e1)
    try {
      const text = await tryOnce(order[1])
      return { ok: true, text }
    } catch (e2) {
      console.error('[aiChat second ERROR]', e2?.message || e2)
      if (isHeavy) {
        return {
          ok: false,
          text: [
            '応答に失敗した',
            '必要ならすぐに最寄りの医療機関や相談窓口に連絡して',
            '危険を感じたら警察や救急に連絡を'
          ].join('\n')
        }
      }
      return {
        ok: false,
        text: '応答に失敗した\n通信かサーバ障害\n同じメッセージをもう一度送って'
      }
    }
  }
}

export default aiChat
