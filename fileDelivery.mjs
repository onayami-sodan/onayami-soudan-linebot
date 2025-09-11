/*
 =========================
   fileDelivery.mjs（LINE：ベタURL禁止＋Flexボタン固定）
   - ユーザーには必ず「ダウンロード」ボタンのFlexだけを送る
   - 署名付きURLはログにだけ残す（ユーザーへは非表示）
   - 7日/48時間などの文言は引数で指定可（デフォルト7日）
   - 送信後の案内テキストも同時送信
 =========================
*/

import { messagingApi } from '@line/bot-sdk'

/** Messaging API Client を生成（既存の環境変数を使用） */
const LINE_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN
export const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: LINE_ACCESS_TOKEN,
})

/**
 * 署名付きURLをユーザーへ配布する
 * ベタURLは送らず、Flexのボタンのみで配布する
 *
 * @param {string} userId - 送信先のLINEユーザーID
 * @param {object} opts
 * @param {string} opts.signedUrl - Supabaseの署名付きURL
 * @param {string} opts.fileName  - 例: "maruhada_40q_2025-09-11_xx.txt"
 * @param {number} [opts.validDays=7] - ダウンロード期限の表示用
 * @param {string} [opts.afterText] - ボタンの後に送る案内テキスト
 */
export async function sendSignedFileCard(userId, {
  signedUrl,
  fileName,
  validDays = 7,
  afterText = '受け取りありがとう 恋愛診断書は順番に作成しているので48時間以内にお届けするね'
}) {
  if (!signedUrl || !fileName) {
    throw new Error('signedUrl と fileName は必須だよ')
  }

  // 署名付きURLは運営側のログにだけ残す（ユーザーへは送らない）
  console.log('[signedUrl-for-log]', { userId, fileName, signedUrl })

  // Flex メッセージ本体（緑の「ダウンロード」ボタン）
  const flex = {
    type: 'flex',
    altText: `回答控え（TXT）: ${fileName}`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: '📂 回答控え（TXT）', weight: 'bold', size: 'md' },
          { type: 'text', text: `${validDays}日間有効のダウンロードリンクを発行しました`, size: 'sm', wrap: true, color: '#666666' },
          {
            type: 'button',
            style: 'primary',
            action: { type: 'uri', label: 'ダウンロード', uri: signedUrl },
          },
          {
            type: 'text',
            text: fileName,
            size: 'xs',
            color: '#999999',
            wrap: true,
            margin: 'md'
          }
        ],
      },
      styles: { body: { separator: false } },
    },
  }

  // まずFlexを送る
  await lineClient.pushMessage({
    to: userId,
    messages: [flex],
  })

  // 続けて案内テキストを送る（ここでもURLは出さない）
  if (afterText) {
    await lineClient.pushMessage({
      to: userId,
      messages: [{ type: 'text', text: afterText }],
    })
  }
}

/*
 =========================
   使い方（既存コードの置き換え例）
   例）love.mjs などで署名付きURLとファイル名を作った後に：
   await sendSignedFileCard(userId, {
     signedUrl,              // Supabase で生成した署名付きURL
     fileName,               // 生成したTXTのファイル名
     validDays: 7,           // 表示用（任意）
     afterText: '受け取りありがとう 恋愛診断書は順番に作成しているので48時間以内にお届けするね'
   })
 =========================
*/
