import 'dotenv/config'
import express from 'express'
import { messagingApi, middleware as lineMiddleware } from '@line/bot-sdk'
import dayjs from 'dayjs'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from './supabaseClient.js'
import { QUESTIONS } from './questions.js'
import { GUIDE_TEXT, ACCEPTED_TEXT, RECEIPT_TEXT, DONE_TEXT, HOW_TO_ANSWER } from './flowTexts.js'

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
}
const client = new messagingApi.MessagingApiClient({ channelAccessToken: config.channelAccessToken })

const PORT = process.env.PORT || 3000
const BUCKET = process.env.SUPABASE_BUCKET || 'diagnostics'

const app = express()
app.use(express.json())
app.post('/webhook', lineMiddleware(config), async (req, res) => {
  const events = req.body.events
  await Promise.all(events.map(handleEvent))
  res.status(200).end()
})

/** ---------- セッション永続 ---------- **/
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
  return data
}

async function saveSession(session) {
  const payload = { ...session, updated_at: new Date().toISOString() }
  const { error } = await supabase
    .from('ld_sessions')
    .update(payload)
    .eq('user_id', session.user_id)
  if (error) throw error
}

/** ---------- メッセージ送信 ---------- **/
async function replyText(token, text, quick = null) {
  const message = { type: 'text', text }
  if (quick) message.quickReply = { items: quick }
  await client.replyMessage({ replyToken: token, messages: [message] })
}

function qItem(label, text) {
  return { type: 'action', action: { type: 'message', label, text } }
}

async function replyFlexWithDownload(token, signedUrl) {
  const bubble = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [{ type: 'text', text: '回答控え（TXT）', weight: 'bold', size: 'md' }]
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [
        { type: 'text', text: '保存期間：7日間（自動）', size: 'sm', color: '#888888' },
        { type: 'button', action: { type: 'uri', label: 'ダウンロード', uri: signedUrl } }
      ]
    }
  }
  const flex = { type: 'flex', altText: '回答控えをダウンロード', contents: bubble }
  await client.replyMessage({ replyToken: token, messages: [flex] })
}

/** ---------- Storage: TXT発行 ---------- **/
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
    const aIndex = answers[i] // 1-based index
    const aText = q?.choices?.[aIndex - 1] ?? ''
    lines.push(`Q${i + 1}: ${q?.text}`)
    lines.push(`A : ${aIndex} (${aText})`)
    lines.push('')
  }
  const content = lines.join('\n')
  const path = `answers/${userId}/${dayjs().format('YYYYMMDD_HHmmss')}_${uuidv4().slice(0,8)}.txt`

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(
    path,
    new Blob([content], { type: 'text/plain' }),
    { contentType: 'text/plain', upsert: false }
  )
  if (upErr) throw upErr

  const { data: sign, error: signErr } = await supabase
    .storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7) // 7日
  if (signErr) throw signErr

  return sign.signedUrl
}

/** ---------- イベントハンドラ ---------- **/
async function handleEvent(event) {
  if (event.type === 'follow') {
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: `ご登録ありがとうございます🌸\n${GUIDE_TEXT}` }]
    })
  }
  if (event.type !== 'message' || event.message.type !== 'text') return
  const text = (event.message.text || '').trim()
  const userId = event.source.userId
  const replyToken = event.replyToken

  let s = await getSession(userId)

  // 共通コマンド
  if (text === 'キャンセル') {
    s = { ...s, state: 'START', gender: null, age: null, q_index: 0, answers: [] }
    await saveSession(s)
    return replyText(replyToken, 'キャンセルしました。いつでも再開できます\n\n' + GUIDE_TEXT)
  }

  switch (s.state) {
    case 'START': {
      await replyText(replyToken, GUIDE_TEXT)
      s.state = 'AWAIT_ACCEPT'
      await saveSession(s)
      return
    }

    case 'AWAIT_ACCEPT': {
      if (text === '承諾') {
        s.state = 'PROFILE_GENDER'
        await saveSession(s)
        return replyText(replyToken, ACCEPTED_TEXT, {
          items: [qItem('女性', '女性'), qItem('男性', '男性'), qItem('その他', 'その他')]
        })
      }
      return replyText(replyToken, '次に進む場合は「承諾」と入力してね🌸')
    }

    case 'PROFILE_GENDER': {
      if (!['女性', '男性', 'その他'].includes(text)) {
        return replyText(replyToken, '性別を「女性／男性／その他」から選んでください', {
          items: [qItem('女性', '女性'), qItem('男性', '男性'), qItem('その他', 'その他')]
        })
      }
      s.gender = text
      s.state = 'PROFILE_AGE'
      await saveSession(s)
      return replyText(replyToken, '年齢を数字で入力してください（例：29）')
    }

    case 'PROFILE_AGE': {
      const ageNum = Number(text)
      if (!Number.isInteger(ageNum) || ageNum <= 0 || ageNum > 120) {
        return replyText(replyToken, '年齢は「半角数字」で入力してください（例：29）')
      }
      s.age = ageNum
      s.state = 'QUESTIONS'
      s.q_index = 0
      s.answers = []
      await saveSession(s)
      const q = QUESTIONS[0]
      return replyText(replyToken, HOW_TO_ANSWER(q, 1, QUESTIONS.length))
    }

    case 'QUESTIONS': {
      const idx = s.q_index
      const q = QUESTIONS[idx]
      const n = Number(text)
      if (!Number.isInteger(n) || n < 1 || n > q.choices.length) {
        return replyText(replyToken, `1〜${q.choices.length}の数字で回答してね`)
      }
      s.answers.push(n) // 1-based
      s.q_index = idx + 1

      if (s.q_index < QUESTIONS.length) {
        await saveSession(s)
        const nextQ = QUESTIONS[s.q_index]
        return replyText(replyToken, HOW_TO_ANSWER(nextQ, s.q_index + 1, QUESTIONS.length))
      }

      // 完了処理
      await saveSession(s)
      try {
        const signedUrl = await uploadAnswersTxt(userId, s.gender, s.age, s.answers)
        await replyFlexWithDownload(replyToken, signedUrl)
        await client.pushMessage({ to: userId, messages: [{ type: 'text', text: DONE_TEXT }] })
      } catch (e) {
        console.error(e)
        await replyText(replyToken, '回答控えの発行でエラーが起きました。時間をおいて再試行してください')
      }
      s.state = 'DONE'
      await saveSession(s)
      return
    }

    case 'DONE': {
      if (text === '再診' || text === 'もう一度') {
        s = { ...s, state: 'START', gender: null, age: null, q_index: 0, answers: [] }
        await saveSession(s)
        return replyText(replyToken, '新しく始めますね🌸\n' + GUIDE_TEXT)
      }
      return replyText(replyToken, '診断は完了しています。再診する場合は「再診」と入力してね')
    }

    default: {
      s.state = 'START'
      await saveSession(s)
      return replyText(replyToken, GUIDE_TEXT)
    }
  }
}

/** ---------- 起動 ---------- **/
app.get('/', (_req, res) => res.send('love-diagnosis-bot running'))
app.listen(PORT, () => console.log(`listening on ${PORT}`))

