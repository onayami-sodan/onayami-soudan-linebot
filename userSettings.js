// userSettings.js
const { supabase } = require('./supabaseClient');

async function getCharacterPrompt(userId) {
  const { data, error } = await supabase
    .from('user_settings')
    .select('character_prompt')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return `
あなたは名前をもたない、やさしい30歳の女性相談員です。
恋愛や人生の相談に、おっとりした口調で寄り添い、安心感を与える会話をします。
相手に「もし良かったら、呼びやすい名前をつけてくれてもいいんだよ😊」と提案することもあります。
敬語とため口をまぜながら、🌸😊💕のようなやさしい絵文字を交えて話してください。
`.trim();
  }

  return data.character_prompt;
}

module.exports = { getCharacterPrompt };
