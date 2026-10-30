// Small UI helpers shared by every page.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
export const $ = (sel, root = document) => root.querySelector(sel)
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]
export const PLACEHOLDER_IMG = 'assets/img/placeholder.svg'
export const imgOnError = `this.onerror=null;this.src='${PLACEHOLDER_IMG}'`

const toDate = (iso) => new Date(String(iso).replace(' ', 'T'))
export function fmtDateTime(iso) {
  if (!iso) return ''
  const d = toDate(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) + ' • ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
export const fmtDay = (iso) => (iso ? toDate(iso).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '')
export const isPast = (iso) => toDate(iso).getTime() < Date.now()

export const STATUS_STYLES = {
  approved: 'bg-emerald-100 text-emerald-700', completed: 'bg-emerald-100 text-emerald-700', valid: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-700', rejected: 'bg-red-100 text-red-700', failed: 'bg-red-100 text-red-700', used: 'bg-gray-200 text-gray-600',
}
export const badge = (status, label) =>
  `<span class="${STATUS_STYLES[status] || 'bg-gray-100 text-gray-600'} px-2 py-0.5 rounded-md text-[10px] font-bold uppercase whitespace-nowrap">${esc(label || status)}</span>`

export function setBusy(btn, busy, busyLabel = 'Please wait…') {
  if (!btn) return
  if (busy) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i><span>${busyLabel}</span>` }
  else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label }
}

export function emptyState(icon, title, text, action = '') {
  return `<div class="col-span-full text-center py-12 px-4 space-y-3">
    <div class="w-14 h-14 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto"><i class="fas ${icon} text-xl"></i></div>
    <h3 class="font-bold text-gray-900 text-sm">${esc(title)}</h3>
    <p class="text-xs text-gray-500 max-w-sm mx-auto">${text}</p>${action}</div>`
}

export function toast(message, type = 'success') {
  const root = $('#toast-root')
  const icon = type === 'error' ? 'fa-exclamation-circle' : type === 'info' ? 'fa-info-circle' : 'fa-check-circle'
  const color = type === 'error' ? 'bg-red-600' : type === 'info' ? 'bg-gray-900' : 'bg-emerald-600'
  const el = document.createElement('div')
  el.className = `toast ${color} text-white text-xs font-bold pl-4 pr-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 max-w-sm`
  el.setAttribute('role', type === 'error' ? 'alert' : 'status')
  el.innerHTML = `<i class="fas ${icon}"></i><span>${esc(message)}</span>`
  root.appendChild(el)
  setTimeout(() => el.remove(), type === 'error' ? 6000 : 3500)
}

// Opens `html` in a centred modal. Closes on backdrop click or Esc. Returns { el, close }.
let openCount = 0
export function openModal(html, { onClose, wide = false } = {}) {
  const root = $('#modal-root')
  const previouslyFocused = document.activeElement
  const el = document.createElement('div')
  el.className = 'fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto'
  el.setAttribute('role', 'dialog')
  el.setAttribute('aria-modal', 'true')
  el.innerHTML = `<div class="pop-in bg-white rounded-3xl ${wide ? 'max-w-2xl' : 'max-w-md'} w-full my-8 shadow-2xl border border-red-100 relative">${html}</div>`
  root.appendChild(el)
  document.body.classList.add('modal-open'); openCount++

  const close = (result) => {
    if (!el.isConnected) return
    el.remove(); document.removeEventListener('keydown', onKey)
    if (--openCount <= 0) { openCount = 0; document.body.classList.remove('modal-open') }
    previouslyFocused?.focus?.()
    onClose?.(result)
  }
  const onKey = (e) => { if (e.key === 'Escape') close() }
  document.addEventListener('keydown', onKey)
  el.addEventListener('mousedown', (e) => { if (e.target === el) close() })
  el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close() })
  ;(el.querySelector('[autofocus], input, button') || el).focus?.()
  return { el, close }
}

export const closeButton = `<button type="button" data-close aria-label="Close" class="absolute top-4 right-4 text-gray-400 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-full w-8 h-8 flex items-center justify-center transition"><i class="fas fa-times text-xs"></i></button>`

export function confirmBox({ title, body, confirmText = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const m = openModal(`<div class="p-6 space-y-4">
      <h3 class="text-lg font-black text-gray-900">${esc(title)}</h3>
      <p class="text-xs text-gray-500 leading-relaxed">${body}</p>
      <div class="flex gap-3 pt-2">
        <button data-close class="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 rounded-xl text-xs transition">Cancel</button>
        <button data-ok class="flex-1 ${danger ? 'bg-slate-900 hover:bg-black' : 'bg-red-600 hover:bg-red-700'} text-white font-bold py-3 rounded-xl text-xs transition">${esc(confirmText)}</button>
      </div></div>`, { onClose: (r) => resolve(r === true) })
    m.el.querySelector('[data-ok]').addEventListener('click', () => m.close(true))
  })
}

export const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms) } }

export function renderQR(el, text, size = 120) {
  el.innerHTML = ''
  if (window.QRCode) new QRCode(el, { text, width: size, height: size })
  else el.innerHTML = `<span class="font-mono text-xs">${esc(text)}</span>`
}
