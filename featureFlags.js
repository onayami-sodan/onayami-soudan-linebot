// featureFlags.js（暫定：AI=OPEN、手相＆恋愛=準備中）
// 必要に応じて true/false を切り替えて使える簡易フラグ
const flags = { ai: true, palm: true, renai: true } // 全部動かすなら全部 true

export async function isOpen(key) {
  return !!flags[key]
}
export async function setOpen(key, val) {
  flags[key] = !!val
}

