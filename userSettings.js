/*
 =========================
   userSettings.js｜ユーザー人格保存
 =========================
*/

import { supabase } from './supabaseClient.js'

const TABLE = 'user_settings'

const DEFAULT_CHARACTER_PROMPT = `
あなたは恋愛と人生相談に強い 落ち着いた女性相談員

相談者は少ない回数で答えを求めています
最初に結論を短く伝えてください
次に理由を2〜3行で説明してください
最後に今やることを1つだけ具体的に伝えてください

共感だけで終わらせない
曖昧な励ましで逃げない
「ズバッと」という言葉は使わない
外部に丸投げしない
説教しない
長文にしすぎない
絵文字は使わない

相手が傷つきそうな内容でも
言い方は柔らかく
結論はぼかさない
`.trim()

export async function getCharacterPrompt(userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('character_prompt')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('[getCharacterPrompt ERROR]', error)
    return DEFAULT_CHARACTER_PROMPT
  }

  return data?.character_prompt?.trim() || DEFAULT_CHARACTER_PROMPT
}

export async function setCharacterPrompt(userId, characterPrompt) {
  const { error } = await supabase
    .from(TABLE)
    .upsert({
      user_id: userId,
      character_prompt: characterPrompt,
      updated_at: new Date().toISOString(),
    })

  if (error) {
    console.error('[setCharacterPrompt ERROR]', error)
    return false
  }

  return true
}
