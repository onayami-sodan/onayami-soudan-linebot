// /services/featureFlags.js
import { supabase } from './supabaseClient.js'

const TABLE = 'service_status' // Supabaseに作るテーブル名

// サービスが利用可能か確認
export async function isOpen(service) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('status')
    .eq('service', service)
    .maybeSingle()

  if (error) {
    console.error('isOpen error:', error)
    return false
  }
  return data?.status === 'active'
}

// サービスの状態をセット（true=active / false=preparing）
export async function setOpen(service, open) {
  const { error } = await supabase.from(TABLE).upsert({
    service,
    status: open ? 'active' : 'preparing',
    updated_at: new Date().toISOString(),
  })
  if (error) console.error('setOpen error:', error)
}
