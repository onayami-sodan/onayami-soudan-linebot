// callGPT.js（ESM完全版）
// - ズバッと短答テンプレを system プロンプトで強制
// - 絵文字は 1〜2 個までに自動制限（後処理）
// - gpt-4o-mini 優先、長文/重症ワード/失敗時は gpt-4o へ自動切替
// - aiRouter からは `import { aiChat } from './callGPT.js'` で利用

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
    // おおまかな絵文字判定（サロゲートペア/記号をざっくり抑制）
    const isEmoji = /\p{Extended_Pictographic}/u.test(ch)
    if (isEmoji) {
      if (count < max) {
        result.push(ch)
        count++
      }
      // 超過分は捨てる
    } else {
      result.push(ch)
    }
  }
  return result.join('')
}

export function sanitize(text) {
  if (!text) return ''
  let out = text.trim()

  // 余計なラベルを除去
  out = out.replace(/^\s*[-*●◎◉■□◆◇]?\s*(結論|根拠|行動(?:指針|提案)|要点)\s*[:：]\s*/gim, '')
  out = out.replace(/ズバッと結論を言うと[:：]?\s*/g, '')

  // 句点禁止 → 改行に変換
  out = out.replace(/。/g, '\n')
  out = out.replace(/\n{3,}/g, '\n\n').trim()

  // 末尾の無意味な語尾や記号の連続を整理
  out = out.replace(/[ \t]+$/gm, '').replace(/[\u3000 ]+\n/g, '\n')

  // 絵文字を最大2個まで
  out = limitEmojis(out, 2)

  return out
}

// ===== ルーティング判定 =====
function shouldUse4o(userText = '') {
  const t = String(userText || '')
  const len = t.length
  const heavyWords = [
    '死にたい', '消えたい', '自傷', '虐待', 'DV', '妊娠', '中絶', 'いじめ', '自殺',
    '性的', '強制', '暴力', '警察', 'ストーカー'
  ]
  const hit = heavyWords.some(w => t.includes(w))
  return len >= 140 || hit
}

// ===== system プロンプト（ズバッと短答テンプレ＋絵文字最小） =====
const SYSTEM_PROMPT = `
あなたは信頼できる相談員
返答は「ズバッと結論→短い根拠→行動指針」の3行構成にする
句点「。」は使わない 改行で区切る
絵文字は1〜2個までに抑える（基本は無し）キラキラ系の多用は禁止
リンク誘導はしない 相談に集中
口調は落ち着いて丁寧 断定は明確に
`.trim()

/**
 * Chat 補助（mini優先→必要時4o）
 * @param {Array|String} messagesOrText - messages配列 or ユーザテキスト
 * @param {Object} opts
 * @param {number} [opts.maxTokens=360]
 * @param {number} [opts.temperature=0.4]
 * @param {string} [opts.modelHint]
 * @returns {Promise<{ok:boolean, text:string}>}
 */
export async function aiChat(messagesOrText, opts = {}) {
  const {
    maxTokens = 360,
    temperature = 0.4,
    modelHint,
  } = opts

  // messages を正規化して system を先頭に注入
  const userMsg = Array.isArray(messagesOrText)
    ? (messagesOrText.find(m => m.role === 'user')?.content ?? '')
    : String(messagesOrText || '')

  const baseMessages = Array.isArray(messagesOrText)
    ? messagesOrText
    : [{ role: 'user', content: userMsg }]

  // 既に system が入っていなければ先頭に付与
  const messages = baseMessages[0]?.role === 'system'
    ? baseMessages
    : [{ role: 'system', content: SYSTEM_PROMPT }, ...baseMessages]

  // モデル選択
  const prefer4o = shouldUse4o(userMsg)
  const order = [
    modelHint || (prefer4o ? 'gpt-4o' : 'gpt-4o-mini'),
    prefer4o ? 'gpt-4o-mini' : 'gpt-4o',
  ]

  async function tryOnce(model) {
    const res = await openai.chat.completions.create({
      model,
      temperature,
      max_tokens: maxTokens,
      messages,
      // 反復を抑える
      frequency_penalty: 0.3,
      presence_penalty: 0.0,
    })
    const raw = (res.choices?.[0]?.message?.content || '').trim()
    const cleaned = sanitize(raw)
    if (!cleaned) throw new Error('empty-response')
    return cleaned
  }

  // 1回目 → 失敗なら 2回目（簡易リトライ）
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
      // エラー時も絵文字最小・句点無し
      return {
        ok: false,
        text: '今は呼吸を整えよう 深く3回吸って吐く それだけで少し落ち着くよ'
      }
    }
  }
}

export default aiChat
