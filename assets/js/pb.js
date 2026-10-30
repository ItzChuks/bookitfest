import PocketBase from 'https://cdn.jsdelivr.net/npm/pocketbase@0.25.2/dist/pocketbase.es.mjs'
import { CONFIG } from './config.js'

export const pb = new PocketBase(CONFIG.PB_URL)
pb.autoCancellation(false)

// Calls a custom Bookitfest route (see pb_hooks/main.pb.js), e.g. post('purchase', {...})
export const post = (path, body) => pb.send(`/api/bkf/${path}`, { method: 'POST', body })

// Turns a PocketBase error into one readable sentence.
export function errMsg(err) {
  const r = err?.response
  if (r?.data && Object.keys(r.data).length) {
    const [field, v] = Object.entries(r.data)[0]
    return `${field.replace(/_/g, ' ')}: ${v.message}`
  }
  if (r?.message) return r.message
  if (err?.status === 0) return "Can't reach the server. Check your connection and try again."
  return err?.message || 'Something went wrong. Try again.'
}

// PocketBase stores dates as "2026-11-15 18:00:00.000Z"
export const pbNow = () => new Date().toISOString().replace('T', ' ')
