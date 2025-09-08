import { isOpen, setOpen } from './featureFlags.js'
const ADMIN_IDS = (process.env.ADMIN_USER_IDS || '').split(',').filter(Boolean) // "Uxxxx,Uyyyy" 形式
const MAINTENANCE = {
  palm : '✋ 手相診断は現在「準備中」です。公開まで少しお待ちください🙏',
  ai   : '🤖 AI相談は現在「準備中」です。少し時間をおいてお試しください🙏',
  renai: '💘 恋愛診断は現在「準備中」です。公開まで少しお待ちください🙏',
}

// …中略（middlewareなどはそのまま）

async function handleEventSafely(event) {
  try {
    // 0) 管理者コマンド（どの画面でも有効）
    if (event.type === 'message' && event.message?.type === 'text') {
      const text = (event.message.text || '').trim()
      const uid = event.source?.userId
      const isAdmin = ADMIN_IDS.includes(uid)
      // 例: 「/open palm」「/close renai」「/status」
      if (isAdmin && text.startsWith('/')) {
        const [cmd, appRaw] = text.slice(1).split(/\s+/,2)
        const app = appRaw?.toLowerCase()
        if (cmd === 'open'  && ['palm','ai','renai'].includes(app)) { await setOpen(app, true);  return safeReply(event.replyToken, `✅ ${app} を OPEN にしました`) }
        if (cmd === 'close' && ['palm','ai','renai'].includes(app)) { await setOpen(app, false); return safeReply(event.replyToken, `⛔ ${app} を 準備中 にしました`) }
        if (cmd === 'status') {
          const [p,a,r] = await Promise.all([isOpen('palm'), isOpen('ai'), isOpen('renai')])
          return safeReply(event.replyToken, `状態\n- 手相: ${p?'OPEN':'準備中'}\n- AI相談: ${a?'OPEN':'準備中'}\n- 恋愛診断: ${r?'OPEN':'準備中'}`)
        }
        // 想定外コマンド
        if (isAdmin) return safeReply(event.replyToken, 'コマンド: /open|/close <palm|ai|renai> /status')
      }
    }

    // 1) ポストバック分岐（最優先）
    if (event.type === 'postback') {
      const data = event.postback?.data || ''
      if (data === 'APP=palm')  return (await isOpen('palm'))  ? handlePalm(event)  : safeReply(event.replyToken, MAINTENANCE.palm)
      if (data === 'APP=ai')    return (await isOpen('ai'))    ? handleAI(event)    : safeReply(event.replyToken, MAINTENANCE.ai)
      if (data === 'APP=renai') return (await isOpen('renai')) ? handleRenai(event) : safeReply(event.replyToken, MAINTENANCE.renai)
      return
    }

    // 2) フォロー時
    if (event.type === 'follow') {
      return safeReply(event.replyToken, 'メニューから「手相／AI相談／恋愛診断」を選んでね🌸')
    }

    // 3)（保険）テキストによる手動切替もフラグを尊重
    if (event.type === 'message' && event.message?.type === 'text') {
      const text = (event.message.text || '').trim()
      if (text === '手相')       return (await isOpen('palm'))  ? handlePalm(event)  : safeReply(event.replyToken, MAINTENANCE.palm)
      if (text === 'AI相談')     return (await isOpen('ai'))    ? handleAI(event)    : safeReply(event.replyToken, MAINTENANCE.ai)
      if (text === '恋愛診断')   return (await isOpen('renai')) ? handleRenai(event) : safeReply(event.replyToken, MAINTENANCE.renai)
      // 既定は恋愛診断（必要なら変更可）
      return (await isOpen('renai')) ? handleRenai(event) : safeReply(event.replyToken, MAINTENANCE.renai)
    }

    return
  } catch (err) {
    console.error('[ERROR] event handling failed:', err)
    if (event?.replyToken) { try { await safeReply(event.replyToken, 'エラーが発生しました。少し待ってからもう一度お試しください🙏') } catch {} }
  }
}
