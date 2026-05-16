/*
 =========================
   featureFlags.js｜サービスON/OFF管理
 =========================
*/

import { supabase } from './supabaseClient.js'

const TABLE = 'service_status'

export async function isOpen(service) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('status')
    .eq('service', service)
    .maybeSingle()

  if (error) {
    console.error('[isOpen ERROR]', error)
    return true
  }

  return data?.status !== 'preparing'
}

export async function setOpen(service, open) {
  const { error } = await supabase
    .from(TABLE)
    .upsert({
      service,
      status: open ? 'active' : 'preparing',
      updated_at: new Date().toISOString(),
    })

  if (error) {
    console.error('[setOpen ERROR]', error)
  }
}
