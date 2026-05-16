/*
 =========================
   dispatcher.mjs｜AI相談専用
 =========================
*/

import { handleAI } from './aiRouter.mjs'

export async function dispatchEvent(event) {
  try {
    await handleAI(event)
  } catch (e) {
    console.error('[DISPATCH ERROR]', e)
  }
}

export default dispatchEvent
