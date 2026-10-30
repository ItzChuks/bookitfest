import { pb, post, errMsg } from '../pb.js'
import { state, me, fmt, bus, refreshMe } from '../state.js'
import { digitChips } from '../components.js'
import { $, $$, esc, fmtDay, setBusy, toast, confirmBox, emptyState } from '../ui.js'
import { openAuth } from '../layout.js'
import { playSound } from '../audio.js'

const TAB_ON = 'px-4 py-2 rounded-xl text-xs font-black bg-red-600 text-white shadow-sm transition flex items-center gap-1.5'
const TAB_OFF = 'px-4 py-2 rounded-xl text-xs font-extrabold text-gray-600 hover:text-red-600 hover:bg-red-50 transition flex items-center gap-1.5'

export default {
  title: 'Lucky 5 Games',
  render: () => `<div class="bg-white rounded-3xl p-5 sm:p-8 border border-red-100 shadow-xl space-y-6">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-gray-100 pb-6 gap-4">
      <div><span class="bg-red-100 text-red-600 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">100,000 combinations</span>
        <h1 class="text-2xl sm:text-3xl font-black text-gray-900 mt-2">Lucky 5 Digits Draw (0–9)</h1>
        <p class="text-xs text-gray-500 mt-1 max-w-xl">Pick 5 digits. Match the exact sequence to win the jackpot. If several players match, they share it. An unclaimed jackpot rolls over.</p></div>
      <div class="bg-gray-900 text-white p-4 rounded-2xl text-center min-w-[170px] w-full sm:w-auto">
        <span class="text-[10px] uppercase tracking-widest text-gray-400 block font-bold">Current Jackpot</span>
        <span class="text-2xl font-black text-amber-400" id="jackpot">…</span>
        <span class="text-[10px] text-gray-400 block mt-0.5" id="draw-no"></span></div></div>

    <div class="flex items-center space-x-2 border-b border-gray-100 pb-4" role="tablist">
      <button id="tab-active" data-tab="active" role="tab" class="${TAB_ON}"><span class="w-2 h-2 rounded-full bg-white animate-pulse"></span>Live Active Draws</button>
      <button id="tab-ended" data-tab="ended" role="tab" class="${TAB_OFF}"><i class="fas fa-history text-gray-400"></i>Ended Past Draws</button></div>

    <div id="panel-active" class="space-y-6">
      <div class="grid grid-cols-5 gap-2 sm:gap-4 max-w-lg mx-auto py-2" id="boxes" role="group" aria-label="Your 5 digits">
        ${[0, 1, 2, 3, 4].map((i) => `<button data-box="${i}" aria-label="Digit ${i + 1}" class="h-16 sm:h-20 rounded-2xl border-2 flex items-center justify-center text-2xl sm:text-4xl font-black shadow-inner transition"></button>`).join('')}</div>
      <div class="max-w-md mx-auto space-y-4">
        <div class="flex justify-between items-center text-xs text-gray-500 font-bold"><span>Active Box: <span id="active-label" class="text-red-600 font-black">Box #1</span></span>
          <span class="flex gap-4"><button data-act="clear" class="text-gray-500 hover:underline">Clear</button><button data-act="quick" class="text-red-600 hover:underline"><i class="fas fa-magic mr-1"></i>Quick Pick</button></span></div>
        <div class="grid grid-cols-5 gap-2">${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<button data-digit="${d}" class="py-3.5 bg-gray-100 hover:bg-red-600 hover:text-white rounded-xl text-lg font-extrabold transition">${d}</button>`).join('')}</div>
        <button data-act="submit" id="submit" class="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:shadow-none text-white font-extrabold py-4 rounded-2xl shadow-lg shadow-red-200 transition flex items-center justify-center space-x-2"><i class="fas fa-ticket-alt"></i><span>Submit Entry Ticket (<span data-fee>…</span>)</span></button>
        <p class="hidden sm:block text-[11px] text-gray-400 text-center">Tip: you can also type digits on your keyboard.</p>
      </div>
      <div id="my-entries" class="max-w-md mx-auto"></div></div>

    <div id="panel-ended" class="space-y-4 hidden">
      <div class="flex items-center justify-between"><h2 class="font-bold text-gray-900 text-sm">Recent Completed Draws & Winning Digits</h2><span class="text-[11px] text-gray-400 font-semibold">Results are final once drawn</span></div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4" id="ended"></div></div></div>`,

  async mount(ctx, root) {
    let digits = [null, null, null, null, null], active = 0, openDraw = null, busy = false
    const fee = () => state.config.luckyFeeUSD

    const paint = () => {
      $$('[data-box]', root).forEach((b, i) => {
        b.textContent = digits[i] ?? '?'
        b.className = `h-16 sm:h-20 rounded-2xl border-2 flex items-center justify-center text-2xl sm:text-4xl font-black shadow-inner transition ${i === active ? 'border-red-500 bg-white ring-4 ring-red-100' : 'border-red-200 bg-red-50/50'} ${digits[i] == null ? 'text-red-200' : 'text-red-600'}`
      })
      $('#active-label', root).textContent = `Box #${active + 1}`
      $('#submit', root).disabled = busy || digits.some((d) => d == null)
      $('[data-fee]', root).textContent = fmt(fee())
    }
    const setDigit = (d) => {
      playSound('click'); digits[active] = d
      const el = $(`[data-box="${active}"]`, root); el.classList.add('digit-animated'); setTimeout(() => el.classList.remove('digit-animated'), 400)
      active = (active + 1) % 5; paint()
    }
    const showJackpot = () => { if (!openDraw) return; $('#jackpot', root).textContent = fmt(openDraw.jackpot); $('#draw-no', root).textContent = `Draw #${openDraw.number}` }

    const loadOpen = async () => { try { openDraw = await pb.collection('draws').getFirstListItem('status = "open"'); showJackpot(); loadMine() } catch { $('#jackpot', root).textContent = fmt(0) } }
    const loadMine = async () => {
      const box = $('#my-entries', root); if (!box) return
      if (!me() || !openDraw) { box.innerHTML = ''; return }
      try {
        const list = await pb.collection('lucky_entries').getFullList({ filter: pb.filter('draw = {:d}', { d: openDraw.id }), sort: '-created' })
        box.innerHTML = list.length ? `<div class="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3"><h3 class="text-xs font-bold text-gray-700">Your entries in Draw #${openDraw.number} (${list.length})</h3>
          <div class="flex flex-wrap gap-2">${list.map((e) => digitChips(e.digits, 'text-sm')).join('')}</div></div>` : ''
      } catch { box.innerHTML = '' }
    }
    const loadEnded = async () => {
      const el = $('#ended', root)
      try {
        const list = await pb.collection('draws').getList(1, 12, { filter: 'status = "closed"', sort: '-number' })
        el.innerHTML = list.items.length ? list.items.map((d) => `<div class="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3 shadow-sm hover:border-red-300 transition">
          <div class="flex items-center justify-between gap-2"><span class="text-xs font-bold text-gray-900">DRAW-${d.number} • <span class="text-gray-500 font-normal">${esc(fmtDay(d.drawn_at))}</span></span>
            <span class="${d.winners ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'} px-2 py-0.5 rounded-md text-[10px] font-black uppercase">${d.winners ? 'Paid out' : 'Rolled over'}</span></div>
          <div class="flex items-center justify-between bg-white p-3 rounded-xl border border-gray-100 gap-2"><span class="text-[11px] font-bold text-gray-400 uppercase">Winning Digits</span>${digitChips(d.winning_digits)}</div>
          <div class="flex justify-between text-[11px] font-semibold text-gray-500"><span>Jackpot ${fmt(d.jackpot)}</span><span>${d.winners} winner${d.winners === 1 ? '' : 's'}</span></div></div>`).join('')
          : emptyState('fa-history', 'No draws yet', 'Results appear here after the first draw.')
      } catch { el.innerHTML = emptyState('fa-plug', "Couldn't load results", 'Check your connection and try again.') }
    }

    const onClick = async (e) => {
      const t = e.target
      const dg = t.closest('[data-digit]'); if (dg && root.contains(dg)) return setDigit(Number(dg.dataset.digit))
      const bx = t.closest('[data-box]'); if (bx) { active = Number(bx.dataset.box); return paint() }
      const tab = t.closest('[data-tab]')
      if (tab) {
        const ended = tab.dataset.tab === 'ended'
        $('#tab-active', root).className = ended ? TAB_OFF : TAB_ON; $('#tab-ended', root).className = ended ? TAB_ON : TAB_OFF
        $('#panel-active', root).classList.toggle('hidden', ended); $('#panel-ended', root).classList.toggle('hidden', !ended)
        if (ended) loadEnded()
        return
      }
      const act = t.closest('[data-act]')?.dataset.act
      if (act === 'quick') { playSound('click'); digits = digits.map(() => crypto.getRandomValues(new Uint32Array(1))[0] % 10); paint() }
      else if (act === 'clear') { digits = [null, null, null, null, null]; active = 0; paint() }
      else if (act === 'submit') {
        if (!me()) return openAuth('login')
        const pick = digits.join('')
        const ok = await confirmBox({ title: 'Submit your entry?', body: `You're entering <strong class="text-red-600 tracking-widest">${pick}</strong> in Draw #${openDraw?.number ?? ''} for <strong>${fmt(fee())}</strong>, paid from your wallet.`, confirmText: `Pay ${fmt(fee())}` })
        if (!ok) return
        busy = true; paint()
        const btn = $('#submit', root); setBusy(btn, true, 'Submitting…')
        try {
          const res = await post('lucky/enter', { digits: pick })
          playSound('win'); toast(`Entry ${pick} submitted. Good luck!`)
          if (openDraw) openDraw.jackpot = res.jackpot
          showJackpot(); await refreshMe(); loadMine()
          digits = [null, null, null, null, null]; active = 0
        } catch (err) {
          toast(errMsg(err), 'error')
        }
        busy = false; setBusy(btn, false); paint()
      }
    }
    const onKey = (e) => {
      if (e.target.closest('input, textarea, select') || document.body.classList.contains('modal-open') || e.metaKey || e.ctrlKey) return
      if (/^[0-9]$/.test(e.key)) setDigit(Number(e.key))
      else if (e.key === 'Backspace') { active = (active + 4) % 5; digits[active] = null; paint() }
    }
    root.addEventListener('click', onClick); document.addEventListener('keydown', onKey)
    paint(); loadOpen()

    let unsub
    try { unsub = await pb.collection('draws').subscribe('*', (ev) => { if (ev.action !== 'delete') loadOpen() }) } catch { /* realtime is optional */ }
    const offAuth = bus.on('auth', loadMine)
    this._repaint = () => { paint(); showJackpot(); if (!$('#panel-ended', root).classList.contains('hidden')) loadEnded() }
    return () => { root.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); offAuth(); try { unsub?.() } catch { /* */ } }
  },
  onCurrency() { this._repaint?.() },
}
