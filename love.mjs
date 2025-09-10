import { safeReply, push } from './lineClient.js'
import { supabase } from './supabaseClient.js'
import { QUESTIONS } from './questions.js'
import { messagingApi } from '@line/bot-sdk'

const SESSION_TABLE = 'user_sessions'
const LINE_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN

const LOVE_TRIGGERS = ['恋愛診断', '恋診断', 'ラブ診断', '診断書', 'love', 'LOVE']
const GENDER_OPTIONS = ['男性', '女性', 'その他']
const AGE_OPTIONS = ['10代未満','10代','20代','30代','40代','50代','60代','70代以上']

;(() => {
  const n = QUESTIONS?.length || 0
  const last = QUESTIONS?.[n - 1]
  console.log('[QUESTIONS] count=', n, ' last.id=', last?.id, ' last.choices.len=', last?.choices?.length)
})()

const LOVE_INTRO_TEXT = [
  '💘 恋愛診断書（40問）ご案内',
  '',
  'あなたの「恋のクセ」「相性の傾向」「距離感の取り方」を、40問の直感テストで読み解きます',
  '結果は読みやすいレポート形式でお届け',
  '',
  'おすすめ：片思い/復縁/結婚の迷いを整理・同じ失敗の要因を把握・魅力や“刺さる距離感”を知って関係を進めたい方に',
  '',
  'わかること：恋愛タイプ・依存/尽くしサイン・連絡/デート頻度の最適解・つまずきやすい場面と回避・相手タイプ別アプローチ',
  '',
  '🧭 進み方（選択式）',
  '1) 承諾 → 2) プロフィール入力 → 3) Q1〜Q40を4択で回答 → 4) レポートお届け',
  '所要時間：5〜8分（途中離脱OK）',
  '',
  '📄 お届け内容：総合タイプ判定、強み/つまずき、今すぐの一歩、相手タイプ別の距離の縮め方、セルフケア',
  '💳 料金：通常9,800円(税込）が✨今だけ 3,980円（税込）✨',
  '⏱ 目安：48時間以内',
  '🔐 プライバシー：診断以外の目的では利用しません',
  '',
  '💳 お支払い方法',
  '・PayPay',
  '・クレジットカード（Visa / Master / JCB / AMEX など）',
  '・携帯キャリア決済（SoftBank / au / docomo）',
  '・PayPal',
  '',
  '✅ 進める場合は「承諾」を押してね（キャンセル可）',
]

function cleanForUser(str=''){
  return String(str)
    .replace(/（[^）]*）/g,'')
    .replace(/\([^)]*\)/g,'')
    .replace(/\s+/g,' ')
    .trim()
}
function splitChunks(text, size=4500){
  const out=[]; for(let i=0;i<text.length;i+=size) out.push(text.slice(i,i+size)); return out
}
async function replyThenPush(userId, replyToken, bigText){
  const chunks = splitChunks(bigText, 4500)
  await safeReply(replyToken, chunks[0])
  for (let i=1;i<chunks.length;i++) await push(userId, chunks[i])
}
async function getLineDisplayName(userId){
  try{
    if(!LINE_ACCESS_TOKEN||!userId) return ''
    const client = new messagingApi.MessagingApiClient({ channelAccessToken: LINE_ACCESS_TOKEN })
    const prof = await client.getProfile(userId)
    return prof?.displayName || ''
  }catch{ return '' }
}
const isQButton = (txt) => /^Q(\d+)[-: ]?([1-4])$/.test(txt)
function toNumericId(id){
  return Number(String(id).replace(/\D/g,'')) || 0
}

function buildIntroButtonsFlex(){
  return {
    type:'flex', altText:'恋愛診断を開始しますか？',
    contents:{ type:'bubble', size:'mega',
      body:{ type:'box', layout:'vertical', spacing:'lg', paddingAll:'20px', contents:[
        { type:'text', text:'進める場合は「承諾」を押してね', size:'md', wrap:true, weight:'bold' },
        { type:'box', layout:'horizontal', spacing:'md', margin:'lg', contents:[
          { type:'button', style:'primary', color:'#4CAF50', height:'md', action:{ type:'message', label:'承諾', text:'承諾' } },
          { type:'button', style:'secondary', height:'md', action:{ type:'message', label:'💌 はじめの画面へ', text:'トークTOP' } },
        ] },
      ] },
      styles:{ body:{ backgroundColor:'#FFF9FB' } },
    },
  }
}
function buildQuestionFlex(q){
  const circled = ['①','②','③','④']
  const qText = cleanForUser(q.text)
  const choiceLabels = q.choices.map(c=>cleanForUser(c))
  const numericId = toNumericId(q.id)
  return {
    type:'flex', altText:`Q${q.id}. ${qText}`,
    contents:{ type:'bubble', size:'mega',
      body:{ type:'box', layout:'vertical', spacing:'lg', paddingAll:'20px', contents:[
        { type:'text', text:`Q${q.id}. ${qText}`, wrap:true, weight:'bold', size:'md' },
        ...choiceLabels.map((label,i)=>([
          { type:'button', style:'primary', height:'sm', color:'#F59FB0',
            action:{ type:'message', label:`${circled[i]} ${label}`, text:`Q${numericId}-${i+1}` } },
          { type:'separator', margin:'md', color:'#FFFFFF00' },
        ])).flat(),
      ] },
      styles:{ body:{ backgroundColor:'#FFF9FB' } },
    },
  }
}
function buildFinalConfirmFlex(){
  return {
    type:'flex', altText:'診断書作成の最終確認',
    contents:{ type:'bubble', size:'mega',
      body:{ type:'box', layout:'vertical', spacing:'lg', paddingAll:'20px', contents:[
        { type:'text', text:'診断書の作成には 3,980円（税込）が必要です', wrap:true, weight:'bold' },
        { type:'text', text:'承諾する場合は［承諾］、やめる場合は［💌 はじめの画面へ］を押してね', wrap:true, size:'sm' },
        { type:'box', layout:'horizontal', spacing:'md', margin:'lg', contents:[
          { type:'button', style:'primary', color:'#4CAF50', height:'md', action:{ type:'message', label:'承諾', text:'承諾' } },
          { type:'button', style:'secondary', height:'md', action:{ type:'message', label:'💌 はじめの画面へ', text:'トークTOP' } },
        ] },
      ] },
      styles:{ body:{ backgroundColor:'#FFF9FB' } },
    },
  }
}

export async function sendLove40Intro(event){
  const userId = event.source?.userId
  if (userId) await setSession(userId, { flow:'love40', love_step:'PRICE', love_idx:0 })
  await safeReply(event.replyToken, LOVE_INTRO_TEXT.join('\n'))
  if (userId) await push(userId, buildIntroButtonsFlex())
}

export async function handleLove(event){
  if (!(event.type==='message' && event.message?.type==='text')) return
  const userId = event.source?.userId
  if (!userId) return

  const raw = (event.message.text||'').trim().normalize('NFKC')
  const t  = raw
  const tn = raw.replace(/\s+/g,'')
  const trigger = LOVE_TRIGGERS.includes(tn)

  const s0 = await loadSession(userId)

  // flow guard
  if (s0?.flow !== 'love40' && !trigger) return

  // duplicate guard
  const msgId = event.message?.id || ''
  if (s0?.last_msg_id === msgId) return
  await setSession(userId, { last_msg_id: msgId })

  if (trigger && s0?.flow !== 'love40'){
    await setSession(userId, { flow:'love40', love_step:'PRICE', love_idx:0 })
    await sendLove40Intro(event)
    return
  }

  const s = s0 || { user_id:userId, flow:'love40', love_step:'PRICE', love_idx:0 }

  // ===== PRICE =====
  if (s?.love_step === 'PRICE'){
    if (tn==='承諾' || /^(ok|はい)$/i.test(tn)){
      await setSession(userId, { flow:'love40', love_step:'PROFILE_GENDER', love_profile:{}, love_answers:[], love_idx:0, love_answered_map:{} })
      await safeReply(event.replyToken, {
        type:'flex', altText:'性別を選んでね',
        contents:{ type:'bubble', size:'mega',
          body:{ type:'box', layout:'vertical', spacing:'lg', paddingAll:'20px', contents:[
            { type:'text', text:'性別を選んでね', weight:'bold', size:'md' },
            ...GENDER_OPTIONS.map(label=>([
              { type:'button', style:'primary', height:'sm', color:'#B39DDB', action:{ type:'message', label, text:label } },
              { type:'separator', margin:'md', color:'#FFFFFF00' },
            ])).flat(),
            { type:'button', style:'secondary', height:'md', action:{ type:'message', label:'💌 はじめの画面へ', text:'トークTOP' } },
          ] },
        },
      })
      return
    }
    if (tn==='キャンセル'){
      await setSession(userId, { flow:'idle', love_step:null, love_idx:null })
      await safeReply(event.replyToken, 'またいつでもどうぞ🌿')
      return
    }

    if (GENDER_OPTIONS.includes(tn)){
      await setSession(userId, { flow:'love40', love_step:'PROFILE_AGE', love_profile:{ gender:t } })
      await sendAgeFlex(event); return
    }
    if (AGE_OPTIONS.includes(tn)){
      const newSession = { flow:'love40', love_step:'Q', love_profile:{ gender:'(未選択)', age:t }, love_idx:0, love_answers:[], love_answered_map:{} }
      await setSession(userId, newSession)
      await sendNextLoveQuestion(event, { ...s, ...newSession }); return
    }
    if (isQButton(tn)){
      const newSession = { flow:'love40', love_step:'Q', love_profile:s.love_profile || { gender:'(未選択)' }, love_idx:0, love_answers:[], love_answered_map:{} }
      await setSession(userId, newSession)
      await sendNextLoveQuestion(event, { ...s, ...newSession }); return
    }

    await safeReply(event.replyToken, LOVE_INTRO_TEXT.join('\n'))
    await push(userId, buildIntroButtonsFlex())
    return
  }

  // ===== PROFILE_GENDER =====
  if (s?.love_step === 'PROFILE_GENDER'){
    if (!GENDER_OPTIONS.includes(tn)){
      await safeReply(event.replyToken, {
        type:'flex', altText:'性別を選んでね',
        contents:{ type:'bubble',
          body:{ type:'box', layout:'vertical', spacing:'md',
            contents:GENDER_OPTIONS.map(label=>({
              type:'button', style:'primary', height:'sm', color:'#B39DDB', action:{ type:'message', label, text:label }
            }))
          }
        }
      })
      return
    }
    await setSession(userId, { flow:'love40', love_step:'PROFILE_AGE', love_profile:{ ...(s.love_profile||{}), gender:t } })
    await sendAgeFlex(event); return
  }

  // ===== PROFILE_AGE =====
  if (s?.love_step === 'PROFILE_AGE'){
    if (isQButton(tn)){
      const newSession = { flow:'love40', love_step:'Q', love_profile:s.love_profile || {}, love_idx:0, love_answers:[], love_answered_map:{} }
      await setSession(userId, newSession)
      await sendNextLoveQuestion(event, { ...s, ...newSession }); return
    }
    if (!AGE_OPTIONS.includes(tn)){ await sendAgeFlex(event); return }
    const newSession = { flow:'love40', love_step:'Q', love_profile:{ ...(s.love_profile||{}), age:t }, love_idx:0, love_answers:[], love_answered_map:{} }
    await setSession(userId, newSession)
    await sendNextLoveQuestion(event, { ...s, ...newSession }); return
  }

  // ===== Q =====
  if (s?.love_step === 'Q'){
    if (GENDER_OPTIONS.includes(tn) || AGE_OPTIONS.includes(tn)){ await sendNextLoveQuestion(event, s); return }

    const idx = Number.isInteger(s.love_idx) ? s.love_idx : 0
    const currentQ = QUESTIONS[idx]
    if (!currentQ){ await sendNextLoveQuestion(event, s); return }

    const answeredMap = s.love_answered_map || {}

    let pick=null, qid=null
    const m = /^Q(\d+)[-: ]?([1-4])$/.exec(tn)
    if (m){ qid=Number(m[1]); pick=m[2] }
    else{
      const circled = { '①':'1','②':'2','③':'3','④':'4','１':'1','２':'2','３':'3','４':'4' }
      let cand=tn; if (circled[cand]) cand=circled[cand]
      if (/^[1-4]$/.test(cand)) pick=cand
      else{
        const pos = currentQ.choices?.findIndex(c => cleanForUser(c)===t || cleanForUser(c)===tn || c===t)
        if (pos>=0) pick=String(pos+1)
      }
      qid = toNumericId(currentQ.id)
    }

    const currentNumericId = toNumericId(currentQ.id)
    if (qid!==currentNumericId || !/^[1-4]$/.test(pick)){
      await sendNextLoveQuestion(event, s); return
    }

    // 既に回答済みならハングせず次の設問を再提示
    if (answeredMap[String(currentNumericId)]){
      await sendNextLoveQuestion(event, s)
      return
    }

    const answers=[...(s.love_answers||[]), pick]
    const nextIdx=idx+1
    const nextMap={ ...answeredMap, [String(currentNumericId)]:true }

    await setSession(userId, { flow:'love40', love_step:'Q', love_answers:answers, love_idx:nextIdx, love_answered_map:nextMap })

    if (!QUESTIONS[nextIdx]){
      await setSession(userId, { flow:'love40', love_step:'CONFIRM_PAY' })
      await safeReply(event.replyToken,
        '🧾 最終確認\nこのあとの「診断書の作成・納品」には **3,980円（税込）** が必要です\n承諾する場合は［承諾］、やめる場合は［💌 はじめの画面へ］を押してね'
      )
      await push(userId, buildFinalConfirmFlex())
      return
    }

    await sendNextLoveQuestion(event, { ...s, love_answers:answers, love_idx:nextIdx, love_answered_map:nextMap })
    return
  }

  // ===== CONFIRM_PAY =====
  if (s?.love_step === 'CONFIRM_PAY'){
    if (tn==='承諾' || /^(ok|はい)$/i.test(tn)){
      await sendAnswersAsTextAndNotice(event, s)
      await setSession(userId, { flow:'idle', love_step:'DONE' })
      return
    }
    if (tn==='トークTOP'){
      await setSession(userId, { flow:'idle', love_step:null, love_idx:null })
      await safeReply(event.replyToken, 'はじめの画面に戻るね💌')
      return
    }
    await safeReply(event.replyToken,
      '🧾 最終確認\nこのあとの「診断書の作成・納品」には **3,980円（税込）** が必要です\n承諾する場合は［承諾］、やめる場合は［💌 はじめの画面へ］を押してね'
    )
    await push(userId, buildFinalConfirmFlex())
    return
  }

  await safeReply(event.replyToken, '続きが止まってしまったみたい…「恋愛診断」と送ると最初からやり直せるよ🌸')
}

async function sendAgeFlex(event){
  await safeReply(event.replyToken, {
    type:'flex', altText:'年代を選んでね',
    contents:{ type:'bubble', size:'mega',
      body:{ type:'box', layout:'vertical', spacing:'lg', paddingAll:'20px', contents:[
        { type:'text', text:'年代を選んでね', weight:'bold', size:'md' },
        ...AGE_OPTIONS.map(label=>([
          { type:'button', style:'primary', height:'sm', color:'#81D4FA', action:{ type:'message', label, text:label } },
          { type:'separator', margin:'md', color:'#FFFFFF00' },
        ])).flat(),
      ] },
    },
  })
}

async function sendNextLoveQuestion(event, session){
  const idx = Number.isInteger(session.love_idx) ? session.love_idx : 0
  if (idx >= (QUESTIONS?.length||0)){
    const userId = event.source?.userId
    await setSession(userId, { flow:'love40', love_step:'CONFIRM_PAY' })
    await safeReply(event.replyToken,
      '🧾 最終確認\nこのあとの「診断書の作成・納品」には **3,980円（税込）** が必要です\n承諾する場合は［承諾］、やめる場合は［💌 はじめの画面へ］を押してね'
    )
    await push(userId, buildFinalConfirmFlex())
    return true
  }
  await safeReply(event.replyToken, buildQuestionFlex(QUESTIONS[idx]))
  return false
}

async function sendAnswersAsTextAndNotice(event, session){
  const userId = event.source?.userId
  const nickname = await getLineDisplayName(userId)
  const profile  = session.love_profile || {}
  const answers  = session.love_answers || []

  const lines=[]
  lines.push('=== 恋愛診断 回答控え ===')
  lines.push(`LINEニックネーム: ${nickname || '(取得できませんでした)'}`)
  lines.push(`性別: ${profile.gender || '(未設定)'}`)
  lines.push(`年代: ${profile.age || '(未設定)'}`)
  lines.push(`回答数: ${answers.length}`)
  lines.push('')
  for (let i=0;i<QUESTIONS.length;i++){
    const q=QUESTIONS[i]; const a=answers[i]; const ai=a?Number(a)-1:-1
    const qText=cleanForUser(q.text)
    const choiceText = ai>=0 ? cleanForUser(q.choices[ai]) : '(未回答)'
    lines.push(`Q${q.id}. ${qText}`)
    lines.push(`→ 回答: ${a || '-'} : ${choiceText}`)
    lines.push('')
  }
  await replyThenPush(userId, event.replyToken, lines.join('\n'))
  await push(userId, '💌 ありがとう！回答を受け取ったよ\n48時間以内に「恋愛診断書」のURLをLINEでお届けするね\n順番に作成しているので、もうちょっと待っててね💛')
}

// ===== Session I/O =====
// ★ 最新行を必ず取得して「Q1に戻る」を防止
async function loadSession(userId){
  const { data, error } = await supabase
    .from(SESSION_TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending:false })
    .limit(1)
    .maybeSingle()

  if (error) console.error('loadSession error:', error)
  return data || null
}
async function setSession(userId, patch){
  if (!userId) return
  await supabase.from(SESSION_TABLE).upsert(
    { user_id:userId, ...patch, updated_at:new Date().toISOString() },
    { onConflict:'user_id' }
  )
}
