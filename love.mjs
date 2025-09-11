/*
 =========================
   love.mjs（完全版フル｜TXT作成→Supabase保存→署名URL→LINEはボタン式のみ送信｜ベタURL禁止）
   - 署名付きURLは console.log のみ（ユーザーには出さない）
   - LINEには Flex の「ダウンロード」ボタン＋ファイル名だけを送る
   - 日本語などを含むファイル名を ASCII セーフ化
   - ストレージバケットが無ければ自動作成
   - 表示テキストからの（）除去ユーティリティを同梱
 =========================
*/

import { safeReply, push } from './lineClient.js'
import { supabase } from './supabaseClient.js'
import { QUESTIONS } from './questions.js'
import { messagingApi } from '@line/bot-sdk'
import { sendSignedFileCard } from './fileDelivery.mjs'

/* =========================
   定数
   ========================= */
const SESSION_TABLE = 'user_sessions'
const LINE_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN
const ANSWERS_BUCKET = 'answers'

/* =========================
   ユーティリティ
   ========================= */
function asciiSafe(str) {
  return str.replace(/[^\x00-\x7F]/g, '_')
}

function stripParens(text) {
  return text.replace(/[()（）]/g, '')
}

/* =========================
   質問応答処理
   ========================= */
export async function handleLove(userId, replyToken, text) {
  // セッション取得
  let { data: session, error } = await supabase
    .from(SESSION_TABLE)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('session fetch error:', error)
    return
  }

  // セッションがなければ新規作成
  if (!session) {
    session = { user_id: userId, flow: 'PRICE', answers: [] }
    await supabase.from(SESSION_TABLE).insert(session)
  }

  // フロー制御
  switch (session.flow) {
    case 'PRICE': {
      // 支払い案内
      await safeReply(replyToken, [
        {
          type: 'text',
          text: '💘 恋愛診断書のご案内\n\nフル診断 3,980円（税込）\n学生支援プラン 1,500円（税込）\n相性診断 2,980円（税込）\n\n承諾される方は「承諾」と入力してください',
        },
      ])
      await supabase
        .from(SESSION_TABLE)
        .update({ flow: 'WAIT_CONSENT' })
        .eq('user_id', userId)
      return
    }

    case 'WAIT_CONSENT': {
      if (/承諾/.test(text)) {
        await safeReply(replyToken, [
          { type: 'text', text: '性別を教えてください（男性／女性）' },
        ])
        await supabase
          .from(SESSION_TABLE)
          .update({ flow: 'GENDER' })
          .eq('user_id', userId)
      } else {
        await safeReply(replyToken, [
          { type: 'text', text: 'キャンセルしました' },
        ])
        await supabase
          .from(SESSION_TABLE)
          .update({ flow: 'IDLE' })
          .eq('user_id', userId)
      }
      return
    }

    case 'GENDER': {
      session.gender = text.trim()
      await supabase
        .from(SESSION_TABLE)
        .update({ gender: session.gender, flow: 'AGE' })
        .eq('user_id', userId)
      await safeReply(replyToken, [
        { type: 'text', text: '年代を教えてください（10代／20代／30代…）' },
      ])
      return
    }

    case 'AGE': {
      session.age = text.trim()
      await supabase
        .from(SESSION_TABLE)
        .update({ age: session.age, flow: 'Q1' })
        .eq('user_id', userId)
      // 最初の質問
      const q = QUESTIONS[0]
      await safeReply(replyToken, [
        {
          type: 'text',
          text: `Q1. ${stripParens(q.question)}`,
          quickReply: {
            items: q.options.map((opt, i) => ({
              type: 'action',
              action: {
                type: 'message',
                label: stripParens(opt),
                text: `Q1-${i + 1}`,
              },
            })),
          },
        },
      ])
      return
    }

    default: {
      // Q{n}-{answer}
      if (/^Q(\d+)-(\d+)$/.test(text)) {
        const [, qNumStr, ansStr] = text.match(/^Q(\d+)-(\d+)$/)
        const qNum = parseInt(qNumStr)
        const ansIdx = parseInt(ansStr) - 1
        const q = QUESTIONS[qNum - 1]

        if (!q) {
          await safeReply(replyToken, [
            { type: 'text', text: '質問が見つかりませんでした' },
          ])
          return
        }

        // 回答を保存
        session.answers = session.answers || []
        session.answers[qNum - 1] = stripParens(q.options[ansIdx])
        await supabase
          .from(SESSION_TABLE)
          .update({ answers: session.answers })
          .eq('user_id', userId)

        // 次の質問 or 完了
        if (qNum < QUESTIONS.length) {
          const nextQ = QUESTIONS[qNum]
          await safeReply(replyToken, [
            {
              type: 'text',
              text: `Q${qNum + 1}. ${stripParens(nextQ.question)}`,
              quickReply: {
                items: nextQ.options.map((opt, i) => ({
                  type: 'action',
                  action: {
                    type: 'message',
                    label: stripParens(opt),
                    text: `Q${qNum + 1}-${i + 1}`,
                  },
                })),
              },
            },
          ])
        } else {
          // 全部終わったらTXT化して保存
          const content = [
            `ユーザーID: ${userId}`,
            `性別: ${session.gender || ''}`,
            `年代: ${session.age || ''}`,
            '',
            ...QUESTIONS.map((q, i) => {
              const ans = session.answers[i] || ''
              return `Q${i + 1}. ${stripParens(q.question)}\nA: ${ans}`
            }),
          ].join('\n')

          const fileName = asciiSafe(`love_${userId}_${Date.now()}.txt`)
          const filePath = `${userId}/${fileName}`

          // バケット存在確認→なければ作成
          const { data: buckets } = await supabase.storage.listBuckets()
          if (!buckets.find((b) => b.name === ANSWERS_BUCKET)) {
            await supabase.storage.createBucket(ANSWERS_BUCKET, {
              public: false,
            })
          }

          // アップロード
          const { error: uploadError } = await supabase.storage
            .from(ANSWERS_BUCKET)
            .upload(filePath, new Blob([content]), {
              upsert: true,
              contentType: 'text/plain',
            })

          if (uploadError) {
            console.error('upload error:', uploadError)
            await safeReply(replyToken, [
              { type: 'text', text: '保存に失敗しました' },
            ])
            return
          }

          // 署名付きURL作成
          const { data: signed, error: urlError } = await supabase.storage
            .from(ANSWERS_BUCKET)
            .createSignedUrl(filePath, 60 * 60 * 24 * 7)

          if (urlError) {
            console.error('signedUrl error:', urlError)
            await safeReply(replyToken, [
              { type: 'text', text: 'リンク作成に失敗しました' },
            ])
            return
          }

          const signedUrl = signed.signedUrl

          // ユーザーにはFlexボタン式のみ送信（ベタURLは出さない）
          await sendSignedFileCard(userId, {
            signedUrl,
            fileName,
            validDays: 7,
            afterText:
              '🌸 回答控えを受け取りました 恋愛診断書は順番に作成しているので48時間以内にお届けするね',
          })

          // フロー終了
          await supabase
            .from(SESSION_TABLE)
            .update({ flow: 'DONE' })
            .eq('user_id', userId)
        }
      }
    }
  }
}
