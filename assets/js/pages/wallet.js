import { pb, post, errMsg, pbNow } from '../pb.js'
import { state, me, fmt, toUSD, fromUSD, currencyLabel, refreshMe, bus } from '../state.js'
import { TIER_NAMES } from '../components.js'
import { $, esc, fmtDay, fmtDateTime, badge, openModal, closeButton, setBusy, toast, emptyState, renderQR, isPast } from '../ui.js'

const TX = { deposit: 'Deposit', withdrawal: 'Withdrawal', ticket: 'Event Ticket Pass', ticket_sale: 'Ticket Sale', lucky_entry: 'Lucky Entry', lucky_win: 'Lucky Win' }

export default {
  title: 'My Wallet',
  render: () => `<div class="space-y-8">
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="bg-gradient-to-br from-red-600 to-red-800 text-white p-6 rounded-3xl shadow-xl space-y-4">
        <span class="text-[10px] font-bold uppercase tracking-widest text-red-200">Bookitfest Wallet</span>
        <div><p class="text-xs text-red-100">Available Balance</p><h1 class="text-3xl font-black" id="w-balance">${fmt(me()?.balance)}</h1></div>
        <div class="flex space-x-2 pt-2"><button data-act="deposit" class="flex-1 bg-white text-red-600 font-bold py-2.5 rounded-xl text-xs shadow-sm hover:bg-red-50 transition">Deposit</button>
          <button data-act="withdraw" class="flex-1 bg-black/30 text-white font-bold py-2.5 rounded-xl text-xs border border-white/20 hover:bg-black/40 transition">Withdraw</button></div></div>
      <div class="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-2"><span class="text-xs text-gray-400 font-bold uppercase">Active Lucky Entries</span>
        <h2 class="text-2xl font-black text-gray-900" id="w-entries">…</h2><p class="text-xs text-emerald-600 font-semibold"><i class="fas fa-check-circle mr-1"></i> Standard 5-Digit Draw</p></div>
      <div class="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-2"><span class="text-xs text-gray-400 font-bold uppercase">Purchased Event Passes</span>
        <h2 class="text-2xl font-black text-gray-900" id="w-passes">…</h2><p class="text-xs text-red-600 font-semibold"><i class="fas fa-qrcode mr-1"></i> Verified QR pass ready</p></div></div>

    <section class="bg-white p-5 sm:p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4" aria-labelledby="tix-h">
      <h2 id="tix-h" class="font-bold text-gray-900 text-lg">My Tickets</h2>
      <div id="w-tickets" class="grid grid-cols-1 md:grid-cols-2 gap-4"><div class="skeleton h-24 rounded-2xl"></div><div class="skeleton h-24 rounded-2xl"></div></div></section>

    <section class="bg-white p-5 sm:p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4" aria-labelledby="ledger-h">
      <div class="flex justify-between items-center"><h2 id="ledger-h" class="font-bold text-gray-900 text-lg">Transaction Audit Ledger</h2><span class="text-xs text-gray-400 font-bold">Latest first</span></div>
      <div class="overflow-x-auto"><table class="w-full text-left text-xs table-stack"><thead class="bg-gray-50 text-gray-400 uppercase font-bold"><tr><th class="p-3">Type</th><th class="p-3">Method / Rail</th><th class="p-3">Amount</th><th class="p-3">Status</th><th class="p-3">Date</th></tr></thead>
        <tbody class="divide-y divide-gray-100" id="w-ledger"><tr><td colspan="5" class="p-6 text-center text-gray-400">Loading…</td></tr></tbody></table></div>
      <button id="w-more" class="hidden w-full text-xs font-bold text-red-600 hover:bg-red-50 py-2.5 rounded-xl transition">Load more</button></section></div>`,

  async mount(ctx, root) {
    let page = 0, txs = [], tickets = []
    const paintBalance = () => { $('#w-balance', root).textContent = fmt(me()?.balance) }
    const paintLedger = () => {
      $('#w-ledger', root).innerHTML = txs.length ? txs.map((t) => `<tr class="hover:bg-gray-50/50">
        <td data-label="Type" class="p-3 font-bold ${t.amount > 0 ? 'text-emerald-600' : 'text-gray-800'}">${TX[t.type] || esc(t.type)}</td>
        <td data-label="Method" class="p-3 text-gray-600">${esc(t.method)}<span class="block text-[10px] text-gray-400">${esc(t.note)}</span></td>
        <td data-label="Amount" class="p-3 font-bold ${t.amount > 0 ? 'text-emerald-600' : 'text-red-600'}">${t.amount > 0 ? '+' : '−'}${fmt(Math.abs(t.amount))}</td>
        <td data-label="Status" class="p-3">${badge(t.status)}</td><td data-label="Date" class="p-3 text-gray-400 whitespace-nowrap">${esc(fmtDay(t.created))}</td></tr>`).join('')
        : `<tr><td colspan="5">${emptyState('fa-receipt', 'No transactions yet', 'Deposits, tickets and Lucky 5 entries will show up here.')}</td></tr>`
    }
    const paintTickets = () => {
      $('#w-passes', root).textContent = `${tickets.length} Pass${tickets.length === 1 ? '' : 'es'}`
      $('#w-tickets', root).innerHTML = tickets.length ? tickets.map((t) => {
        const ev = t.expand?.event
        return `<div class="border border-gray-200 rounded-2xl p-4 flex items-center justify-between gap-3 hover:border-red-300 transition">
          <div class="min-w-0"><p class="font-bold text-sm text-gray-900 truncate">${esc(ev?.title || 'Event')}</p>
            <p class="text-[11px] text-gray-500">${esc(TIER_NAMES[t.tier])}${ev ? ' • ' + esc(fmtDateTime(ev.starts_at)) : ''}</p>
            <p class="mt-1.5 flex items-center gap-2">${badge(t.status, t.status === 'used' ? 'Checked in' : ev && isPast(ev.starts_at) ? 'Past' : 'Valid')}<span class="font-mono text-[10px] text-gray-400">${esc(t.code)}</span></p></div>
          <button data-qr="${esc(t.id)}" class="shrink-0 bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl"><i class="fas fa-qrcode mr-1"></i> Show QR</button></div>`
      }).join('') : emptyState('fa-ticket-alt', 'No tickets yet', 'Passes you buy appear here with a QR code for the gate.', '<a href="events.html" class="inline-block bg-red-600 text-white text-xs font-bold px-5 py-2.5 rounded-xl">Browse events</a>')
    }
    const loadTx = async () => {
      try {
        const r = await pb.collection('transactions').getList(++page, 15, { sort: '-created' })
        txs = txs.concat(r.items); $('#w-more', root).classList.toggle('hidden', page >= r.totalPages); paintLedger()
      } catch (e) { $('#w-ledger', root).innerHTML = `<tr><td colspan="5" class="p-6 text-center text-red-600">${esc(errMsg(e))}</td></tr>` }
    }
    const loadTickets = async () => {
      try { tickets = await pb.collection('tickets').getFullList({ filter: pb.filter('user = {:u}', { u: me().id }), sort: '-created', expand: 'event' }); paintTickets() }
      catch { $('#w-tickets', root).innerHTML = emptyState('fa-plug', "Couldn't load tickets", 'Check your connection and refresh.') }
    }
    const loadEntries = async () => {
      try {
        const d = await pb.collection('draws').getFirstListItem('status = "open"')
        const n = (await pb.collection('lucky_entries').getList(1, 1, { filter: pb.filter('draw = {:d} && user = {:u}', { d: d.id, u: me().id }), fields: 'id' })).totalItems
        $('#w-entries', root).textContent = `${n} Ticket${n === 1 ? '' : 's'}`
      } catch { $('#w-entries', root).textContent = '—' }
    }

    // ---- Deposit / Withdraw ----
    const amountField = (id) => `<div><label class="block text-xs font-bold text-gray-700 mb-1" for="${id}">Amount (${currencyLabel()})</label><input class="field" type="number" min="0" step="any" inputmode="decimal" id="${id}" placeholder="0" autofocus></div>`
    const errBox = '<p id="m-err" class="hidden text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2" role="alert"></p>'
    const showErr = (m, t) => { const el = $('#m-err', m.el); el.textContent = t; el.classList.remove('hidden') }

    const openDeposit = () => {
      const flwOn = state.config.flutterwaveEnabled, sim = state.config.simulatedPayments || flwOn
      const m = openModal(`${closeButton}<div class="p-6 space-y-4"><h3 class="text-lg font-bold text-gray-900">Top-Up Wallet</h3>
        ${sim ? '' : '<p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">Deposits are not connected to a payment provider yet.</p>'}
        <div class="grid grid-cols-3 gap-2">${[50, 100, 250].map((u) => `<button data-quick="${fromUSD(u)}" class="py-2.5 bg-gray-100 hover:bg-red-50 text-xs font-bold rounded-xl border border-gray-200 hover:border-red-300">${fmt(u)}</button>`).join('')}</div>
        ${amountField('m-amt')}${errBox}
        <button id="m-go" ${sim ? '' : 'disabled'} class="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl text-xs shadow-md flex items-center justify-center gap-2">${flwOn ? 'Pay with Flutterwave' : 'Confirm Top Up'}</button></div>`)
      m.el.addEventListener('click', (e) => { const q = e.target.closest('[data-quick]'); if (q) $('#m-amt', m.el).value = q.dataset.quick })
      $('#m-go', m.el).onclick = async (e) => {
        const usd = toUSD($('#m-amt', m.el).value)
        if (!(usd >= 1)) return showErr(m, `Enter at least ${fmt(1)}.`)
        setBusy(e.currentTarget, true, 'Processing…')
        try {
          if (flwOn) { const { url } = await post('flw/checkout', { kind: 'deposit', amount: usd, origin: location.origin }); location.href = url; return }
          await post('wallet/deposit', { amount: usd }); await refreshMe(); m.close(); toast(`Wallet topped up by ${fmt(usd)}.`); reload()
        }
        catch (err) { setBusy($('#m-go', m.el), false); showErr(m, errMsg(err)) }
      }
    }
    const openWithdraw = () => {
      const m = openModal(`${closeButton}<div class="p-6 space-y-4"><h3 class="text-lg font-bold text-gray-900">Withdraw Earnings</h3>
        <p class="text-xs text-gray-500">Available: <strong>${fmt(me().balance)}</strong>. Requests are paid out by an admin and show as pending until then.</p>
        <div><label class="block text-xs font-bold text-gray-700 mb-1" for="m-bank">Bank Account / Rail</label><input class="field" id="m-bank" placeholder="Bank name & account number" autocomplete="off"></div>
        ${amountField('m-amt')}${errBox}
        <button id="m-go" class="w-full bg-slate-900 hover:bg-black text-white font-bold py-3 rounded-xl text-xs shadow-md flex items-center justify-center gap-2">Request Withdrawal</button></div>`)
      $('#m-go', m.el).onclick = async (e) => {
        const usd = toUSD($('#m-amt', m.el).value)
        if (!(usd > 0)) return showErr(m, 'Enter an amount to withdraw.')
        setBusy(e.currentTarget, true, 'Submitting…')
        try { await post('wallet/withdraw', { amount: usd, bank: $('#m-bank', m.el).value }); await refreshMe(); m.close(); toast(`Withdrawal of ${fmt(usd)} requested.`); reload() }
        catch (err) { setBusy($('#m-go', m.el), false); showErr(m, errMsg(err)) }
      }
    }
    const showQR = (t) => {
      const ev = t.expand?.event
      const m = openModal(`${closeButton}<div class="p-6 text-center space-y-3"><h3 class="text-lg font-bold text-gray-900 pr-8">${esc(ev?.title || 'Event pass')}</h3>
        <p class="text-xs text-gray-500">${esc(TIER_NAMES[t.tier])} • ${esc(t.holder_name)}</p>
        <div class="inline-block p-4 bg-gray-50 rounded-2xl border border-gray-200"><div id="m-qr" class="flex justify-center"></div><span class="block text-[11px] text-gray-500 font-mono mt-2">${esc(t.code)}</span></div></div>`)
      renderQR($('#m-qr', m.el), t.code, 200)
    }

    const reload = () => { page = 0; txs = []; paintBalance(); loadTx(); loadTickets(); loadEntries() }
    const onClick = (e) => {
      const a = e.target.closest('[data-act]')?.dataset.act
      if (a === 'deposit') openDeposit(); else if (a === 'withdraw') openWithdraw()
      const q = e.target.closest('[data-qr]'); if (q) showQR(tickets.find((t) => t.id === q.dataset.qr))
      if (e.target.closest('#w-more')) loadTx()
    }
    root.addEventListener('click', onClick)
    const off = bus.on('auth', paintBalance)

    // Coming back from Flutterwave checkout (?status=...&tx_ref=...&transaction_id=...)
    const qs = new URLSearchParams(location.search)
    const ref = qs.get('tx_ref'), txId = qs.get('transaction_id')
    if (ref) {
      history.replaceState(null, '', 'wallet.html')
      if (qs.get('status') === 'cancelled') toast('Top-up cancelled. You have not been charged.')
      else (async () => {
        for (let i = 0; i < 6; i++) {
          try {
            const r = await pb.send('/api/bkf/flw/confirm', { query: { tx_ref: ref, ...(txId ? { transaction_id: txId } : {}) } })
            if (r.status === 'paid') { await refreshMe(); paintBalance(); reload(); return toast(`Wallet topped up by ${fmt(r.amount)}.`) }
            if (r.status !== 'pending') break
          } catch (err) { return toast(errMsg(err)) }
          await new Promise((ok) => setTimeout(ok, 2000))
        }
        toast("We couldn't confirm the payment. If you were charged, your balance will update shortly.")
      })()
    }
    reload()
    this._repaint = () => { paintBalance(); paintLedger() }
    return () => { root.removeEventListener('click', onClick); off() }
  },
  onCurrency() { this._repaint?.() },
}
