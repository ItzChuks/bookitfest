import { pb, errMsg } from './pb.js'
import { fmt, toUSD, currencyLabel } from './state.js'
import { esc, fmtDateTime, fmtDay, badge, setBusy, toast, confirmBox, openModal, closeButton, $ } from './ui.js'

const ROLE_STYLES = { admin: 'bg-indigo-100 text-indigo-700', vendor: 'bg-red-100 text-red-700', user: 'bg-gray-100 text-gray-600' }
const TX = { deposit: 'Deposit', withdrawal: 'Withdrawal', ticket: 'Event Ticket Pass', ticket_sale: 'Ticket Sale', lucky_entry: 'Lucky Entry', lucky_win: 'Lucky Win', refund: 'Refund', adjustment: 'Admin Credit' }
const TIER = { early: 'Early Bird', regular: 'Regular', vip: 'VIP' }

const tile = (label, value, sub = '') => `<div class="bg-gray-50 border border-gray-100 rounded-2xl p-3"><span class="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">${label}</span><span class="text-base font-black text-gray-900 block mt-0.5">${value}</span>${sub ? `<span class="text-[10px] text-gray-400 font-semibold">${sub}</span>` : ''}</div>`

/**
 * Opens the profile of one account for an admin: details, totals, recent activity and an
 * "add funds" form. `onBalance(userId, newBalanceUSD)` lets the caller refresh its own lists.
 */
export async function openUserProfile(userId, { onBalance } = {}) {
  const m = openModal(`${closeButton}<div id="up" class="p-6 sm:p-8"><div class="skeleton h-40 rounded-2xl"></div></div>`, { wide: true })
  let data = null

  const paint = () => {
    const { user: u, stats: s } = data
    const vendor = u.role === 'vendor'
    $('#up', m.el).innerHTML = `
      <div class="flex items-center gap-4 pr-10">
        <div class="w-14 h-14 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center text-xl font-black shrink-0" aria-hidden="true">${esc((u.name || u.email || '?').trim().charAt(0).toUpperCase())}</div>
        <div class="min-w-0"><h3 class="text-xl font-black text-gray-900 truncate">${esc(u.name || 'Unnamed account')}</h3>
          <p class="text-xs text-gray-500 break-all">${esc(u.email)}</p>
          <p class="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase"><span class="${ROLE_STYLES[u.role] || ROLE_STYLES.user} px-2 py-0.5 rounded-md">${esc(u.role)}</span>
            <span class="${u.verified ? 'text-emerald-600' : 'text-gray-400'}"><i class="fas ${u.verified ? 'fa-circle-check' : 'fa-circle-minus'} mr-1"></i>${u.verified ? 'Email verified' : 'Not verified'}</span>
            <span class="text-gray-400 normal-case font-semibold">Joined ${esc(fmtDay(u.created))}</span></p></div></div>

      <div class="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="col-span-2 bg-gray-900 rounded-2xl p-4 text-white"><span class="text-[10px] font-bold uppercase tracking-wider text-red-300 block">Wallet balance</span><span class="text-2xl font-black block mt-0.5" id="up-balance">${fmt(u.balance)}</span></div>
        ${tile('Tickets', String(s.tickets), 'bought')}
        ${vendor ? tile('Events', String(s.events), s.salesEarned ? `${fmt(s.salesEarned)} earned` : 'listed') : tile('Deposited', fmt(s.deposited), `${s.depositCount} top-up${s.depositCount === 1 ? '' : 's'}`)}
        ${vendor ? tile('Deposited', fmt(s.deposited), `${s.depositCount} top-up${s.depositCount === 1 ? '' : 's'}`) : ''}
        ${tile('Withdrawn', fmt(s.withdrawn), s.withdrawalPending ? `${fmt(s.withdrawalPending)} pending` : 'paid out')}
        ${s.credited ? tile('Admin credits', fmt(s.credited), 'added by admins') : ''}
      </div>

      <form id="up-credit" class="mt-5 bg-emerald-50/60 border border-emerald-100 rounded-2xl p-4 space-y-3" novalidate>
        <h4 class="text-xs font-extrabold text-gray-900 uppercase tracking-wider"><i class="fas fa-plus-circle text-emerald-600 mr-1.5"></i>Add funds to wallet</h4>
        <div class="grid sm:grid-cols-[10rem_1fr] gap-3">
          <div><label class="block text-[10px] font-bold text-gray-500 uppercase mb-1" for="up-amount">Amount (${esc(currencyLabel())})</label>
            <input id="up-amount" type="number" min="0" step="any" inputmode="decimal" class="field" placeholder="0.00"></div>
          <div><label class="block text-[10px] font-bold text-gray-500 uppercase mb-1" for="up-note">Reason (shown to the user)</label>
            <input id="up-note" type="text" maxlength="150" class="field" placeholder="e.g. Bank transfer received manually"></div></div>
        <p id="up-err" class="hidden text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2" role="alert"></p>
        <button type="submit" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-3 rounded-xl transition flex items-center gap-2">Add funds</button></form>

      <div class="mt-6 grid md:grid-cols-2 gap-5">
        <section><h4 class="text-xs font-extrabold text-gray-900 uppercase tracking-wider mb-2">Recent wallet activity</h4>
          ${data.transactions.length ? `<ul class="divide-y divide-gray-100 border border-gray-100 rounded-2xl overflow-hidden">${data.transactions.map((t) => `<li class="px-3 py-2.5 flex items-start justify-between gap-3 text-xs">
            <div class="min-w-0"><span class="font-bold text-gray-800 block">${esc(TX[t.type] || t.type)}${t.status === 'pending' ? ' <span class="text-amber-600">(pending)</span>' : t.status === 'failed' ? ' <span class="text-red-600">(rejected)</span>' : ''}</span>
              <span class="text-[10px] text-gray-400 block truncate" title="${esc(t.note)}">${esc(t.note || t.method)}</span><span class="text-[10px] text-gray-300">${esc(fmtDateTime(t.created))}</span></div>
            <span class="font-bold whitespace-nowrap ${t.amount > 0 ? 'text-emerald-600' : 'text-gray-800'}">${t.amount > 0 ? '+' : '−'}${fmt(Math.abs(t.amount))}</span></li>`).join('')}</ul>` : '<p class="text-xs text-gray-400 border border-dashed border-gray-200 rounded-2xl p-4 text-center">No wallet activity yet.</p>'}</section>
        <section><h4 class="text-xs font-extrabold text-gray-900 uppercase tracking-wider mb-2">Recent tickets</h4>
          ${data.tickets.length ? `<ul class="divide-y divide-gray-100 border border-gray-100 rounded-2xl overflow-hidden">${data.tickets.map((t) => `<li class="px-3 py-2.5 flex items-start justify-between gap-3 text-xs">
            <div class="min-w-0"><span class="font-bold text-gray-800 block truncate">${esc(t.event)}</span><span class="text-[10px] text-gray-400">${esc(TIER[t.tier] || t.tier)} • ${esc(t.code)}</span></div>
            <span class="shrink-0">${badge(t.status === 'used' ? 'completed' : 'approved', t.status)}</span></li>`).join('')}</ul>` : '<p class="text-xs text-gray-400 border border-dashed border-gray-200 rounded-2xl p-4 text-center">No tickets bought yet.</p>'}</section></div>`
    $('#up-credit', m.el).onsubmit = submit
  }

  const submit = async (ev) => {
    ev.preventDefault()
    const err = $('#up-err', m.el), btn = $('#up-credit button[type=submit]', m.el)
    const fail = (t) => { err.textContent = t; err.classList.remove('hidden') }
    err.classList.add('hidden')
    const shown = Number($('#up-amount', m.el).value), note = $('#up-note', m.el).value.trim()
    const usd = Math.round(toUSD(shown) * 100) / 100
    if (!(shown > 0) || !(usd >= 0.01)) return fail('Enter an amount greater than zero.')
    if (note.length < 3) return fail('Add a short reason. The user will see it in their history.')
    const name = data.user.name || data.user.email
    if (!(await confirmBox({ title: 'Add funds?', body: `${fmt(usd)} will be added to ${name}'s wallet right away. This can't be undone from here.`, confirmText: `Add ${fmt(usd)}` }))) return
    setBusy(btn, true, 'Adding…')
    try {
      const r = await pb.send(`/api/bkf/admin/users/${userId}/credit`, { method: 'POST', body: { amount: usd, note } })
      toast(`${fmt(r.amount)} added to ${name}'s wallet.`)
      onBalance?.(userId, r.balance)
      data = await pb.send(`/api/bkf/admin/users/${userId}`)
      paint()
    } catch (e) { fail(errMsg(e)); setBusy(btn, false) }
  }

  try { data = await pb.send(`/api/bkf/admin/users/${userId}`); paint() }
  catch (e) { $('#up', m.el).innerHTML = `<p class="text-sm font-semibold text-red-600 py-6 text-center">${esc(errMsg(e))}</p>` }
}
