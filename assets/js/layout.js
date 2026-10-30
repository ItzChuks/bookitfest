import { pb, errMsg } from './pb.js'
import { state, bus, me, fmt, setCurrency, refreshMe } from './state.js'
import { $, $$, esc, openModal, closeButton, setBusy, toast } from './ui.js'
const go = (url) => { location.href = url }
const PAGE = () => document.body.dataset.page || ''
import { toggleSound } from './audio.js'

let pendingCount = 0
let menuOpen = false

const ON = 'px-3.5 py-2 rounded-xl text-xs font-bold text-red-600 bg-red-50 transition'
const OFF = 'px-3.5 py-2 rounded-xl text-xs font-bold text-gray-600 hover:text-red-600 hover:bg-red-50/50 transition'

function navItems() {
  const u = me()
  const items = [
    { href: 'events.html', icon: 'fa-calendar-alt', label: 'Events Marketplace', pages: ['events', 'event'] },
    { href: 'lucky.html', icon: 'fa-dice-five text-amber-500', label: 'Lucky 5 Games', pages: ['lucky'], pulse: true },
  ]
  if (!u || u.role !== 'user') items.push({ href: 'vendor.html', icon: 'fa-store text-red-500', label: u ? 'Vendor Dashboard' : 'Sell Tickets', pages: ['vendor'] })
  if (u?.role === 'admin') items.push({ href: 'admin.html', icon: 'fa-user-shield text-indigo-500', label: 'Admin Console', pages: ['admin'], badge: pendingCount })
  if (u) items.push({ href: 'wallet.html', icon: 'fa-wallet', label: 'My Wallet', pages: ['wallet'] })
  return items
}

function navLinks(page, mobile) {
  return navItems().map((i) => {
    const active = i.pages.includes(page)
    const cls = (active ? ON : OFF) + (mobile ? ' flex items-center py-3 text-sm' : ' relative')
    return `<a href="${i.href}" class="${cls}" ${active ? 'aria-current="page"' : ''}><i class="fas ${i.icon} mr-1.5"></i> ${i.label}
      ${i.pulse && !mobile ? '<span class="absolute -top-1 -right-1 flex h-2.5 w-2.5"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600"></span></span>' : ''}
      ${i.badge ? `<span class="ml-1 bg-red-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">${i.badge}</span>` : ''}</a>`
  }).join('')
}

const currencySwitch = () => {
  const on = 'px-2.5 py-1 text-[11px] font-extrabold rounded-lg bg-white text-gray-900 shadow-sm transition'
  const off = 'px-2.5 py-1 text-[11px] font-extrabold rounded-lg text-gray-500 hover:text-gray-900 transition'
  return `<div class="flex items-center bg-gray-100 p-1 rounded-xl border border-gray-200" role="group" aria-label="Currency">
    <button data-currency="USD" class="${state.currency === 'USD' ? on : off}">USD ($)</button>
    <button data-currency="NGN" class="${state.currency === 'NGN' ? on : off}">NGN (₦)</button></div>`
}
const soundBtn = () => `<button data-sound title="Toggle sound effects" aria-label="Toggle sound effects" class="w-9 h-9 rounded-xl bg-gray-100 hover:bg-red-50 text-gray-600 hover:text-red-600 flex items-center justify-center transition border border-gray-200"><i class="fas ${state.sound ? 'fa-volume-up' : 'fa-volume-mute'} text-xs"></i></button>`

function authControls(mobile) {
  const u = me()
  if (!u) return `<button data-auth="login" class="text-xs font-bold text-gray-700 hover:text-red-600 px-3 py-2 rounded-xl transition">Sign In</button>
    <button data-auth="register" class="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md shadow-red-200 transition">Get Started</button>`
  return `<a href="wallet.html" class="${mobile ? 'flex' : 'hidden sm:flex'} items-center bg-red-50 border border-red-200 px-3 py-1.5 rounded-2xl shadow-sm" title="Open wallet">
      <div class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse mr-2"></div>
      <span class="text-[10px] font-bold text-gray-500 uppercase mr-1">Balance:</span>
      <span class="text-xs font-extrabold text-red-600">${fmt(u.balance)}</span></a>
    <button data-logout class="text-xs font-bold text-gray-500 hover:text-red-600 px-3 py-2 rounded-xl border border-gray-200 hover:border-red-200 transition"><i class="fas fa-sign-out-alt mr-1"></i> Logout</button>`
}

export function renderHeader() {
  const path = PAGE()
  $('#site-header').innerHTML = `<header class="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-red-100 shadow-sm">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between h-16 sm:h-20 gap-3">
        <a href="index.html" class="flex items-center space-x-3 shrink-0" aria-label="Bookitfest home">
          <div class="w-10 h-10 rounded-2xl bg-gradient-to-tr from-red-600 to-red-700 flex items-center justify-center text-white shadow-md shadow-red-200"><i class="fas fa-ticket-alt text-xl transform -rotate-12"></i></div>
          <div><span class="text-2xl font-black tracking-tight text-gray-900">Bookit<span class="text-red-600">fest</span></span>
          <span class="block text-[9px] uppercase tracking-widest text-red-500 font-bold -mt-1">Multivendor & Games</span></div>
        </a>
        <nav class="hidden lg:flex items-center space-x-1" aria-label="Main">${navLinks(path, false)}</nav>
        <div class="flex items-center space-x-2 sm:space-x-3">
          <div class="hidden sm:block">${soundBtn()}</div>
          <div class="hidden sm:block">${currencySwitch()}</div>
          <div class="hidden md:flex items-center space-x-2">${authControls(false)}</div>
          <button data-menu aria-label="Menu" aria-expanded="${menuOpen}" class="lg:hidden w-10 h-10 rounded-xl bg-gray-100 hover:bg-red-50 text-gray-700 flex items-center justify-center border border-gray-200"><i class="fas ${menuOpen ? 'fa-times' : 'fa-bars'}"></i></button>
        </div>
      </div>
    </div>
    <div class="${menuOpen ? '' : 'hidden'} lg:hidden border-t border-gray-100 bg-white">
      <div class="max-w-7xl mx-auto px-4 py-3 space-y-1">${navLinks(path, true)}
        <div class="flex flex-wrap items-center gap-2 pt-3 mt-2 border-t border-gray-100">${currencySwitch()}${soundBtn()}</div>
        <div class="flex flex-wrap items-center gap-2 pt-2 md:hidden">${authControls(true)}</div>
      </div></div></header>`
}

export function renderFooter() {
  const u = me()
  $('#site-footer').innerHTML = `<footer class="bg-white border-t border-gray-200 pt-10 pb-8 mt-8"><div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
    <div class="flex flex-col sm:flex-row justify-between items-center border-b border-gray-100 pb-6 gap-4 text-center sm:text-left">
      <div><span class="text-2xl font-black text-gray-900">Bookit<span class="text-red-600">fest</span></span>
        <p class="text-xs text-gray-500 mt-1">Verified multivendor event passes and the Lucky 5 draw.</p></div>
      <nav class="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs font-bold text-gray-500" aria-label="Footer">
        <a href="events.html" class="hover:text-red-600">Events</a><a href="lucky.html" class="hover:text-red-600">Lucky 5</a>
        <a href="vendor.html" class="hover:text-red-600">Vendor Portal</a>${u?.role === 'admin' ? '<a href="admin.html" class="hover:text-red-600">Admin Dashboard</a>' : ''}</nav></div>
    <p class="text-[11px] text-gray-400 text-center">Lucky 5 is for adults aged 18 and over. Play responsibly. &copy; ${new Date().getFullYear()} Bookitfest Inc. All rights reserved.</p></div></footer>`
}

export async function refreshPending() {
  if (me()?.role !== 'admin') { pendingCount = 0; return }
  try { pendingCount = (await pb.collection('events').getList(1, 1, { filter: 'status = "pending"', fields: 'id' })).totalItems } catch { /* ignore */ }
  renderHeader()
}
bus.on('pending', refreshPending)

// ---- Auth modal ----
export function openAuth(mode = 'login', { next } = {}) {
  let isRegister = mode !== 'login'
  let role = mode === 'register-vendor' ? 'vendor' : 'user'
  let m
  const body = () => `${closeButton}<div class="p-6 sm:p-8">
    <div class="text-center space-y-2 mb-6">
      <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-red-600 to-red-700 flex items-center justify-center text-white shadow-md shadow-red-200 mx-auto"><i class="fas fa-ticket-alt text-2xl transform -rotate-12"></i></div>
      <h3 class="text-2xl font-black text-gray-900">${isRegister ? 'Create Your Account' : 'Sign In to Bookitfest'}</h3>
      <p class="text-xs text-gray-500">Access your vendor events, tickets & wallet</p></div>
    <form id="auth-form" class="space-y-4" novalidate>
      <div id="auth-error" class="hidden bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl px-4 py-3" role="alert"></div>
      ${isRegister ? `<div><label class="block text-xs font-bold text-gray-700 mb-1" for="auth-name">Full Name</label><input class="field" id="auth-name" name="name" autocomplete="name" placeholder="John Doe" required></div>` : ''}
      <div><label class="block text-xs font-bold text-gray-700 mb-1" for="auth-email">Email Address</label><input class="field" type="email" id="auth-email" name="email" autocomplete="email" placeholder="user@example.com" required autofocus></div>
      <div><label class="block text-xs font-bold text-gray-700 mb-1" for="auth-password">Password</label><input class="field" type="password" id="auth-password" name="password" autocomplete="${isRegister ? 'new-password' : 'current-password'}" placeholder="••••••••" minlength="8" required>
        ${isRegister ? '<p class="text-[11px] text-gray-400 mt-1">At least 8 characters.</p>' : ''}</div>
      ${isRegister ? `<div><label class="block text-xs font-bold text-gray-700 mb-1" for="auth-role">Account Type</label><select class="field" id="auth-role" name="role">
        <option value="user" ${role === 'user' ? 'selected' : ''}>Festival Goer / Lucky Player</option>
        <option value="vendor" ${role === 'vendor' ? 'selected' : ''}>Event Organizer (Vendor)</option></select></div>` : ''}
      <button type="submit" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-red-200 transition text-xs flex items-center justify-center space-x-2">
        <span>${isRegister ? 'Create Account' : 'Sign In & Access Portal'}</span><i class="fas fa-arrow-right text-xs"></i></button>
    </form>
    <div class="mt-6 text-center border-t border-gray-100 pt-4"><p class="text-xs text-gray-500">${isRegister ? 'Already have an account?' : "Don't have an account?"}
      <button type="button" data-toggle class="text-red-600 font-bold hover:underline">${isRegister ? 'Sign in' : 'Create one'}</button></p></div></div>`

  const wire = () => {
    $('[data-toggle]', m.el).onclick = () => { isRegister = !isRegister; m.el.firstElementChild.innerHTML = body(); wire() }
    const form = $('#auth-form', m.el)
    form.onsubmit = async (ev) => {
      ev.preventDefault()
      const fd = Object.fromEntries(new FormData(form))
      const err = $('#auth-error', m.el)
      const fail = (t) => { err.textContent = t; err.classList.remove('hidden') }
      err.classList.add('hidden')
      if (!fd.email || !fd.password) return fail('Enter your email and password.')
      if (isRegister && (!fd.name?.trim() || fd.password.length < 8)) return fail('Enter your name and a password of at least 8 characters.')
      const btn = $('button[type=submit]', form)
      setBusy(btn, true, isRegister ? 'Creating account…' : 'Signing in…')
      try {
        if (isRegister) {
          await pb.collection('users').create({ email: fd.email, password: fd.password, passwordConfirm: fd.password, name: fd.name.trim(), role: fd.role === 'vendor' ? 'vendor' : 'user', emailVisibility: true })
        }
        await pb.collection('users').authWithPassword(fd.email, fd.password)
        m.close()
        const u = me()
        toast(isRegister ? `Welcome to Bookitfest, ${u.name || 'friend'}!` : 'Signed in.')
        refreshPending()
        if (next) go(next)
        else if (isRegister && u.role === 'vendor') go('vendor.html')
      } catch (e) {
        setBusy(btn, false)
        fail(e.status === 400 && !isRegister ? 'Wrong email or password.' : errMsg(e))
      }
    }
  }
  m = openModal(body())
  wire()
}

export async function logout() {
  pb.authStore.clear()
  pendingCount = 0
  toast('Signed out.', 'info')
}

export function initLayout() {
  const rerender = () => { renderHeader(); renderFooter() }
  rerender()
  bus.on('auth', () => { refreshPending(); rerender() })
  bus.on('currency', renderHeader)
  bus.on('route', () => { menuOpen = false; renderHeader() })

  document.addEventListener('click', (e) => {
    const t = e.target
    const cur = t.closest('[data-currency]'); if (cur) return setCurrency(cur.dataset.currency)
    const auth = t.closest('[data-auth]'); if (auth) return openAuth(auth.dataset.auth)
    if (t.closest('[data-logout]')) return logout()
    if (t.closest('[data-sound]')) { toggleSound(); return renderHeader() }
    if (t.closest('[data-menu]')) { menuOpen = !menuOpen; return renderHeader() }
  })
  refreshPending()
}
export { refreshMe }
