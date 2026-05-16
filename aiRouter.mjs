/*
 =========================
   aiRouter.mjs｜AI相談専用 軽量自然会話版
   note日替わりパス / 7回制限 / 設定固定保存
   履歴10往復 / 相談メモ3日保持 / 名前保存強化
   占い・恋愛診断の自然誘導 1日1回
 =========================
*/

import { aiChat } from './callGPT.js'
import { supabase } from './supabaseClient.js'
import { safeReply } from './lineClient.js'
import { isOpen } from './featureFlags.js'

const ADMIN_SECRET = 'azu1228'
const RESERVE_URL = process.env.RESERVE_URL || ''
const SESSION_TABLE = 'user_sessions'

const MAX_HISTORY_PAIRS = 10
const FREE_LIMIT = 7

const SETTINGS_ROLE = 'settings'
const SETTINGS_TYPE = 'user_preferences_v1'

const MEMORY_ROLE = 'memory'
const MEMORY_TYPE = 'conversation_memory_v1'

const PROMO_ROLE = 'promo'
const PROMO_TYPE = 'daily_rich_menu_promo_v1'

const LIMIT_TURN_GUIDE_TEXT =
  `ここまでたくさん話してくれてありがとう🌙

今日の無料相談はここで一度区切りになるよ

無料回数が戻るまでは
リッチメニューから占い・恋愛診断も無料で試してみてね♡

続けてAI相談したい場合は
下の購入ページから本日の合言葉を入手して
LINEに入力してね✨`

function buildLimitOnlyText(todayNote) {
  return `今日の無料相談はここまでだよ🌙

また無料回数が戻ったら
いつでも続きから話してね

待ってる間は
リッチメニューから占い・恋愛診断も無料で試してみてね♡

続けてAI相談したい場合は
こちらから本日の合言葉を入手して
LINEに入力してね✨
${todayNote.url}`
}

const noteList = [
  { password: 'neko12', url: 'https://note.com/noble_loris1361/n/nb55e92147e54' },
  { password: 'momo34', url: 'https://note.com/noble_loris1361/n/nfbd564d7f9fb' },
  { password: 'yume56', url: 'https://note.com/noble_loris1361/n/ndb8877c2b1b6' },
  { password: 'riri07', url: 'https://note.com/noble_loris1361/n/n306767c55334' },
  { password: 'nana22', url: 'https://note.com/noble_loris1361/n/nad07c5da665c' },
  { password: 'hono11', url: 'https://note.com/noble_loris1361/n/naa63e451ae21' },
  { password: 'koko88', url: 'https://note.com/noble_loris1361/n/nd60cdc5b729f' },
  { password: 'rara15', url: 'https://note.com/noble_loris1361/n/nd4348855021b' },
  { password: 'chuu33', url: 'https://note.com/noble_loris1361/n/na51ac5885f9e' },
  { password: 'mimi19', url: 'https://note.com/noble_loris1361/n/n6fbfe96dcb4b' },
  { password: 'luna28', url: 'https://note.com/noble_loris1361/n/n3c2e0e045a90' },
  { password: 'peko13', url: 'https://note.com/noble_loris1361/n/n6e0b6456ffcc' },
  { password: 'yuki09', url: 'https://note.com/noble_loris1361/n/nfcbd6eeb5dca' },
  { password: 'toto77', url: 'https://note.com/noble_loris1361/n/n9abc16c0e185' },
  { password: 'puni45', url: 'https://note.com/noble_loris1361/n/n20cfd0524de1' },
  { password: 'kiki01', url: 'https://note.com/noble_loris1361/n/nf766743a0c08' },
  { password: 'susu66', url: 'https://note.com/noble_loris1361/n/n1d1d57bf38f5' },
  { password: 'hime03', url: 'https://note.com/noble_loris1361/n/n2cac5b57d268' },
  { password: 'pipi17', url: 'https://note.com/noble_loris1361/n/nbf7974aabaca' },
  { password: 'coco29', url: 'https://note.com/noble_loris1361/n/nf8849ba3c59c' },
  { password: 'roro04', url: 'https://note.com/noble_loris1361/n/n477c92d85000' },
  { password: 'momo99', url: 'https://note.com/noble_loris1361/n/n332e40058be6' },
  { password: 'nana73', url: 'https://note.com/noble_loris1361/n/n5097160bee76' },
  { password: 'lulu21', url: 'https://note.com/noble_loris1361/n/nd10ed1ef8137' },
  { password: 'meme62', url: 'https://note.com/noble_loris1361/n/n4a344dce3a8c' },
  { password: 'popo55', url: 'https://note.com/noble_loris1361/n/nd7d8de167f37' },
  { password: 'koro26', url: 'https://note.com/noble_loris1361/n/n0fdf4edfa382' },
  { password: 'chibi8', url: 'https://note.com/noble_loris1361/n/n5eaea9b7c2ba' },
  { password: 'mimi44', url: 'https://note.com/noble_loris1361/n/n73b5584bf873' },
  { password: 'lala18', url: 'https://note.com/noble_loris1361/n/nc4db829308a4' },
  { password: 'fufu31', url: 'https://note.com/noble_loris1361/n/n2f5274805780' },
]

function getDefaultSettings() {
  return {
    displayName: '',
    callName: '',
    tone: 'default',
    character: '落ち着いたお姉さん',
    emojiMode: 'off',
    faceMarkMode: 'off',
    styleNotes: [],
  }
}

function getDefaultMemory() {
  return {
    mainConcern: '',
    emotionalState: '',
    preferredResponse: '',
    relationshipContext: '',
    lastAdvice: '',
    avoidResponse: '',
    topics: [],
    importantFacts: [],
  }
}

function getDefaultPromo() {
  return {
    lastPromoDate: '',
    lastPromoType: '',
  }
}

function normalizeSettings(settings = {}) {
  const source = settings && typeof settings === 'object' ? settings : {}
  const base = getDefaultSettings()

  return {
    ...base,
    ...source,
    displayName: String(source.displayName || ''),
    callName: String(source.callName || ''),
    tone: String(source.tone || base.tone),
    character: String(source.character || base.character),
    emojiMode: String(source.emojiMode || base.emojiMode),
    faceMarkMode: String(source.faceMarkMode || base.faceMarkMode),
    styleNotes: Array.isArray(source.styleNotes) ? source.styleNotes.slice(0, 10) : [],
  }
}

function normalizeMemory(memory = {}) {
  const source = memory && typeof memory === 'object' ? memory : {}
  const base = getDefaultMemory()

  return {
    ...base,
    ...source,
    mainConcern: String(source.mainConcern || ''),
    emotionalState: String(source.emotionalState || ''),
    preferredResponse: String(source.preferredResponse || ''),
    relationshipContext: String(source.relationshipContext || ''),
    lastAdvice: String(source.lastAdvice || ''),
    avoidResponse: String(source.avoidResponse || ''),
    topics: Array.isArray(source.topics) ? source.topics.slice(0, 8) : [],
    importantFacts: Array.isArray(source.importantFacts) ? source.importantFacts.slice(0, 10) : [],
  }
}

function normalizePromo(promo = {}) {
  const source = promo && typeof promo === 'object' ? promo : {}
  const base = getDefaultPromo()

  return {
    ...base,
    ...source,
    lastPromoDate: String(source.lastPromoDate || ''),
    lastPromoType: String(source.lastPromoType || ''),
  }
}

function isRecent(ts) {
  if (!ts) return false

  const time = new Date(ts).getTime()
  if (Number.isNaN(time)) return false

  return Date.now() - time < 3 * 24 * 60 * 60 * 1000
}

function getJapanDateString() {
  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return jst.toISOString().slice(0, 10)
}

function getTodayNoteStable() {
  const today = getJapanDateString()
  let hash = 0

  for (let i = 0; i < today.length; i++) {
    hash = today.charCodeAt(i) + ((hash << 5) - hash)
  }

  return noteList[Math.abs(hash) % noteList.length]
}

function capHistory(messages) {
  if (!Array.isArray(messages)) return []

  return messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({
      role: m.role,
      content: String(m.content || '').trim(),
    }))
    .filter((m) => m.content)
    .slice(-(MAX_HISTORY_PAIRS * 2))
}

function splitStoredMessages(storedMessages, recent) {
  if (!Array.isArray(storedMessages)) {
    return {
      settings: getDefaultSettings(),
      memory: getDefaultMemory(),
      promo: getDefaultPromo(),
      chatMessages: [],
    }
  }

  const settingsItem = storedMessages.find(
    (m) => m?.role === SETTINGS_ROLE && m?.content?.type === SETTINGS_TYPE
  )

  const memoryItem = storedMessages.find(
    (m) => m?.role === MEMORY_ROLE && m?.content?.type === MEMORY_TYPE
  )

  const promoItem = storedMessages.find(
    (m) => m?.role === PROMO_ROLE && m?.content?.type === PROMO_TYPE
  )

  // 名前 呼び方 口調 絵文字 キャラは3日判定に関係なく残す
  const settings = normalizeSettings(settingsItem?.content?.data || {})

  // 会話履歴と相談メモだけ3日判定でリセット
  const memory = recent
    ? normalizeMemory(memoryItem?.content?.data || {})
    : getDefaultMemory()

  const chatMessages = recent ? capHistory(storedMessages) : []

  // promoは1日1回判定用なので保持
  const promo = normalizePromo(promoItem?.content?.data || {})

  return {
    settings,
    memory,
    promo,
    chatMessages,
  }
}

function packStoredMessages(settings, memory, promo, chatMessages) {
  return [
    {
      role: SETTINGS_ROLE,
      content: {
        type: SETTINGS_TYPE,
        data: normalizeSettings(settings),
      },
    },
    {
      role: MEMORY_ROLE,
      content: {
        type: MEMORY_TYPE,
        data: normalizeMemory(memory),
      },
    },
    {
      role: PROMO_ROLE,
      content: {
        type: PROMO_TYPE,
        data: normalizePromo(promo),
      },
    },
    ...capHistory(chatMessages),
  ]
}

function addUniqueLimited(list, value, limit = 8) {
  const clean = String(value || '').trim()
  if (!clean) return Array.isArray(list) ? list.slice(0, limit) : []

  const base = Array.isArray(list) ? list.filter((x) => x !== clean) : []
  base.push(clean)

  return base.slice(-limit)
}

function addStyleNote(settings, note) {
  const next = normalizeSettings(settings)
  next.styleNotes = addUniqueLimited(next.styleNotes, note, 10)
  return next
}

async function loadSession(userId) {
  const { data, error } = await supabase
    .from(SESSION_TABLE)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data || null
}

async function saveSession(session) {
  const payload = {
    ...session,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from(SESSION_TABLE)
    .upsert(payload, { onConflict: 'user_id' })

  if (error) throw error
}

function stripEmojis(text = '') {
  return String(text || '')
    .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, '')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function withEmojiIfNeeded(text, settings) {
  const clean = String(text || '').trim()
  const s = normalizeSettings(settings)

  if (s.emojiMode === 'on') {
    return /[\p{Extended_Pictographic}]/u.test(clean) ? clean : `${clean} 😊`
  }

  return stripEmojis(clean)
}

function cleanReplyText(text = '', settings = {}) {
  const s = normalizeSettings(settings)

  let out = String(text || '')
    .replace(/私はAIなので[^。\n]*/g, '')
    .replace(/AIなので[^。\n]*/g, '')
    .replace(/ルールで[^。\n]*/g, '')
    .replace(/設定上[^。\n]*/g, '')
    .replace(/あなたの名前はまだ覚えていません[^。\n]*/g, '')
    .replace(/。/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (s.emojiMode === 'off') {
    out = stripEmojis(out)
  }

  if (!s.callName) {
    out = out.replace(/たっくん[、,。 ]*/g, '')
  }

  return out.trim()
}

function isPhoneInquiry(text = '') {
  const s = String(text || '').toLowerCase().replace(/\s+/g, '')

  if (/電話番号|tel[:：]?/.test(s)) return false

  return (
    /^(電話|でんわ|通話)$/.test(s) ||
    /(電話|でんわ|通話).*(相談|予約|できる|可能|ok|おk|話せ|話す|したい|たい|対応|やってる|お願い|\?|？)/.test(s) ||
    /(相談|予約|できる|可能|ok|おk|話せ|話す|したい|たい|対応|やってる|お願い).*(電話|でんわ|通話)/.test(s) ||
    /(電話相談|電話予約|通話相談)/.test(s)
  )
}

function isDirectQuestion(text = '') {
  return /どう思う|どうすれば|どうしたら|した方がいい|あり？|OK？|本気？|好き？|脈あり|脈なし|浮気|別れる|復縁|やめた方がいい|付き合う|告白|連絡|不倫|都合いい|遊び|本命|冷めた|待つべき|諦める|気持ちわかる|気持ち分かる/i.test(text)
}

function isLightSexualRomanceQuestion(text = '') {
  return /エッチ|性的|性欲|キス|ハグ|抱きしめ|おっぱい|胸|乳首|触る|触られ|気持ちいい|気持ち良い|下ネタ|ムラムラ|ドキドキ|スキンシップ|ボディタッチ/.test(String(text || ''))
}

function isUnsafeSexualRequest(text = '') {
  const s = String(text || '')

  const hasSexual =
    isLightSexualRomanceQuestion(s) ||
    /セックス|性行為|裸|脱がせ|襲う|犯す|レイプ|盗撮|無理やり|寝てる間|酔わせ|同意なし|嫌がる/.test(s)

  const hasMinor =
    /未成年|中学生|高校生|小学生|子ども|子供|児童|園児|幼児|18歳未満|17歳|16歳|15歳|14歳|13歳|12歳/.test(s)

  const hasCoercion =
    /無理やり|嫌がる|同意なし|寝てる|酔ってる|断られた|拒否|盗撮|脅す|バレずに|こっそり/.test(s)

  const hasExplicitHowTo =
    /やり方|方法|手順|攻め方|テクニック|感じさせ方|イかせ方|脱がせ方|触り方.*詳しく|具体的に.*触/.test(s)

  return hasSexual && (hasMinor || hasCoercion || hasExplicitHowTo)
}

function buildUnsafeSexualReply(settings) {
  return withEmojiIfNeeded(
    `その気持ち自体は否定しないよ

でもその内容は 相手の同意や年齢や安全がかなり大事になる話だから
具体的なやり方としては答えられない

恋愛の距離感や断り方 不安の伝え方なら一緒に考えられるよ`,
    settings
  )
}

function isImageRequest(text = '') {
  return /画像|イラスト|写真|絵|作れる|生成|描ける/.test(String(text || ''))
}

function isFortuneRequest(text = '') {
  return /占い|運勢|誕生日|生年月日|相性占い|星座|手相/.test(String(text || ''))
}

function hasConsultationWord(text = '') {
  return /悩み|相談|好き|彼氏|彼女|元彼|元カノ|復縁|浮気|不倫|告白|別れ|付き合|連絡|脈|学校|友達|親|家族|仕事|職場|死にたい|消えたい|つらい|辛い|しんどい|疲れ|病ん|怖い|不安|寂しい|どう思う|どうすれば|どうしたら|した方がいい|本気|遊び|都合いい|占い|運勢|相性|誕生日|画像|作れる|エッチ|性的|性欲|キス|ハグ|おっぱい|胸|乳首|触る|触られ|気持ちいい|気持ち良い|下ネタ|スキンシップ|ボディタッチ/i.test(text)
}

function hasStyleWord(text = '') {
  return /絵文字|顔文字|スタンプ|口調|キャラ|性格|雰囲気|話し方|呼び方|一人称|敬語|タメ口|ため口|関西弁|標準語|甘えた|女の子|お姉さん|お兄さん|男友達|女友達|辛口|優しく|厳しく|冷たく|明るく|病み系|ギャル|先生|占い師|カウンセラー|友達っぽく|恋人っぽく|彼女っぽく|彼氏っぽく/i.test(text)
}

function isAskingName(text = '') {
  const s = String(text || '').trim()

  return (
    /(俺|僕|私|うち|自分)?の?名前.*(覚えてる|覚えた|知ってる|わかる|分かる|言って|教えて|なに|何|だれ|誰)/i.test(s) ||
    /(俺|僕|私|うち|自分)?の?名前(?:は|って|なに|何)?[？?]?$/i.test(s) ||
    /^名前(?:は|って|なに|何)?[？?]$/i.test(s) ||
    /なんて呼べば/i.test(s) ||
    /呼び名.*(覚えてる|覚えた|知ってる|わかる|分かる|言って|教えて)/i.test(s)
  )
}

function extractName(text = '', chatMessages = []) {
  const s = String(text || '').trim()

  if (!s) return ''

  // 名前を聞いている文は絶対に登録しない
  if (/覚えてる|覚えた|知ってる|わかる|分かる|言って|教えて|なに|何|だれ|誰|\?|？/.test(s)) {
    return ''
  }

  const recentText = Array.isArray(chatMessages)
    ? chatMessages
        .slice(-4)
        .map((m) => String(m.content || ''))
        .join('\n')
    : ''

  const nameContext =
    /名前|呼んでほしい|なんて呼べば|教えてもらってない/.test(recentText)

  const patterns = [
    /(?:俺|僕|私|うち|自分)の名前(?:は|が)?\s*([^\s、。！？!?]{1,20})(?:だよ|です|やで|だ|ね|$)/,
    /名前(?:は|が)\s*([^\s、。！？!?]{1,20})(?:だよ|です|やで|だ|ね|$)/,
    /([^\s、。！？!?]{1,20})(?:って|と)呼んで/,
    /([^\s、。！？!?]{1,20})だよ(?:、|。)?覚えて/,
  ]

  for (const pattern of patterns) {
    const match = s.match(pattern)
    const value = match?.[1]?.trim()

    if (
      value &&
      !/名前|覚えて|覚えた|呼んで|誰|何|なに|だれ|言って|教えて|おはよう|こんにちは|こんばんは|\?|？/.test(value)
    ) {
      return value
    }
  }

  // 直近で名前の話をしている時だけ「たっくんだよ」単体を名前として拾う
  if (nameContext) {
    const match = s.match(/^([^\s、。！？!?]{1,20})(?:だよ|です|やで|だ)$/)
    const value = match?.[1]?.trim()

    if (
      value &&
      !/おはよう|こんにちは|こんばんは|そう|うん|いや|違う|名前|相談|はじめる|AI相談|言ってみて/.test(value)
    ) {
      return value
    }
  }

  return ''
}

function buildNameReply(settings) {
  const s = normalizeSettings(settings)

  if (s.callName) {
    return withEmojiIfNeeded(`${s.callName}だよ\nちゃんと覚えてるよ`, s)
  }

  return withEmojiIfNeeded(
    'まだ名前は教えてもらってないよ\n呼んでほしい名前があれば教えてね',
    s
  )
}

function applyPreferenceUpdates(settings, userText, chatMessages = []) {
  let next = normalizeSettings(settings)
  const s = String(userText || '').trim()
  let changed = false
  let handled = false
  const replies = []

  const name = extractName(s, chatMessages)
  if (name) {
    next.displayName = name
    next.callName = name
    changed = true
    handled = true
    replies.push(`${name}って覚えたよ`)
  }

  if (/絵文字/.test(s) && /(使って|つかって|あり|有り|入れて|つけて|ほしい|欲しい|お願い)/.test(s)) {
    next.emojiMode = 'on'
    changed = true
    handled = true
    replies.push('これから絵文字も使って返すね')
  }

  if (/絵文字/.test(s) && /(使わない|つかわない|なし|無し|いらない|要らない|やめて)/.test(s)) {
    next.emojiMode = 'off'
    changed = true
    handled = true
    replies.push('これから絵文字なしで返すね')
  }

  if (/顔文字/.test(s) && /(使って|つかって|あり|有り|入れて|つけて|ほしい|欲しい|お願い)/.test(s)) {
    next.faceMarkMode = 'on'
    changed = true
    handled = true
    replies.push('これから顔文字も使って返すね')
  }

  if (/顔文字/.test(s) && /(使わない|つかわない|なし|無し|いらない|要らない|やめて)/.test(s)) {
    next.faceMarkMode = 'off'
    changed = true
    handled = true
    replies.push('これから顔文字なしで返すね')
  }

  if (/(敬語).*(やめて|なし|無し|いらない|要らない)|タメ口|ため口|フランク|砕けた/.test(s)) {
    next.tone = 'casual'
    changed = true
    handled = true
    replies.push('敬語なしで返すね')
  }

  if (/(敬語|丁寧|ていねい).*(使って|で|にして|お願い)|丁寧に/.test(s)) {
    next.tone = 'polite'
    changed = true
    handled = true
    replies.push('丁寧な話し方で返すね')
  }

  if (/関西弁/.test(s)) {
    next = addStyleNote(next, '関西弁')
    changed = true
    handled = true
    replies.push('関西弁に寄せて返すね')
  }

  if (/甘えた|甘える|甘め/.test(s)) {
    next = addStyleNote(next, '甘えた話し方')
    changed = true
    handled = true
    replies.push('甘えた感じで返すね')
  }

  if (/彼女っぽく|彼女らしく|恋人っぽく/.test(s)) {
    next.character = '彼女っぽく優しく話す相談員'
    changed = true
    handled = true
    replies.push('彼女っぽく優しく返すね')
  }

  if (/男友達/.test(s)) {
    next.character = '男友達っぽく話す相談員'
    changed = true
    handled = true
    replies.push('男友達っぽく返すね')
  }

  if (/女友達/.test(s)) {
    next.character = '女友達っぽく話す相談員'
    changed = true
    handled = true
    replies.push('女友達っぽく返すね')
  }

  if (/お姉さん|姉さん/.test(s)) {
    next.character = '落ち着いたお姉さん'
    changed = true
    handled = true
    replies.push('お姉さんっぽく返すね')
  }

  if (/辛口|厳しく|ハッキリ|はっきり/.test(s)) {
    next = addStyleNote(next, '辛口ではっきり')
    changed = true
    handled = true
    replies.push('はっきりめに返すね')
  }

  if (/優しく|やさしく/.test(s)) {
    next = addStyleNote(next, '優しく')
    changed = true
    handled = true
    replies.push('優しく返すね')
  }

  if (!changed && /絵文字.*\?|絵文字は？|絵文字は\?/.test(s)) {
    handled = true

    if (next.emojiMode === 'on') {
      replies.push('今は絵文字ありで返す設定だよ')
    } else {
      replies.push('今は絵文字なしで返す設定だよ\n使ってほしい時は「絵文字使って」と送ってね')
    }
  }

  const preferenceOnly =
    handled &&
    !hasConsultationWord(s) &&
    (s.length <= 100 || hasStyleWord(s) || name)

  return {
    settings: next,
    changed,
    handled,
    preferenceOnly,
    replyText: replies.length ? withEmojiIfNeeded(replies.join('\n'), next) : '',
  }
}

function detectTopic(text = '') {
  const s = String(text || '')

  if (isLightSexualRomanceQuestion(s)) return '性的恋愛相談'
  if (/好き|彼氏|彼女|元彼|元カノ|復縁|浮気|不倫|告白|別れ|付き合|連絡|脈|本気|遊び|都合いい|相性/.test(s)) return '恋愛'
  if (/学校|友達|クラス|先生|部活|勉強|受験/.test(s)) return '学校 友人関係'
  if (/親|家族|母|父|兄|姉|弟|妹|家庭/.test(s)) return '家庭 家族'
  if (/仕事|職場|上司|同僚|バイト|給料|転職/.test(s)) return '仕事 職場'
  if (/死にたい|消えたい|つらい|辛い|しんどい|疲れ|病ん|不安|怖い|寂しい|眠れない/.test(s)) return 'メンタル'
  if (/占い|運勢|誕生日|生年月日/.test(s)) return '占い'
  if (/画像|イラスト|写真|作れる|生成/.test(s)) return '画像相談'

  return ''
}

function detectEmotion(text = '') {
  const s = String(text || '')

  if (/死にたい|消えたい/.test(s)) return '危険度が高い可能性があるため安全確認を優先する'
  if (/つらい|辛い|しんどい|疲れ|病ん/.test(s)) return 'かなり疲れていて受け止めを必要としている'
  if (/不安|怖い|心配/.test(s)) return '不安が強く安心材料と具体策を求めている'
  if (/寂しい|さみしい|孤独/.test(s)) return '寂しさが強く寄り添いを求めている'
  if (/怒り|ムカつく|腹立つ|許せない/.test(s)) return '怒りが強く気持ちの整理を必要としている'
  if (isLightSexualRomanceQuestion(s)) return '軽い性的な興味や確認したい気持ちがある'

  return ''
}

function detectPreferredResponse(text = '', settings = {}) {
  const s = String(text || '')
  const st = normalizeSettings(settings)
  const combined = `${s} ${st.character} ${st.styleNotes.join(' ')}`

  if (/辛口|厳しく|ハッキリ|はっきり|結論/.test(combined)) {
    return 'はっきりめの返答を望んでいる'
  }

  if (/優しく|やさしく|甘えた|彼女っぽく|恋人っぽく/.test(combined)) {
    return '優しく受け止める返答を望んでいる'
  }

  if (/短く|簡潔|一言/.test(s)) {
    return '短く簡潔な返答を望んでいる'
  }

  return ''
}

function cleanShortText(text = '', max = 120) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[。]/g, '')
    .trim()
    .slice(0, max)
}

function updateConversationMemory(memory, userText, replyText, settings) {
  const next = normalizeMemory(memory)
  const s = String(userText || '').trim()

  const topic = detectTopic(s)
  const emotion = detectEmotion(s)
  const preferred = detectPreferredResponse(s, settings)

  if (topic) {
    next.topics = addUniqueLimited(next.topics, topic, 8)
  }

  if (hasConsultationWord(s)) {
    const shortConcern = cleanShortText(s, 120)
    if (shortConcern) next.mainConcern = shortConcern
  }

  if (emotion) next.emotionalState = emotion
  if (preferred) next.preferredResponse = preferred

  if (/彼氏|彼女|元彼|元カノ|好きな人|旦那|嫁|妻|夫|友達|親|母|父|上司|同僚|女の子|男の子|相手/.test(s)) {
    next.relationshipContext = cleanShortText(s, 120)
  }

  if (/曖昧|一般論|それだけ|違う|そうじゃない|むちゃくちゃ|おかしい|嫌|単調|同じこと/.test(s)) {
    next.avoidResponse = '曖昧な一般論や同じような返答は避ける'
  }

  const advice = cleanShortText(replyText, 140)
  if (advice) next.lastAdvice = advice

  return normalizeMemory(next)
}

function buildSettingsBlock(settings) {
  const s = normalizeSettings(settings)

  const tone =
    s.tone === 'casual'
      ? 'タメ口寄り'
      : s.tone === 'polite'
        ? '丁寧'
        : '自然'

  const emoji =
    s.emojiMode === 'on'
      ? '自然に使う'
      : s.emojiMode === 'off'
        ? '使わない'
        : '自然に判断'

  const faceMark =
    s.faceMarkMode === 'on'
      ? '自然に使う'
      : s.faceMarkMode === 'off'
        ? '使わない'
        : '自然に判断'

  return `
現在のユーザー設定
呼び名：${s.callName || '指定なし'}
口調：${tone}
キャラ：${s.character || '落ち着いたお姉さん'}
絵文字：${emoji}
顔文字：${faceMark}
追加の話し方：${s.styleNotes.length ? s.styleNotes.join(' / ') : 'なし'}
`.trim()
}

function buildMemoryBlock(memory) {
  const m = normalizeMemory(memory)

  return `
現在の相談メモ
主な悩み：${m.mainConcern || 'まだ特定なし'}
感情状態：${m.emotionalState || 'まだ特定なし'}
望んでいる対応：${m.preferredResponse || 'まだ特定なし'}
関係性や状況：${m.relationshipContext || 'まだ特定なし'}
前回の助言：${m.lastAdvice || 'なし'}
避ける返答：${m.avoidResponse || 'なし'}
話題傾向：${m.topics.length ? m.topics.join(' / ') : 'まだ特定なし'}
`.trim()
}

function buildRecentFlowBlock(chatMessages = []) {
  const recentUserMessages = Array.isArray(chatMessages)
    ? chatMessages
        .filter((m) => m.role === 'user')
        .slice(-6)
        .map((m) => `・${String(m.content || '').slice(0, 80)}`)
        .join('\n')
    : ''

  return `
直近のユーザー発言
${recentUserMessages || 'まだ少ない'}
`.trim()
}

function buildTopicHint(userText) {
  const s = String(userText || '')
  const hints = []

  if (isLightSexualRomanceQuestion(s)) {
    hints.push('軽い性的な恋愛相談は逃げずに自然に答える ただし露骨な手順説明や同意のない内容は扱わない')
  }

  if (isImageRequest(s)) {
    hints.push('画像生成機能が未実装なら 画像そのものは作れないと短く伝え 代わりに構図や文面作りは手伝えると伝える')
  }

  if (isFortuneRequest(s)) {
    hints.push('占いは参考として自然に答える 断定しすぎず今日の行動に落とす')
  }

  if (/気持ちわかる|気持ち分かる|今の気持ち/.test(s)) {
    hints.push('今の気持ちを聞かれたら 直近の会話から自然に推測して答える')
  }

  return hints.length ? `今回だけの補足\n${hints.map((h) => `・${h}`).join('\n')}` : ''
}

function buildSystemPrompt(settings, memory, userText, chatMessages = []) {
  const settingsBlock = buildSettingsBlock(settings)
  const memoryBlock = buildMemoryBlock(memory)
  const recentFlowBlock = buildRecentFlowBlock(chatMessages)
  const topicHint = buildTopicHint(userText)

  const baseRule = `
あなたはLINEの相談員です

大切な方針
・相談者の気持ちを否定せず 自然な会話で返す
・正論や説教から入らず まず気持ちを受け止める
・過去の会話と相談メモを踏まえて その人が何に悩んでいるかを考えて返す
・軽い会話は短く自然に 深い相談は少し丁寧に返す
・必要な時だけ 現実的なアドバイスを添える
・名前や呼び方 絵文字 口調は現在のユーザー設定に従う
・会話の型は固定しない
・毎回同じ言い方にしない
・「私はAIなので」「ルールでできない」などの言い方は避ける
・危険な内容だけは安全を優先する
・句点「。」はなるべく使わず LINEらしく自然に改行する
`.trim()

  return [
    baseRule,
    settingsBlock,
    memoryBlock,
    recentFlowBlock,
    topicHint,
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

function isHeavyOrSensitiveForPromo(text = '') {
  const s = String(text || '')

  return (
    /死にたい|消えたい|自傷|殺したい|虐待|性被害|レイプ|襲われ|暴力|怖い|助けて|しんどい|つらい|辛い/.test(s) ||
    isLightSexualRomanceQuestion(s) ||
    isUnsafeSexualRequest(s)
  )
}

function shouldSuggestRichMenuPromo({ userText, replyText, promo, today, newCount }) {
  const s = String(userText || '')
  const answer = String(replyText || '')
  const p = normalizePromo(promo)

  if (p.lastPromoDate === today) return false
  if (newCount >= FREE_LIMIT) return false
  if (isHeavyOrSensitiveForPromo(s)) return false

  const looksInterested =
    /占い|占って|運勢|今日の運勢|明日の運勢|相性|恋愛診断|診断|恋愛タイプ|性格診断|相手の気持ち|相手の本音|本音|未来|誕生日|生年月日|星座|手相/.test(s)

  const softIntent =
    /私ってどんな|俺ってどんな|向いてる|合ってる|相性いい|気持ち知りたい|どう思われてる|脈あり|脈なし|恋愛運/.test(s)

  const answerNaturallyRelated =
    /相性|気持ち|本音|整理|診断|占い|運勢|恋愛タイプ/.test(answer)

  return looksInterested || softIntent || (answerNaturallyRelated && /好き|恋愛|相性|気持ち|本音|迷う|わからない/.test(s))
}

function buildRichMenuPromoText(settings) {
  return withEmojiIfNeeded(
    `ちなみに 気持ちや相性をもう少し整理したい時は
リッチメニューの占い・恋愛診断も無料で試せるよ

今の相談と合わせて見ると
少し整理しやすいかも`,
    settings
  )
}

async function replyPhoneInfo(event) {
  const text =
    '電話でも相談できます\n' +
    'リッチメニューの「予約」から予約してください\n' +
    'お電話はAIではなく人の相談員が対応します'

  if (RESERVE_URL) {
    await safeReply(event.replyToken, {
      type: 'text',
      text,
      quickReply: {
        items: [
          {
            type: 'action',
            action: {
              type: 'uri',
              label: '予約ページを開く',
              uri: RESERVE_URL,
            },
          },
        ],
      },
    })
    return
  }

  await safeReply(event.replyToken, text)
}

export async function sendAiIntro(event) {
  await safeReply(event.replyToken, {
    type: 'text',
    text: `AI相談室のご案内

恋愛 人間関係 家庭 学校 気持ちの整理など
誰にも言いにくい悩みを相談できます

ご利用について
・1日7往復まで無料
・7回目はAIの返答後に購入案内が表示されます
・8回目以降は購入案内のみ表示されます

使い方
最初は落ち着いたお姉さん風で返します
絵文字は最初は使いません

「絵文字使って」
「辛口で」
「甘えた女の子で」
「男友達っぽく」
など希望を送れば その口調に合わせます

記憶について
名前 呼び方 口調 キャラ 絵文字の有無は保存されます
会話の流れは直近10往復を見て返します
相談メモは3日間保持して 悩みの流れを読み取ります
設定だけの変更は無料回数にカウントしません

占い・恋愛診断について
気持ちや相性を整理したい時は
リッチメニューから無料で試せます

無制限プラン
購入ページで本日の合言葉を取得して
その合言葉をLINEに入力すると
その日限定でAI相談が無制限になります

相談したいことをそのまま送ってください`,
  })
}

export async function handleAI(event) {
  if (!(event.type === 'message' && event.message?.type === 'text')) return

  const userId = event.source?.userId
  if (!userId) return

  const userText = (event.message.text || '').trim()
  const today = getJapanDateString()
  const todayNote = getTodayNoteStable()

  if (userText === ADMIN_SECRET) {
    await safeReply(
      event.replyToken,
      `管理者モード
本日(${today})のnoteパスワードは「${todayNote.password}」
URL：${todayNote.url}`
    )
    return
  }

  if (userText === 'AI相談' || userText === '相談' || userText === 'はじめる') {
    await sendAiIntro(event)
    return
  }

  const open = await isOpen('ai')
  if (!open) {
    await safeReply(
      event.replyToken,
      'AI相談は現在メンテナンス中です\n少し時間をおいてからもう一度送ってください'
    )
    return
  }

  if (isPhoneInquiry(userText)) {
    await replyPhoneInfo(event)
    return
  }

  const session = (await loadSession(userId)) || {
    user_id: userId,
    flow: 'ai',
  }

  const sameDay = session.last_date === today
  const recent = isRecent(session.updated_at)

  let count = sameDay ? Number(session.count || 0) : 0
  let authenticated = sameDay ? !!session.authenticated : false
  let authDate = sameDay ? session.auth_date || null : null

  let { settings, memory, promo, chatMessages } = splitStoredMessages(session.messages, recent)

  if (userText === todayNote.password) {
    await saveSession({
      ...session,
      flow: 'ai',
      last_date: today,
      authenticated: true,
      auth_date: today,
      count,
      messages: packStoredMessages(settings, memory, promo, chatMessages),
    })

    await safeReply(
      event.replyToken,
      withEmojiIfNeeded('合言葉が確認できました\n今日は回数制限なしでお話しできます', settings)
    )
    return
  }

  // 先に名前・口調などの設定変更を拾う
  const preferenceResult = applyPreferenceUpdates(settings, userText, chatMessages)
  settings = preferenceResult.settings

  if (preferenceResult.preferenceOnly) {
    const fixedReply = preferenceResult.replyText || withEmojiIfNeeded('覚えたよ', settings)

    const nextChatMessages = capHistory([
      ...chatMessages,
      { role: 'user', content: userText },
      { role: 'assistant', content: fixedReply },
    ])

    await saveSession({
      ...session,
      user_id: userId,
      flow: 'ai',
      count,
      messages: packStoredMessages(settings, memory, promo, nextChatMessages),
      last_date: today,
      authenticated,
      auth_date: authDate,
    })

    await safeReply(event.replyToken, fixedReply)
    return
  }

  // 名前を聞かれた時はAIを呼ばず固定で返す
  if (isAskingName(userText)) {
    const nameReply = buildNameReply(settings)

    const nextChatMessages = capHistory([
      ...chatMessages,
      { role: 'user', content: userText },
      { role: 'assistant', content: nameReply },
    ])

    await saveSession({
      ...session,
      user_id: userId,
      flow: 'ai',
      count,
      messages: packStoredMessages(settings, memory, promo, nextChatMessages),
      last_date: today,
      authenticated,
      auth_date: authDate,
    })

    await safeReply(event.replyToken, nameReply)
    return
  }

  if (isUnsafeSexualRequest(userText)) {
    const unsafeReply = buildUnsafeSexualReply(settings)

    const nextChatMessages = capHistory([
      ...chatMessages,
      { role: 'user', content: userText },
      { role: 'assistant', content: unsafeReply },
    ])

    await saveSession({
      ...session,
      user_id: userId,
      flow: 'ai',
      count,
      messages: packStoredMessages(settings, memory, promo, nextChatMessages),
      last_date: today,
      authenticated,
      auth_date: authDate,
    })

    await safeReply(event.replyToken, unsafeReply)
    return
  }

  if (!authenticated && count >= FREE_LIMIT) {
    await saveSession({
      ...session,
      flow: 'ai',
      count,
      last_date: today,
      messages: packStoredMessages(settings, memory, promo, chatMessages),
      authenticated,
      auth_date: authDate,
    })

    await safeReply(event.replyToken, buildLimitOnlyText(todayNote))
    return
  }

  const newCount = count + 1

  chatMessages.push({
    role: 'user',
    content: userText,
  })
  chatMessages = capHistory(chatMessages)

  const systemPrompt = buildSystemPrompt(settings, memory, userText, chatMessages)

  const messagesForAI = [
    { role: 'system', content: systemPrompt },
    ...chatMessages,
  ]

  let replyText = ''

  try {
    const result = await aiChat(messagesForAI, {
      maxTokens: isDirectQuestion(userText) ? 380 : 600,
      temperature: isLightSexualRomanceQuestion(userText) ? 0.6 : 0.5,
    })

    replyText = cleanReplyText(result.text, settings)

    if (result.ok) {
      chatMessages.push({
        role: 'assistant',
        content: replyText,
      })

      chatMessages = capHistory(chatMessages)
      memory = updateConversationMemory(memory, userText, replyText, settings)
    }
  } catch (e) {
    console.error('[AI ROUTER ERROR]', e)
    replyText = withEmojiIfNeeded('うまく返せませんでした\nもう一度だけ送ってください', settings)
  }

  if (
    shouldSuggestRichMenuPromo({
      userText,
      replyText,
      promo,
      today,
      newCount,
    })
  ) {
    replyText = `${replyText}\n\n${buildRichMenuPromoText(settings)}`
    promo = {
      ...normalizePromo(promo),
      lastPromoDate: today,
      lastPromoType: 'fortune_love_diagnosis',
    }
  }

  if (!authenticated && newCount === FREE_LIMIT) {
    replyText = `${replyText}\n\n${LIMIT_TURN_GUIDE_TEXT}\n${todayNote.url}`
  }

  try {
    await saveSession({
      user_id: userId,
      flow: 'ai',
      count: newCount,
      messages: packStoredMessages(settings, memory, promo, chatMessages),
      last_date: today,
      authenticated,
      auth_date: authDate,
    })
  } catch (e) {
    console.error('[SESSION SAVE ERROR]', e)
  }

  await safeReply(event.replyToken, replyText)
}

export default handleAI
