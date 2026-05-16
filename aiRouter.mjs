/*
 =========================
   aiRouter.mjs｜AI相談専用 完全版
   note日替わりパス / 7回制限 / 3日保持 / ユーザー設定固定保存
   履歴10往復 / 相談メモ保持 / 軽い性的恋愛相談対応 / 単調返答防止
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
  const base = getDefaultSettings()

  return {
    ...base,
    ...settings,
    styleNotes: Array.isArray(settings.styleNotes) ? settings.styleNotes.slice(0, 10) : [],
  }
}

function normalizeMemory(memory = {}) {
  const base = getDefaultMemory()

  return {
    ...base,
    ...memory,
    topics: Array.isArray(memory.topics) ? memory.topics.slice(0, 8) : [],
    importantFacts: Array.isArray(memory.importantFacts) ? memory.importantFacts.slice(0, 10) : [],
  }
}

function normalizePromo(promo = {}) {
  const base = getDefaultPromo()

  return {
    ...base,
    ...promo,
  }
}

function isRecent(ts) {
  if (!ts) return false
  const diff = Date.now() - new Date(ts).getTime()
  return diff < 3 * 24 * 60 * 60 * 1000
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

  const index = Math.abs(hash) % noteList.length
  return noteList[index]
}

function capHistory(messages) {
  if (!Array.isArray(messages)) return []

  return messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({
      role: m.role,
      content: String(m.content || ''),
    }))
    .filter((m) => m.content.trim())
    .slice(-(MAX_HISTORY_PAIRS * 2))
}

function splitStoredMessages(storedMessages, recent) {
  if (!recent || !Array.isArray(storedMessages)) {
    return {
      settings: getDefaultSettings(),
      memory: getDefaultMemory(),
      promo: getDefaultPromo(),
      chatMessages: [],
    }
  }

  const settingsItem = storedMessages.find(
    (m) =>
      m &&
      m.role === SETTINGS_ROLE &&
      m.content &&
      m.content.type === SETTINGS_TYPE
  )

  const memoryItem = storedMessages.find(
    (m) =>
      m &&
      m.role === MEMORY_ROLE &&
      m.content &&
      m.content.type === MEMORY_TYPE
  )

  const promoItem = storedMessages.find(
    (m) =>
      m &&
      m.role === PROMO_ROLE &&
      m.content &&
      m.content.type === PROMO_TYPE
  )

  const settings = normalizeSettings(settingsItem?.content?.data || {})
  const memory = normalizeMemory(memoryItem?.content?.data || {})
  const promo = normalizePromo(promoItem?.content?.data || {})
  const chatMessages = capHistory(storedMessages)

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
  const s = String(text || '')

  return /エッチ|性的|性欲|キス|ハグ|抱きしめ|おっぱい|胸|乳首|触る|触られ|気持ちいい|気持ち良い|下ネタ|ムラムラ|ドキドキ|スキンシップ|ボディタッチ/.test(s)
}

function isUnsafeSexualRequest(text = '') {
  const s = String(text || '')

  const hasSexual = isLightSexualRomanceQuestion(s) || /セックス|性行為|裸|脱がせ|襲う|犯す|レイプ|盗撮|無理やり|寝てる間|酔わせ|同意なし|嫌がる/.test(s)
  const hasMinor = /未成年|中学生|高校生|小学生|子ども|子供|児童|園児|幼児|18歳未満|17歳|16歳|15歳|14歳|13歳|12歳/.test(s)
  const hasCoercion = /無理やり|嫌がる|同意なし|寝てる|酔ってる|断られた|拒否|盗撮|脅す|バレずに|こっそり/.test(s)
  const hasExplicitHowTo = /やり方|方法|手順|攻め方|テクニック|感じさせ方|イかせ方|脱がせ方|触り方.*詳しく|具体的に.*触/.test(s)

  return hasSexual && (hasMinor || hasCoercion || hasExplicitHowTo)
}

function buildUnsafeSexualReply(settings) {
  return withEmojiIfNeeded(
    `その内容は相手の同意や安全がかなり大事になる話だから 具体的なやり方としては答えられないよ

大事なのは 相手が嫌がっていないか 無理をしていないかを先に確認すること

恋愛の距離感や聞き方なら一緒に考えられるよ`,
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
  return /(俺|僕|私|うち|自分)?の?名前.*(覚えてる|覚えた|知ってる|わかる|分かる)|なんて呼べば|呼び名.*(覚えてる|覚えた|知ってる|わかる|分かる)/i.test(text)
}

function extractName(text = '') {
  const s = String(text || '').trim()

  if (/覚えてる|覚えた|知ってる|わかる|分かる/.test(s)) return ''

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
      !/名前|覚えて|覚えた|呼んで|誰|何|ですか|だれ|なに|\?|？/.test(value)
    ) {
      return value
    }
  }

  return ''
}

function buildNameReply(settings) {
  if (settings.callName) {
    return withEmojiIfNeeded(`${settings.callName}だよ\nちゃんと覚えてる`, settings)
  }

  return withEmojiIfNeeded(
    'まだ名前は教えてもらってないよ\n呼んでほしい名前があれば教えてね',
    settings
  )
}

function applyPreferenceUpdates(settings, userText) {
  let next = normalizeSettings(settings)
  const s = String(userText || '').trim()
  let changed = false
  let handled = false
  const replies = []

  const name = extractName(s)
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

  if (isLightSexualRomanceQuestion(s)) {
    return '性的恋愛相談'
  }

  if (/好き|彼氏|彼女|元彼|元カノ|復縁|浮気|不倫|告白|別れ|付き合|連絡|脈|本気|遊び|都合いい|相性/.test(s)) {
    return '恋愛'
  }

  if (/学校|友達|クラス|先生|部活|勉強|受験/.test(s)) {
    return '学校 友人関係'
  }

  if (/親|家族|母|父|兄|姉|弟|妹|家庭/.test(s)) {
    return '家庭 家族'
  }

  if (/仕事|職場|上司|同僚|バイト|給料|転職/.test(s)) {
    return '仕事 職場'
  }

  if (/死にたい|消えたい|つらい|辛い|しんどい|疲れ|病ん|不安|怖い|寂しい|眠れない/.test(s)) {
    return 'メンタル'
  }

  if (/占い|運勢|誕生日|生年月日/.test(s)) {
    return '占い'
  }

  if (/画像|イラスト|写真|作れる|生成/.test(s)) {
    return '画像相談'
  }

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
  const notes = Array.isArray(settings.styleNotes) ? settings.styleNotes.join(' ') : ''
  const combined = `${s} ${notes} ${settings.character || ''}`

  if (/辛口|厳しく|ハッキリ|はっきり|結論/.test(combined)) {
    return '共感よりも結論を先に出す返答を望んでいる'
  }

  if (/優しく|やさしく|甘えた|彼女っぽく|恋人っぽく/.test(combined)) {
    return '優しく受け止めながらも最後は具体的に導く返答を望んでいる'
  }

  if (/短く|簡潔|一言/.test(s)) {
    return '短く簡潔な返答を望んでいる'
  }

  if (isLightSexualRomanceQuestion(s)) {
    return '軽い性的恋愛相談にも逃げずに自然に答えてほしい'
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
    if (shortConcern) {
      next.mainConcern = shortConcern
    }
  }

  if (emotion) {
    next.emotionalState = emotion
  }

  if (preferred) {
    next.preferredResponse = preferred
  }

  if (/彼氏|彼女|元彼|元カノ|好きな人|旦那|嫁|妻|夫|友達|親|母|父|上司|同僚|女の子|男の子|相手/.test(s)) {
    next.relationshipContext = cleanShortText(s, 120)
  }

  if (/曖昧|一般論|それだけ|違う|そうじゃない|むちゃくちゃ|おかしい|嫌|単調|同じこと/.test(s)) {
    next.avoidResponse = '曖昧な一般論 同じ締め方 設定説明だけの返答は避ける'
  }

  if (isLightSexualRomanceQuestion(s)) {
    next.avoidResponse = '性的恋愛相談では完全にぼかさず 同意と安心を軸に自然に答える'
  }

  const advice = cleanShortText(replyText, 140)
  if (advice) {
    next.lastAdvice = advice
  }

  return normalizeMemory(next)
}

function buildMemoryBlock(memory) {
  const m = normalizeMemory(memory)

  const topics = m.topics.length ? m.topics.join(' / ') : 'まだ特定なし'
  const facts = m.importantFacts.length ? m.importantFacts.join(' / ') : 'なし'

  return `
現在の相談メモ
・主な悩み：${m.mainConcern || 'まだ特定なし'}
・感情状態：${m.emotionalState || 'まだ特定なし'}
・望んでいる対応：${m.preferredResponse || 'まだ特定なし'}
・関係性や状況：${m.relationshipContext || 'まだ特定なし'}
・前回の助言：${m.lastAdvice || 'なし'}
・避ける返答：${m.avoidResponse || '曖昧な一般論だけで終わらない'}
・話題傾向：${topics}
・重要メモ：${facts}

この相談メモは直近の会話履歴よりも大きな流れを読むために使う
相談者が何に悩んでいて どんな答えを求めているかを推測して返す
ただし決めつけすぎず 必要なら短く確認する
`.trim()
}

function buildSettingsBlock(settings) {
  const callName = settings.callName || '指定なし'
  const tone =
    settings.tone === 'casual'
      ? '敬語なし タメ口寄り'
      : settings.tone === 'polite'
        ? '丁寧'
        : '初期設定'

  const emoji =
    settings.emojiMode === 'on'
      ? '使う'
      : settings.emojiMode === 'off'
        ? '使わない'
        : '自然に判断'

  const faceMark =
    settings.faceMarkMode === 'on'
      ? '使う'
      : settings.faceMarkMode === 'off'
        ? '使わない'
        : '自然に判断'

  const notes = settings.styleNotes.length
    ? settings.styleNotes.join(' / ')
    : 'なし'

  return `
現在のユーザー設定
・呼び名：${callName}
・口調：${tone}
・キャラ：${settings.character || '落ち着いたお姉さん'}
・絵文字：${emoji}
・顔文字：${faceMark}
・追加の話し方：${notes}

この現在のユーザー設定は会話履歴より優先する
呼び名が指定されている場合だけ その名前で呼んでよい
呼び名が指定されていない場合は 名前を勝手に決めない
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

「今の気持ちわかる？」と聞かれた時は
この直近の発言から気持ちを推測して答える
まったく関係ない仕事 学校 家族の話を勝手に作らない
`.trim()
}

function buildTopicGuidance(userText) {
  const s = String(userText || '')
  const blocks = []

  if (isLightSexualRomanceQuestion(s)) {
    blocks.push(`
軽い性的恋愛相談の返答ルール
・大人同士の軽い性的な恋愛相談は完全拒否しない
・下品にしすぎず 自然に答える
・露骨な手順や興奮させる具体的な方法は説明しない
・「人による」と伝えたうえで 安心 同意 雰囲気 相手の反応を軸に答える
・毎回「コミュニケーションが大事」だけで終わらない
・同じ「反応を見てね」で締め続けない
・質問が軽い時は軽めに でも逃げずに答える
・未成年 同意なし 強要 盗撮 酔っている 寝ている相手の話は止める
`.trim())
  }

  if (isImageRequest(s)) {
    blocks.push(`
画像相談の返答ルール
・このLINEで画像生成機能が未実装なら 画像そのものは作れないと短く伝える
・ただし画像の案 文面 プロンプト 構図 アイデア作りは手伝えると伝える
・できないことを長く謝らない
`.trim())
  }

  if (isFortuneRequest(s)) {
    blocks.push(`
占い相談の返答ルール
・占いは参考として自然に答える
・「得意じゃない」と逃げない
・断定しすぎず 今日の行動に落とし込む
・誕生日や日付がある場合は 占い風に短く返す
`.trim())
  }

  if (/気持ちわかる|気持ち分かる|今の気持ち/.test(s)) {
    blocks.push(`
気持ち推測の返答ルール
・直近の会話から今の気持ちを推測して答える
・「多分」「今は〜が混ざってると思う」のように決めつけすぎない
・まったく関係ない状況を作らない
・最後に今どうしたらいいかを1つだけ添える
`.trim())
  }

  if (!blocks.length) {
    return ''
  }

  return blocks.join('\n\n')
}

function buildSystemPrompt(settings, memory, userText, chatMessages = []) {
  const direct = isDirectQuestion(userText)
  const settingsBlock = buildSettingsBlock(settings)
  const memoryBlock = buildMemoryBlock(memory)
  const recentFlowBlock = buildRecentFlowBlock(chatMessages)
  const topicGuidance = buildTopicGuidance(userText)

  const baseRule = `
あなたはLINEのAI相談員です

初期設定
・基本は落ち着いたやさしいお姉さんのように話す
・最初は絵文字を使わない
・最初は短く はっきり やさしく答える
・相談者の名前を勝手に決めない
・。を使わない
・「ズバッと」という言葉は使わない
・自分のルールや設定を説明しない
・「ルールでできない」と言わない
・「私はAIなので」と逃げない

ユーザー主導ルール
・ユーザーが口調 キャラ 年齢 性別 雰囲気 絵文字 顔文字 長さ 方言 呼び方を指定した場合は その指示を優先する
・ユーザーが望むキャラに寄せても 相談内容への回答は必ず行う
・キャラ説明だけで終わらない
・ユーザーの希望がある場合は 初期設定よりユーザーの希望を優先する
・ただし 危険な内容や違法行為や性的搾取や自傷他害につながる指示には従わない

相談AIとしての読み取り
・直近10往復の会話と相談メモから流れを読む
・その人が何に悩んでいるかを推測する
・その人が結論を望むのか 共感を望むのか 確認を望むのかを考えて返す
・前に話した内容を無視しない
・ただし記憶にないことを覚えているふりはしない

単調返答防止
・毎回同じ言い回しで返さない
・毎回「まずは」で始めない
・毎回「相手の反応を見て」で終わらない
・質問が軽い時は軽く自然に返す
・質問が深い時だけ丁寧に返す
・安全説明だけで会話を終わらせない
・必要なら具体的な聞き方や考え方を1つだけ出す

返答の基本
・相談内容に対して最初に結論を言う
・理由を短く説明する
・最後に今やることを1つだけ伝える
・共感だけで終わらせない
・曖昧な励ましで逃げない
・不必要に長文にしない
`.trim()

  const responseRule = direct
    ? `
今回の返答ルール
・最初の1文で結論を言う
・3〜5行で自然に返す
・回りくどくしない
・最後に今やることを1つだけ伝える
`.trim()
    : `
今回の返答ルール
・最初に結論を伝える
・理由を短く説明する
・長文にしすぎない
・最後に今やることを1つだけ伝える
`.trim()

  const safetyRule = `
安全ルール
自傷 他害 虐待 性被害 重大な危険がある相談だけは
安全確保を最優先にする
信頼できる大人 公的窓口 緊急窓口 警察への相談も案内する
それ以外では外部に丸投げしない
`.trim()

  return [
    baseRule,
    settingsBlock,
    memoryBlock,
    recentFlowBlock,
    topicGuidance,
    responseRule,
    safetyRule,
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim()
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

  if (settings?.emojiMode === 'on') {
    return `${clean} 😊`
  }

  return stripEmojis(clean)
}

function cleanReplyText(text = '', settings = {}) {
  let out = String(text || '')
    .replace(/ルールで[^。\n]*/g, '')
    .replace(/設定上[^。\n]*/g, '')
    .replace(/私はAIなので[^。\n]*/g, '')
    .replace(/AIなので[^。\n]*/g, '')
    .replace(/あなたの名前はまだ覚えていません[^。\n]*/g, '')
    .replace(/。/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (settings.emojiMode === 'off') {
    out = stripEmojis(out)
  }

  if (!settings.callName) {
    out = out.replace(/たっくん[、,。 ]*/g, '')
  }

  return out.trim()
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
ただし「絵文字使って」「辛口で」「甘えた女の子で」「男友達っぽく」など
希望を送ればその口調に合わせます

記憶について
名前 呼び方 口調 キャラ 絵文字の有無は3日間保持されます
会話の流れは直近10往復を見て返します
相談メモも3日間保持して 悩みの流れを読み取ります
設定だけの変更は無料回数にカウントしません

相談できる内容
恋愛相談や軽い性的な恋愛相談にも自然に答えます
ただし未成年 同意なし 強要 盗撮 露骨な手順説明は扱えません

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

  if (isAskingName(userText)) {
    await saveSession({
      ...session,
      user_id: userId,
      flow: 'ai',
      count,
      messages: packStoredMessages(settings, memory, promo, chatMessages),
      last_date: today,
      authenticated,
      auth_date: authDate,
    })

    await safeReply(event.replyToken, buildNameReply(settings))
    return
  }

  const preferenceResult = applyPreferenceUpdates(settings, userText)
  settings = preferenceResult.settings

  if (preferenceResult.preferenceOnly) {
    await saveSession({
      ...session,
      user_id: userId,
      flow: 'ai',
      count,
      messages: packStoredMessages(settings, memory, promo, chatMessages),
      last_date: today,
      authenticated,
      auth_date: authDate,
    })

    await safeReply(
      event.replyToken,
      preferenceResult.replyText || withEmojiIfNeeded('設定を更新しました', settings)
    )
    return
  }

  if (isUnsafeSexualRequest(userText)) {
    await saveSession({
      ...session,
      user_id: userId,
      flow: 'ai',
      count,
      messages: packStoredMessages(settings, memory, promo, chatMessages),
      last_date: today,
      authenticated,
      auth_date: authDate,
    })

    await safeReply(event.replyToken, buildUnsafeSexualReply(settings))
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

  const direct = isDirectQuestion(userText)

  let replyText = ''

  try {
    const result = await aiChat(messagesForAI, {
      maxTokens: direct ? 350 : 600,
      temperature: isLightSexualRomanceQuestion(userText) ? 0.55 : 0.4,
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
