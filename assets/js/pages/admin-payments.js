import { pb, errMsg } from '../pb.js'
import { fmt, bus } from '../state.js'
import { $, esc, fmtDateTime, badge, setBusy, toast, openModal, closeButton, emptyState, debounce } from '../ui.js'

const PER_PAGE = 20
const TYPE_TABS = [['', 'All'], ['deposit', 'Deposits'], ['withdrawal', 'Withdrawals']]
const STATUSES = [['', 'All statuses'], ['pending', 'Pending'], ['completed', 'Completed'], ['failed', 'Failed / rejected']]

export default {
  title: 'Deposits & Withdrawals',
  render: () => `<div class="space-y-8"><div class="bg-white rounded-3xl p-5 sm:p-8 border border-red-100 shadow-xl space-y-6">
    <div class="border-b border-gray-100 pb-6 flex flex-wrap items-start justify-between gap-3">
      <div><span class="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">Super Admin Console</span>
        <h1 class="text-2xl sm:text-3xl font-black text-gray-900 mt-2">Deposits & Withdrawals</h1>
        <p class="text-xs text-gray-500 mt-1 max-w-2xl">Every wallet top-up and payout request on the site. Pay out withdrawals once you have sent the money, or reject them to return the funds to the user's wallet.</p></div>
      <a href="admin.html" class="text-xs font-bold text-gray-600 hover:text-red-600 border border-gray-200 hover:border-red-200 px-4 py-2.5 rounded-xl transition"><i class="fas fa-arrow-left mr-1.5"></i>Admin Console</a></div>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" id="p-stats">${[1, 2, 3, 4].map(() => '<div class="skeleton h-24 rounded-2xl"></div>').join('')}</div>

    <section class="space-y-4">
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex bg-gray-100 rounded-xl p-1 text-[11px] font-bold" id="p-types" role="tablist" aria-label="Transaction type">
          ${TYPE_TABS.map(([k, l]) => `<button type="button" role="tab" data-type="${k}" class="px-3 py-1.5 rounded-lg transition">${l}</button>`).join('')}</div>
        <label class="sr-only" for="p-status">Status</label>
        <select id="p-status" class="field !py-2 !w-auto text-xs font-bold">${STATUSES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
        <label class="sr-only" for="p-search">Search</label>
        <input id="p-search" type="search" placeholder="Search name, email or bank" class="field !py-2 !w-56">
        <button type="button" id="p-refresh" class="text-xs font-bold text-gray-600 hover:text-red-600 border border-gray-200 hover:border-red-200 px-3 py-2 rounded-xl transition" aria-label="Refresh"><i class="fas fa-sync-alt"></i></button></div>

      <div class="overflow-x-auto"><table class="w-full text-left text-xs table-stack">
        <thead class="bg-gray-50 text-gray-400 uppercase font-bold"><tr><th class="p-3">Date</th><th class="p-3">User</th><th class="p-3">Type</th><th class="p-3">Method / Bank</th><th class="p-3">Amount</th><th class="p-3">Status</th><th class="p-3 text-right">Action</th></tr></thead>
        <tbody class="divide-y divide-gray-100" id="p-rows"><tr><td colspan="7" class="p-6 text-center text-gray-400">Loading…</td></tr></tbody></table></div>

      <div class="flex items-center justify-between gap-3 text-xs">
        <span class="text-gray-400 font-semibold" id="p-pageinfo"></span>
        <div class="flex gap-2"><button type="button" id="p-prev" class="font-bold text-gray-600 border border-gray-200 hover:border-red-200 hover:text-red-600 px-4 py-2 rounded-xl transition disabled:opacity-40 disabled:pointer-events-none"><i class="fas fa-chevron-left mr-1.5"></i>Newer</button>
          <button type="button" id="p-next" class="font-bold text-gray-600 border border-gray-200 hover:border-red-200 hover:text-red-600 px-4 py-2 rounded-xl transition disabled:opacity-40 disabled:pointer-events-none">Older<i class="fas fa-chevron-right ml-1.5"></i></button></div></div>
    </section></div></div>`,

  async mount(ctx, root) {
    let data = null
    const f = { type: '', status: '', q: '', page: 1 }
    let seq = 0

    const stat = (label, value, sub, tone = 'bg-gray-50 border-gray-100', valueTone = 'text-gray-900', attrs = '') => `<${attrs ? 'button type="button" ' + attrs : 'div'} class="${tone} border rounded-2xl p-4 text-left ${attrs ? 'hover:shadow-md transition' : ''}">
      <span class="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">${label}</span><span class="text-xl sm:text-2xl font-black ${valueTone} block mt-1">${value}</span><span class="text-[11px] text-gray-500 font-semibold block mt-0.5">${sub}</span></${attrs ? 'button' : 'div'}>`
    const paintStats = () => {
      const s = data?.summary; if (!s) return
      const n = (c, w) => `${c} ${w}${c === 1 ? '' : 's'}`
      $('#p-stats', root).innerHTML =
        stat('Total deposited', fmt(s.depositsTotal), n(s.depositsCount, 'deposit'), 'bg-emerald-50 border-emerald-100', 'text-emerald-700') +
        stat('Awaiting payout', fmt(s.withdrawalsPendingTotal), s.withdrawalsPendingCount ? `${n(s.withdrawalsPendingCount, 'request')}. Tap to review` : 'Nothing waiting', s.withdrawalsPendingCount ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-100', s.withdrawalsPendingCount ? 'text-amber-700' : 'text-gray-900', 'data-quick="pending"') +
        stat('Paid out', fmt(s.withdrawalsPaidTotal), n(s.withdrawalsPaidCount, 'withdrawal')) +
        stat('Rejected', String(s.withdrawalsRejectedCount), s.withdrawalsRejectedCount === 1 ? 'withdrawal returned to wallet' : 'withdrawals returned to wallet')
    }

    const TYPE_LABEL = { deposit: 'Deposit', withdrawal: 'Withdrawal' }
    const paintRows = () => {
      const items = data?.items || []
      $('#p-rows', root).innerHTML = items.length ? items.map((t) => {
        const dep = t.type === 'deposit', amt = Math.abs(t.amount)
        const pending = !dep && t.status === 'pending'
        return `<tr class="hover:bg-gray-50/50">
          <td data-label="Date" class="p-3 text-gray-500 whitespace-nowrap">${esc(fmtDateTime(t.created))}</td>
          <td data-label="User" class="p-3 font-bold text-gray-900">${esc(t.user.name || '—')}<span class="block text-[11px] text-gray-400 font-normal break-all">${esc(t.user.email)}</span></td>
          <td data-label="Type" class="p-3"><span class="${dep ? 'text-emerald-700 bg-emerald-50' : 'text-indigo-700 bg-indigo-50'} px-2 py-0.5 rounded-md text-[10px] font-bold uppercase">${TYPE_LABEL[t.type] || esc(t.type)}</span></td>
          <td data-label="Method" class="p-3 text-gray-600">${esc(t.method)}${t.note ? `<span class="block text-[10px] text-gray-400">${esc(t.note)}</span>` : ''}</td>
          <td data-label="Amount" class="p-3 font-bold whitespace-nowrap ${dep ? 'text-emerald-600' : 'text-gray-900'}">${dep ? '+' : '−'}${fmt(amt)}</td>
          <td data-label="Status" class="p-3">${badge(t.status, !dep && t.status === 'failed' ? 'Rejected' : t.status)}</td>
          <td data-label="Action" class="p-3 text-right whitespace-nowrap">${pending
            ? `<button data-act="pay" data-id="${esc(t.id)}" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded text-[10px] font-bold transition">Mark paid</button>
               <button data-act="reject" data-id="${esc(t.id)}" class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded text-[10px] font-bold transition ml-1">Reject</button>`
            : '<span class="text-gray-300">—</span>'}</td></tr>`
      }).join('') : `<tr><td colspan="7">${emptyState('fa-receipt', 'Nothing here', f.type || f.status || f.q ? 'No deposits or withdrawals match these filters.' : 'Deposits and withdrawal requests will show up here as users make them.')}</td></tr>`
      $('#p-pageinfo', root).textContent = items.length ? `Page ${data.page}${data.hasMore ? '' : ' (last)'} • ${items.length} shown` : ''
      $('#p-prev', root).disabled = f.page <= 1
      $('#p-next', root).disabled = !data?.hasMore
    }
    const paintFilters = () => {
      root.querySelectorAll('[data-type]').forEach((b) => { const on = b.dataset.type === f.type; b.classList.toggle('bg-white', on); b.classList.toggle('shadow-sm', on); b.classList.toggle('text-gray-900', on); b.classList.toggle('text-gray-500', !on); b.setAttribute('aria-selected', on) })
      $('#p-status', root).value = f.status
    }

    const load = async () => {
      const my = ++seq
      try {
        const r = await pb.send('/api/bkf/admin/payments', { query: { type: f.type, status: f.status, q: f.q, page: f.page, perPage: PER_PAGE } })
        if (my !== seq) return
        data = r; paintStats(); paintRows()
      } catch (e) {
        if (my !== seq) return
        $('#p-rows', root).innerHTML = `<tr><td colspan="7" class="p-6 text-center text-red-600">${esc(errMsg(e))}</td></tr>`
      }
    }
    const setFilter = (patch) => { Object.assign(f, patch, { page: 1 }); paintFilters(); load() }

    // ---- Pay / reject dialogs ----
    const settle = (action, id) => {
      const t = data?.items.find((x) => x.id === id); if (!t) return
      const pay = action === 'pay'
      const m = openModal(`${closeButton}<form id="s-form" class="p-6 space-y-4">
        <div><h3 class="text-lg font-black text-gray-900 pr-8">${pay ? 'Mark as paid out' : 'Reject withdrawal'}</h3>
          <p class="text-xs text-gray-500 mt-1">${pay ? 'Only confirm after you have actually sent the money.' : 'The full amount goes straight back to the user\'s wallet and they see your reason.'}</p></div>
        <div class="bg-gray-50 border border-gray-200 rounded-2xl p-4 text-xs space-y-1">
          <div class="flex justify-between gap-3"><span class="text-gray-400 font-bold uppercase text-[10px]">User</span><span class="font-bold text-gray-900 text-right break-all">${esc(t.user.name || t.user.email)}</span></div>
          <div class="flex justify-between gap-3"><span class="text-gray-400 font-bold uppercase text-[10px]">Send to</span><span class="font-bold text-gray-900 text-right">${esc(t.method)}</span></div>
          <div class="flex justify-between gap-3"><span class="text-gray-400 font-bold uppercase text-[10px]">Amount</span><span class="font-black text-gray-900 text-right">${fmt(Math.abs(t.amount))}</span></div></div>
        <div><label class="block text-xs font-bold text-gray-700 mb-1" for="s-note">${pay ? 'Payment reference (optional)' : 'Reason *'}</label>
          <input class="field" id="s-note" maxlength="150" ${pay ? '' : 'required'} placeholder="${pay ? 'e.g. bank transfer ref 12345' : 'e.g. Account number is invalid'}" autofocus></div>
        <p id="s-err" class="hidden text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2" role="alert"></p>
        <div class="flex gap-3"><button type="button" data-close class="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 rounded-xl text-xs">Cancel</button>
          <button type="submit" class="flex-1 ${pay ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'} text-white font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-2">${pay ? 'Confirm paid' : 'Reject & refund'}</button></div></form>`)
      $('#s-form', m.el).onsubmit = async (ev) => {
        ev.preventDefault()
        const btn = $('button[type=submit]', m.el), err = $('#s-err', m.el); err.classList.add('hidden')
        setBusy(btn, true, pay ? 'Saving…' : 'Refunding…')
        try {
          await pb.send('/api/bkf/admin/withdrawal', { method: 'POST', body: { id, action, note: $('#s-note', m.el).value } })
          m.close(); toast(pay ? 'Marked as paid.' : 'Withdrawal rejected and refunded to the user.', pay ? 'success' : 'info'); load(); bus.emit('pending')
        } catch (e) { err.textContent = errMsg(e); err.classList.remove('hidden'); setBusy(btn, false) }
      }
    }

    root.querySelectorAll('[data-type]').forEach((b) => (b.onclick = () => setFilter({ type: b.dataset.type })))
    $('#p-status', root).onchange = (e) => setFilter({ status: e.target.value })
    $('#p-search', root).oninput = debounce((e) => setFilter({ q: e.target.value.trim() }), 250)
    $('#p-refresh', root).onclick = load
    $('#p-prev', root).onclick = () => { if (f.page > 1) { f.page--; load() } }
    $('#p-next', root).onclick = () => { if (data?.hasMore) { f.page++; load() } }
    const onClick = (e) => {
      if (e.target.closest('[data-quick]')) { $('#p-search', root).value = ''; return setFilter({ type: 'withdrawal', status: 'pending', q: '' }) }
      const b = e.target.closest('[data-act]'); if (b) settle(b.dataset.act, b.dataset.id)
    }
    root.addEventListener('click', onClick)
    paintFilters(); load()
    this._repaint = () => { paintStats(); paintRows() }
    return () => root.removeEventListener('click', onClick)
  },
  onCurrency() { this._repaint?.() },
}
