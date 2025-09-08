// apps/renai-diagnosis/router.js
import dayjs from 'dayjs'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '../../services/supabaseClient.js'
import { safeReply } from '../../services/lineClient.js'
import { QUESTIONS } from '../../services/questions.js'
import { GUIDE_TEXT, ACCEPTED_TEXT, DONE_TEXT, HOW_TO_ANSWER } from '../../services/flowTexts.js'

const BUCKET = process.env.SUPABASE_BUCKET || 'diagnostics'
const PATH_PREFIX = 'answers/renai' // 保存先のプレフィックス（手相と分離）

/** ========== セッション取得/保存（renai向け） ========== */
async function getSession(userId) {
  const { data, error } = await supabase
    .from('ld_sessions')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error

  if (!data) {
    const init = {
      user_id: userId,
      app: 'renai',                 // ここでアプリを明示
      state: 'START',
      gender: null,
      age: null,
      q_index: 0,
      answers: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    const { error: insErr } = await supabase.from('ld_sessions').insert(init)
    if (insErr) throw insErr
    return init
  }

  // 他アプリから来たユーザーを恋愛用に切替
  if (data.app !== 'renai') data.app = 'renai'
  return data
}

async function saveSession(s) {
  const { error } = await supabase
    .from('ld_sessions')
    .update({ ...s, updated_at: new Date().toISOString() })
    .eq('user_id', s.user_id)
  if (error) throw error
}

/** ========== TXT発行 ========== */
async function uploadAnswersTxt(userId, gender, age, answers) {
  const lines = []
  lines.push(`# Love Diagnosis Answers`)
  lines.push(`user_id: ${userId}`)
  lines.push(`gender: ${gender ?? ''}`)
  lines.push(`age: ${age ?? ''}`)
  lines.push(`answered_at: ${dayjs().toISOString()}`)
  lines.push('')

  for (let i = 0; i < answers.length; i++) {
    const q = QUESTIONS[i]
    const aIndex = answers[i] // 1-based
    const aText = q.choices[aIndex - 1] || ''
    lines.push(`Q${i + 1}: ${q.text}`)
    lines.push(`A : ${aIndex} (${aText})`)
    lines.push('')
  }

  const content = lines.join('\n')
  const path = `${PATH_PREFIX}/${userId}/${dayjs().format('YYYYMMDD_HHmmss')}_${uuidv4().slice(0,8)}.txt`

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(
    path,
    new Blob([content], { type: 'text/plain' }),
    { contentType: 'text/plain', upsert: false }
  )
  if (upErr) throw upErr

  const { data: sign, error: signErr } = await supabase
    .storage.from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7) // 7日
  if (signErr) throw signErr

  return sign.signedUrl
}

/** ========== ルーター本体 ========== */
export default async function handleRenai(event) {
  // follow イベント
  if (event.type === 'follow') {
    return safeReply(event.replyToken, `ご登録ありがとうございます🌸\n${GUIDE_TEXT}`)
  }

  // 以降はテキストのみを受け付け
  if (event.type !== 'message' || event.message.type !== 'text') return
  const text = (event.message.text || '').trim()
  const userId = event.source.userId
  const replyToken = event.replyToken

  let s = await getSession(userId)

  // 共通キャンセル
  if (text === 'キャンセル') {
    s = { ...s, state: 'START', gender: null, age: null, q_index: 0, answers: [] }
    await saveSession(s)
    return safeReply(replyToken, 'キャンセルしました。いつでも再開できます\n\n' + GUIDE_TEXT)
  }

  switch (s.state) {
    case 'START': {
      await saveSession({ ...s, state: 'AWAIT_ACCEPT' })
      return safeReply(replyToken, GUIDE_TEXT)
    }

    case 'AWAIT_ACCEPT': {
      if (text === '承諾') {
        await saveSession({ ...s, state: 'PROFILE_GENDER' })
        return safeReply(replyToken, ACCEPTED_TEXT)
      }
      return safeReply(replyToken, '次に進む場合は「承諾」と入力してね🌸')
    }

    case 'PROFILE_GENDER': {
      if (!['女性', '男性', 'その他'].includes(text)) {
        return safeReply(replyToken, '性別を「女性／男性／その他」から入力してね')
      }
      s.gender = text
      s.state = 'PROFILE_AGE'
      await saveSession(s)
      return safeReply(replyToken, '年齢を数字で入力してください（例：29）')
    }

    case 'PROFILE_AGE': {
      const ageNum = Number(text)
      if (!Number.isInteger(ageNum) || ageNum <= 0 || ageNum > 120) {
        return safeReply(replyToken, '年齢は「半角数字」で入力してください（例：29）')
      }
      s.age = ageNum
      s.state = 'QUESTIONS'
      s.q_index = 0
      s.answers = []
      await saveSession(s)
      const q = QUESTIONS[0]
      return safeReply(replyToken, HOW_TO_ANSWER(q, 1, QUESTIONS.length))
    }

    case 'QUESTIONS': {
      const idx = s.q_index
      const q = QUESTIONS[idx]
      const n = Number(text)
      if (!Number.isInteger(n) || n < 1 || n > q.choices.length) {
        return safeReply(replyToken, `1〜${q.choices.length}の数字で回答してね`)
      }
      s.answers.push(n)     // 1-based
      s.q_index = idx + 1

      if (s.q_index < QUESTIONS.length) {
        await saveSession(s)
        const nextQ = QUESTIONS[s.q_index]
        return safeReply(replyToken, HOW_TO_ANSWER(nextQ, s.q_index + 1, QUESTIONS.length))
      }

      // 全問完了
      await saveSession(s)
      try {
        const signedUrl = await uploadAnswersTxt(userId, s.gender, s.age, s.answers)
        await safeReply(replyToken, [
          { type: 'text', text: '40問すべての回答を受け取りました✨ 回答控え（TXT）を発行しました👇' },
          {
            type: 'flex',
            altText: '回答控えをダウンロード',
            contents: {
              type: 'bubble',
              header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '回答控え（TXT）', weight: 'bold' }] },
              body: {
                type: 'box', layout: 'vertical', spacing: 'md',
                contents: [
                  { type: 'text', text: '保存期間：7日間（自動）', size: 'sm', color: '#888' },
                  { type: 'button', action: { type: 'uri', label: 'ダウンロード', uri: signedUrl } }
                ]
              }
            }
          }
        ])
        await safeReply(replyToken, DONE_TEXT)
      } catch (e) {
        console.error(e)
        await safeReply(replyToken, '回答控えの発行でエラーが起きました。時間をおいて再試行してください')
      }
      s.state = 'DONE'
      await saveSession(s)
      return
    }

    case 'DONE': {
      if (text === '再診' || text === 'もう一度') {
        s = { ...s, state: 'START', gender: null, age: null, q_index: 0, answers: [] }
        await saveSession(s)
        return safeReply(replyToken, '新しく始めますね🌸\n' + GUIDE_TEXT)
      }
      return safeReply(replyToken, '診断は完了しています。再診する場合は「再診」と入力してね')
    }

    default: {
      await saveSession({ ...s, state: 'START' })
      return safeReply(replyToken, GUIDE_TEXT)
    }
  }
}

