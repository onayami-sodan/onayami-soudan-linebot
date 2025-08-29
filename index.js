// LINE Bot：セッション履歴保持つき 完全安定バージョン🌸（note 31件 + 誘導付き）
// 返事が来ない対策：OpenAI呼び出しを aiChat() に集約し、insufficient_quota 等でも必ず返信

require("dotenv").config()
const express = require("express")
const { messagingApi } = require("@line/bot-sdk")
const OpenAI = require("openai")
const { supabase } = require("./supabaseClient")
const { getCharacterPrompt } = require("./userSettings") // ← ここはimportだけ

const app = express()
app.use(express.json())

// OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini" // 必要なら env で gpt-4o に
const TEMPERATURE = Number(process.env.OPENAI_TEMPERATURE || 0.8)
const MAX_TOKENS = Number(process.env.OPENAI_MAX_TOKENS || 700)

// 共通：OpenAI呼び出しを安全に実行して、必ず text を返す
async function aiChat(messages) {
  try {
    const r = await openai.chat.completions.create({
      model: MODEL,
      messages,
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS,
    })
    const text = r.choices?.[0]?.message?.content?.trim() || "ご相談ありがとう"
    return { ok: true, text }
  } catch (e) {
    const type = e?.error?.type || e?.code || "unknown"
    const status = e?.status
    console.error("❌ OpenAI error:", status, type, e?.message)

    if (type === "insufficient_quota" || status === 429) {
      return {
        ok: false,
        type,
        text:
          "ごめんね いまシステムの利用枠が上限に達していて返信できないみたい 復旧まで少し時間をあけてまた話しかけてね🌷",
      }
    }
    return {
      ok: false,
      type,
      text: "通信が混み合っているみたい もう一度だけ送ってみてね🌷",
    }
  }
}

const line = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
})

// LINE返信を落ちないように包む
async function safeReply(replyToken, text) {
  try {
    await line.replyMessage({
      replyToken,
      messages: [{ type: "text", text }],
    })
  } catch (e) {
    console.error("❌ LINE返信エラー:", e?.status || "", e?.message || e)
  }
}

const ADMIN_SECRET = "azu1228"

// ---- note 一覧 ----
const noteList = [
  { password: "neko12", url: "https://note.com/noble_loris1361/n/nb55e92147e54" },
  { password: "momo34", url: "https://note.com/noble_loris1361/n/nfbd564d7f9fb" },
  { password: "yume56", url: "https://note.com/noble_loris1361/n/ndb8877c2b1b6" },
  { password: "riri07", url: "https://note.com/noble_loris1361/n/n306767c55334" },
  { password: "nana22", url: "https://note.com/noble_loris1361/n/nad07c5da665c" },
  { password: "hono11", url: "https://note.com/noble_loris1361/n/naa63e451ae21" },
  { password: "koko88", url: "https://note.com/noble_loris1361/n/nd60cdc5b729f" },
  { password: "rara15", url: "https://note.com/noble_loris1361/n/nd4348855021b" },
  { password: "chuu33", url: "https://note.com/noble_loris1361/n/na51ac5885f9e" },
  { password: "mimi19", url: "https://note.com/noble_loris1361/n/n6fbfe96dcb4b" },
  { password: "luna28", url: "https://note.com/noble_loris1361/n/n3c2e0e045a90" },
  { password: "peko13", url: "https://note.com/noble_loris1361/n/n6e0b6456ffcc" },
  { password: "yuki09", url: "https://note.com/noble_loris1361/n/nfcbd6eeb5dca" },
  { password: "toto77", url: "https://note.com/noble_loris1361/n/n9abc16c0e185" },
  { password: "puni45", url: "https://note.com/noble_loris1361/n/n20cfd0524de1" },
  { password: "kiki01", url: "https://note.com/noble_loris1361/n/nf766743a0c08" },
  { password: "susu66", url: "https://note.com/noble_loris1361/n/n1d1d57bf38f5" },
  { password: "hime03", url: "https://note.com/noble_loris1361/n/n2cac5b57d268" },
  { password: "pipi17", url: "https://note.com/noble_loris1361/n/nbf7974aabaca" },
  { password: "coco29", url: "https://note.com/noble_loris1361/n/nf8849ba3c59c" },
  { password: "roro04", url: "https://note.com/noble_loris1361/n/n477c92d85000" },
  { password: "momo99", url: "https://note.com/noble_loris1361/n/n332e40058be6" },
  { password: "nana73", url: "https://note.com/noble_loris1361/n/n5097160bee76" },
  { password: "lulu21", url: "https://note.com/noble_loris1361/n/nd10ed1ef8137" },
  { password: "meme62", url: "https://note.com/noble_loris1361/n/n4a344dce3a8c" },
  { password: "popo55", url: "https://note.com/noble_loris1361/n/nd7d8de167f37" },
  { password: "koro26", url: "https://note.com/noble_loris1361/n/n0fdf4edfa382" },
  { password: "chibi8", url: "https://note.com/noble_loris1361/n/n5eaea9b7c2ba" },
  { password: "mimi44", url: "https://note.com/noble_loris1361/n/n73b5584bf873" },
  { password: "lala18", url: "https://note.com/noble_loris1361/n/nc4db829308a4" },
  { password: "fufu31", url: "https://note.com/noble_loris1361/n/n2f5274805780" },
]

// ---- ユーティリティ ----
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

function isRecent(timestamp) {
  const now = Date.now()
  const diff = now - new Date(timestamp).getTime()
  return diff < 3 * 24 * 60 * 60 * 1000
}

// 🌐 Render スリープ対策
app.get("/ping", (req, res) => {
  res.status(200).send("pong")
})

// Webhook
app.post("/webhook", async (req, res) => {
  const events = req.body.events
  if (!events || events.length === 0) return res.status(200).send("No events")

  const today = getJapanDateString()
  const todayNote = getTodayNoteStable()

  for (const event of events) {
    try {
      if (event.type === "message" && event.message.type === "text") {
        const userId = event.source.userId
        const userMessage = event.message.text.trim()

        // キャラプロンプト
        const characterPersona = await getCharacterPrompt(userId)

        // Qが短答テンプレ対象か
        const needsShortAnswer = /どう思う|どうすれば|した方がいい|どうしたら|あり？|OK？|好き？|本気？/.test(
          userMessage
        )

        const systemPrompt = needsShortAnswer
          ? `${characterPersona}\n【ルール】以下を必ず守って答えて\n・結論を最初に出す（YES / NO / やめた方がいい など）\n・最大3行まで\n・回りくどい共感・曖昧表現は禁止\n・一度で終わる返答を意識`
          : characterPersona

        // 管理者パス
        if (userMessage === ADMIN_SECRET) {
          await safeReply(
            event.replyToken,
            `✨ 管理者モード\n本日(${today})のnoteパスワードは「${todayNote.password}」です\nURL：${todayNote.url}`
          )
          continue
        }

        // セッション読み込み
        let { data: session } = await supabase
          .from("user_sessions")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle()

        let count = 0,
          messages = [],
          greeted = false
        let lastDate = today,
          authenticated = false,
          authDate = null

        if (session) {
          const isSameDay = session.last_date === today
          const isRecentUpdate = isRecent(session.updated_at)

          count = isSameDay ? session.count || 0 : 0
          messages = isRecentUpdate ? session.messages || [] : []
          greeted = session.greeted || false
          lastDate = session.last_date || today
          authenticated = isSameDay ? session.authenticated || false : false
          authDate = isSameDay ? session.auth_date || null : null
        }

        // パスワード入力
        if (userMessage === todayNote.password) {
          await supabase.from("user_sessions").upsert({
            user_id: userId,
            count,
            messages,
            last_date: today,
            greeted,
            authenticated: true,
            auth_date: today,
            updated_at: new Date().toISOString(),
          })

          await safeReply(
            event.replyToken,
            "合言葉が確認できたよ☺️\n今日はずっとお話しできるからね💕"
          )
          continue
        }

        let replyText = ""
        let newCount = count + 1

        // プロンプト初回投入
        if (messages.length === 0 && !greeted) {
          messages.push({ role: "system", content: systemPrompt })
          greeted = true
        }

        // 会話分岐
        if (!authenticated) {
          if (count <= 3) {
            // 1〜4回目は通常回答
            messages.push({ role: "user", content: userMessage })
            const result = await aiChat(messages)
            if (result.ok) {
              messages.push({ role: "assistant", content: result.text })
              replyText = result.text
            } else {
              replyText = result.text
            }
          } else if (count === 4) {
            // 5回目は誘導付き回答
            messages.push({
              role: "user",
              content:
                `※この返信は100トークン以内で完結させてください。話の途中で終わらず、1〜2文でわかりやすくまとめてください。\n\n` +
                userMessage,
            })
            const result = await aiChat(messages)
            if (result.ok) {
              messages.push({ role: "assistant", content: result.text })
              replyText = `${result.text}\n\n明日になれば、またお話しできるよ🥰\n🌸 続けて話したい方はこちらから合言葉を入手してね☺️\n👉 ${todayNote.url} 🔑`
            } else {
              // 枠切れ等のときは誘導文は付けずにお詫びだけ返す
              replyText = result.text
            }
          } else {
            // 6回目以降は案内のみ
            replyText = `たくさんお話してくれてありがとうね☺️\n明日になれば、またお話しできるよ🥰\n🌸 続けて話したい方はこちらから合言葉を入手してね☺️\n👉 ${todayNote.url}`
          }
        } else {
          // 認証済みは無制限
          messages.push({ role: "user", content: userMessage })
          const result = await aiChat(messages)
          if (result.ok) {
            messages.push({ role: "assistant", content: result.text })
            replyText = result.text
          } else {
            replyText = result.text
          }
        }

        // セッション保存
        await supabase.from("user_sessions").upsert({
          user_id: userId,
          count: newCount,
          messages,
          last_date: today,
          greeted,
          authenticated,
          auth_date: authDate,
          updated_at: new Date().toISOString(),
        })

        await safeReply(event.replyToken, replyText)
      }
    } catch (err) {
      console.error("⚠️ Webhook処理エラー:", err)
      // 失敗しても他イベントには影響させない
    }
  }

  res.status(200).send("OK")
})

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`✅ LINEボットがポート ${port} で起動中`)
})
