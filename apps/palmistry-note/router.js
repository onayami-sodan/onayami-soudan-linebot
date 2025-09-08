import { safeReply, line } from '../../services/lineClient.js'
import { supabase } from '../../services/supabaseClient.js'

const BUCKET = process.env.SUPABASE_BUCKET || 'line-uploads'
const TABLE = 'palm_sessions'

const GUIDE_TEXT = `✋ 手相診断（note版）のご案内

🔹 左手 … 生まれ持った性質や過去の傾向
🔹 右手 … 努力や経験で変わった現在と未来の流れ

📌 料金：3,000円（税込）
📌 内容：30項目の詳細レポート（3,000〜5,000文字）
📌 納品：note 有料記事URL
📌 納期：受付順で48時間以内

診断を受ける場合は「承諾」と入力してください🌿`

const HOW_TO_SHOOT = (label) => 
`了解しました😊
【${label}】の手のひらを、明るい場所で指を軽く開いて撮影して送ってください📷

撮影ガイド：
・手のひらが画面いっぱい（手首少し入る程度）
・背景はできれば無地
・影が入らない明るい場所
・指は軽く開く（ピース角度くらい）

画像を受け付けたら、48時間以内にnoteのURLでお届けします🌿`

/* =========================
   セッション I/O
   ========================= */
async function getSession(userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error

  if (!data) {
    const init = {
      user_id: userId,
      state: 'START',
      hand: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    await supabase.from(TABLE).insert(init)
    return init
  }
  return data
}

async function saveSession(session) {
  const payload = { ...session, updated_at: new Date().toISOString() }
  const { error } = await supabase.from(TABLE).upsert(payload)
  if (error) throw error
}

/* =========================
   本体ハンドラ
   ========================= */
export default async function handlePalm(event) {
  if (event.type !== 'message') return
  const m = event.message
  const userId = event.source.userId
  const replyToken = event.replyToken

  let s = await getSession(userId)

  // 画像受信は state をまたいで処理
  if (m.type === 'image') {
    if (s.state !== 'AWAIT_IMAGE') {
      return safeReply(replyToken, 'まず「承諾」→ 手の選択をしてから画像を送ってね📷')
    }
    try {
      const stream = await line.getMessageContent(m.id)
      const chunks = []
      for await (const c of stream) chunks.push(c)
      const buffer = Buffer.concat(chunks)

      const filename = `palmistry/${userId}/${Date.now()}_${s.hand || 'unknown'}.jpg`
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(filename, buffer, { contentType: 'image/jpeg', upsert: true })
      if (error) throw error

      s.state = 'DONE'
      await saveSession(s)

      return safeReply(replyToken,
        '📩 画像を受け付けました！\n診断は受付順で48時間以内にnoteのURLをLINEでお送りします✨')
    } catch (e) {
      console.error('palmistry image error:', e)
      return safeReply(replyToken, '画像の受付でエラーが出ちゃった…もう一度送ってみてね🙏')
    }
  }

  // テキスト処理
  if (m.type === 'text') {
    const t = m.text.trim()

    switch (s.state) {
      case 'START': {
        s.state = 'AWAIT_ACCEPT'
        await saveSession(s)
        return safeReply(replyToken, GUIDE_TEXT)
      }

      case 'AWAIT_ACCEPT': {
        if (t === '承諾') {
          s.state = 'CHOOSE_HAND'
          await saveSession(s)
          return safeReply(replyToken, {
            type: 'text',
            text: 'どちらの手を診断しますか？👇',
            quickReply: {
              items: [
                { type: 'action', action: { type: 'message', label: '左手（先天・過去）', text: '左手診断' } },
                { type: 'action', action: { type: 'message', label: '右手（後天・未来）', text: '右手診断' } }
              ]
            }
          })
        }
        return safeReply(replyToken, '診断を受ける場合は「承諾」と入力してね🌿')
      }

      case 'CHOOSE_HAND': {
        if (t === '左手診断' || t === '右手診断') {
          const hand = t.includes('左') ? 'left' : 'right'
          s.hand = hand
          s.state = 'AWAIT_IMAGE'
          await saveSession(s)
          const label = hand === 'left' ? '左手' : '右手'
          return safeReply(replyToken, HOW_TO_SHOOT(label))
        }
        return safeReply(replyToken, '左手か右手を選んでください🌸')
      }

      case 'AWAIT_IMAGE': {
        return safeReply(replyToken, '撮影ガイドに沿って画像を送ってね📷')
      }

      case 'DONE': {
        if (t === '再診' || t === 'もう一度') {
          s.state = 'START'
          s.hand = null
          await saveSession(s)
          return safeReply(replyToken, GUIDE_TEXT)
        }
        return safeReply(replyToken, '診断は受付済みです。再度受ける場合は「再診」と入力してね🌸')
      }

      default: {
        s.state = 'START'
        s.hand = null
        await saveSession(s)
        return safeReply(replyToken, GUIDE_TEXT)
      }
    }
  }
}
