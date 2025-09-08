
// /apps/palmistry-note/router.js
import { safeReply, line } from '../../services/lineClient.js'
import { supabase } from '../../services/supabaseClient.js'

const INTRO = `✋ 手相診断（note版）のご案内

🔹 左手 … 生まれ持った性質や過去の傾向
🔹 右手 … 努力や経験で変わった現在と未来の流れ

📌 料金：3,000円（税込）
📌 内容：30項目の詳細レポート（3,000〜5,000文字）
📌 納品：note 有料記事URL
📌 納期：受付順で48時間以内

どちらの手を診断しますか？👇`

const HOW_TO_SHOOT = (label) => 
`了解しました😊
【${label}】の手のひらを、明るい場所で指を軽く開いて撮影して送ってください📷

撮影ガイド：
・手のひらが画面いっぱい（手首少し入る程度）
・背景はできれば無地
・影が入らない明るい場所
・指は軽く開く（ピース角度くらい）

画像を受け付けたら、48時間以内にnoteのURLでお届けします🌿`

export async function handleEvent(event, session = {}) {
  if (event.type !== 'message') return
  const m = event.message

  // テキスト
  if (m.type === 'text') {
    const t = m.text.trim()

    // 入口
    if (t === '手相診断' || t === 'メニュー' || t === '手相') {
      return safeReply(event.replyToken, {
        type: 'text',
        text: INTRO,
        quickReply: {
          items: [
            { type: 'action', action: { type: 'message', label: '左手（先天・過去）', text: '左手診断' } },
            { type: 'action', action: { type: 'message', label: '右手（後天・未来）', text: '右手診断' } }
          ]
        }
      })
    }

    // 手の選択
    if (t === '左手診断' || t === '右手診断') {
      const hand = t.includes('左') ? 'left' : 'right'
      // ここでは必要に応じてセッション保存してOK（例：handだけ保持）
      session.hand = hand
      // 保存: supabase.from('sessions').upsert(session) など、必要なら

      const label = hand === 'left' ? '左手' : '右手'
      return safeReply(event.replyToken, HOW_TO_SHOOT(label))
    }

    // ガイド固定返し
    return safeReply(event.replyToken,
      '手相診断の受付中だよ📷 左手か右手を選んで、ガイドに沿って写真を送ってね')
  }

  // 画像受信
  if (m.type === 'image') {
    try {
      // 画像バイナリ取得
      const stream = await line.getMessageContent(m.id) // lineClientにメソッド実装済みならそれを利用
      const chunks = []
      for await (const c of stream) chunks.push(c)
      const buffer = Buffer.concat(chunks)

      const userId = event.source.userId
      const hand = session?.hand || 'unknown'
      const filename = `palmistry/${userId}/${Date.now()}_${hand}.jpg`

      // Supabase Storage に保存（バケット名は環境に合わせて）
      const { error } = await supabase.storage
        .from('line-uploads')
        .upload(filename, buffer, { contentType: 'image/jpeg', upsert: true })
      if (error) throw error

      // 受付完了
      await safeReply(event.replyToken,
        '📩 画像を受け付けました！\n診断は受付順で48時間以内にnoteのURLをLINEでお送りします✨')

    } catch (e) {
      console.error('palmistry image error:', e)
      await safeReply(event.replyToken, '画像の受付でエラーが出ちゃった…もう一度送ってみてね🙏')
    }
  }
}
