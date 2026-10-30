import { pb } from './pb.js'
import { CONFIG } from './config.js'

// Tiny event bus: 'auth', 'currency', 'route', 'pending'
const subs = {}
export const bus = {
  on(evt, fn) { (subs[evt] ||= new Set()).add(fn); return () => subs[evt].delete(fn) },
  emit(evt, data) { subs[evt]?.forEach(fn => fn(data)) },
}

export const state = {
  currency: localStorage.getItem('bkf_currency') === 'NGN' ? 'NGN' : 'USD',
  sound: localStorage.getItem('bkf_sound') !== 'off',
  config: { luckyFeeUSD: 10, maxTicketsPerOrder: 10, simulatedPayments: false, stripeEnabled: false },
  serverOk: true,
}

export const me = () => (pb.authStore.isValid ? pb.authStore.record : null)
export const hasRole = (...roles) => roles.includes(me()?.role)

export function fmt(usd) {
  usd = Number(usd) || 0
  if (state.currency === 'NGN') return '₦' + Math.round(usd * CONFIG.NGN_RATE).toLocaleString('en-NG')
  return '$' + usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
// Amount typed in the selected currency -> USD
export const toUSD = (amount) => (state.currency === 'NGN' ? Number(amount) / CONFIG.NGN_RATE : Number(amount))
export const fromUSD = (usd) => (state.currency === 'NGN' ? Math.round(usd * CONFIG.NGN_RATE) : usd)
export const currencyLabel = () => (state.currency === 'NGN' ? 'NGN ₦' : 'USD $')

export function setCurrency(c) {
  state.currency = c === 'NGN' ? 'NGN' : 'USD'
  localStorage.setItem('bkf_currency', state.currency)
  bus.emit('currency')
}

export async function refreshMe() {
  if (!pb.authStore.isValid) return
  try { await pb.collection('users').authRefresh() }
  catch (e) { if (e.status === 401 || e.status === 403 || e.status === 404) pb.authStore.clear() }
}

pb.authStore.onChange(() => bus.emit('auth'))
