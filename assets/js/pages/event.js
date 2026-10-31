import { pb, post, errMsg } from '../pb.js'
import { state, me, fmt, bus, refreshMe } from '../state.js'
import { TIER_NAMES, evtImage } from '../components.js'
import { $, $$, esc, fmtDateTime, isPast, imgOnError, setBusy, toast, renderQR, emptyState } from '../ui.js'
import { openAuth } from '../layout.js'
import { playSound } from '../audio.js'

const TIERS = ['early', 'regular', 'vip']
const price = (evt, t) => evt['price_' + t]

export default {
  title: 'Event',
  render: () => `<div id="event-root"><div class="grid lg:grid-cols-5 gap-6"><div class="lg:col-span-3 skeleton h-96 rounded-3xl"></div><div class="lg:col-span-2 skeleton h-96 rounded-3xl"></div></div></div>`,

  async mount(ctx) {
    const root = $('#event-root')
    let evt
    try { evt = await pb.collection('events').getOne(ctx.params.id) }
    catch (e) {
      root.innerHTML = emptyState('fa-ticket-alt', e.status === 404 ? 'Event not found' : "Couldn't load this event",
        e.status === 404 ? 'It may have been removed, or it is still waiting for admin approval.' : 'Check your connection and try again.',
        '<a href="events.html" class="inline-block bg-red-600 text-white text-xs font-bold px-5 py-2.5 rounded-xl">Browse events</a>')
      return
    }
    document.title = `${evt.title} | Bookitfest`
    const ended = isPast(evt.starts_at)
    const unlisted = evt.status !== 'approved'
    const bk = { step: 1, qty: { early: 0, regular: 1, vip: 0 }, name: me()?.name || '', email: me()?.email || '', gateway: 'wallet', error: '', tickets: null }
    const max = () => state.config.maxTicketsPerOrder
    const seats = () => TIERS.reduce((n, t) => n + bk.qty[t], 0)
    const total = () => TIERS.reduce((n, t) => n + bk.qty[t] * price(evt, t), 0)

    root.innerHTML = `<a href="events.html" class="inline-flex items-center text-xs font-bold text-gray-500 hover:text-red-600 mb-4"><i class="fas fa-arrow-left mr-1.5"></i> All events</a>
      <div class="grid lg:grid-cols-5 gap-6 items-start">
        <article class="lg:col-span-3 bg-white rounded-3xl overflow-hidden border border-gray-100 shadow-sm">
          <div class="relative h-56 sm:h-80"><img src="${esc(evtImage(evt))}" onerror="${imgOnError}" alt="" class="w-full h-full object-cover">
            <span class="absolute top-4 left-4 bg-red-600 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">${esc(evt.category)}</span></div>
          <div class="p-5 sm:p-8 space-y-4">
            <h1 class="text-2xl sm:text-4xl font-black text-gray-900 leading-tight">${esc(evt.title)}</h1>
            <div class="flex flex-wrap gap-x-6 gap-y-2 text-xs font-semibold text-gray-600">
              <span><i class="far fa-calendar-alt text-red-500 mr-1.5"></i>${esc(fmtDateTime(evt.starts_at))}</span>
              <span><i class="fas fa-map-marker-alt text-red-500 mr-1.5"></i>${esc(evt.location)}</span>
              <span><i class="fas fa-store text-red-500 mr-1.5"></i>Hosted by ${esc(evt.vendor_name || 'a verified vendor')}</span></div>
            ${evt.description ? `<p class="text-sm text-gray-600 leading-relaxed max-w-prose whitespace-pre-line">${esc(evt.description)}</p>` : ''}
            <div class="grid sm:grid-cols-3 gap-3 pt-2">${TIERS.map((t) => `<div class="bg-gray-50 rounded-2xl p-4 border border-gray-100"><span class="text-[10px] text-gray-400 font-bold uppercase block">${TIER_NAMES[t]}</span><span class="text-lg font-extrabold text-gray-900" data-tier-price="${t}">${fmt(price(evt, t))}</span></div>`).join('')}</div>
          </div></article>
        <aside class="lg:col-span-2 lg:sticky lg:top-24 bg-white rounded-3xl overflow-hidden shadow-2xl border border-red-100" id="booking" aria-label="Buy tickets"></aside>
      </div>`
    const panel = $('#booking', root)

    const steps = () => ['Tickets', 'Attendee', 'Payment'].map((l, i) =>
      `<div class="flex-1 text-center py-1.5 rounded-xl transition-all ${bk.step === i + 1 ? 'bg-white text-red-600 shadow-sm' : 'text-white/70'}">${i + 1}. ${l}</div>`).join('')

    const header = (withSteps = true) => `<div class="bg-gradient-to-r from-red-600 to-red-700 p-5 sm:p-6 text-white">
      <div class="flex items-center gap-2 text-red-200 text-xs font-bold uppercase tracking-wider mb-1"><span class="bg-white/20 px-2 py-0.5 rounded-md">Official Ticketing</span></div>
      <h2 class="text-lg font-bold leading-snug">${esc(evt.title)}</h2>
      ${bk.tickets || !withSteps ? '' : `<div class="flex items-center justify-between mt-4 bg-black/20 p-1.5 rounded-2xl text-[11px] sm:text-xs font-semibold">${steps()}</div>`}</div>`

    const bodyStep = () => {
      if (bk.tickets) {
        return `<div class="space-y-5 text-center">
          <div class="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full text-2xl"><i class="fas fa-check"></i></div>
          <div><h3 class="text-2xl font-bold text-gray-900">Booking Confirmed!</h3><p class="text-xs text-gray-500 mt-1">Show a QR code at the gate. Each ticket admits one person.</p></div>
          <div class="grid grid-cols-2 gap-3">${bk.tickets.map((t, i) => `<div class="p-3 bg-gray-50 rounded-2xl border border-gray-200"><div data-qr="${esc(t.code)}" class="flex justify-center"></div>
            <span class="block text-[10px] font-mono text-gray-500 mt-2">${esc(t.code)}</span><span class="block text-[10px] font-bold text-red-600 uppercase">${esc(TIER_NAMES[t.tier])}</span></div>`).join('')}</div>
          <a href="wallet.html" class="block w-full bg-gray-900 text-white font-bold py-3 rounded-2xl text-xs">Done & View Tickets</a></div>`
      }
      const err = bk.error ? `<p class="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2" role="alert">${esc(bk.error)}</p>` : ''
      if (bk.step === 1) return `<div class="space-y-4">
        <h3 class="text-sm font-bold text-gray-800 uppercase tracking-wider flex justify-between items-center"><span>Choose Pass Tier</span><span class="text-xs text-red-600 font-semibold normal-case"><i class="fas fa-fire mr-1"></i>Selling fast</span></h3>
        <div class="space-y-3">${TIERS.map((t) => `<div class="border border-gray-200 rounded-2xl p-4 flex items-center justify-between hover:border-red-400 transition bg-white shadow-sm">
          <div><h4 class="font-bold text-sm text-gray-900">${TIER_NAMES[t]}</h4><p class="text-sm font-extrabold text-red-600">${fmt(price(evt, t))}</p></div>
          <div class="flex items-center space-x-2 bg-gray-100 p-1.5 rounded-xl">
            <button data-act="qty" data-t="${t}" data-d="-1" aria-label="Remove one ${TIER_NAMES[t]}" class="w-9 h-9 bg-white rounded-lg text-gray-700 font-bold">−</button>
            <span class="w-6 text-center font-bold text-sm text-gray-900" aria-live="polite">${bk.qty[t]}</span>
            <button data-act="qty" data-t="${t}" data-d="1" aria-label="Add one ${TIER_NAMES[t]}" class="w-9 h-9 bg-white rounded-lg text-gray-700 font-bold">+</button></div></div>`).join('')}</div>
        <div class="flex justify-between items-center text-sm font-bold bg-gray-900 text-white rounded-2xl px-4 py-3"><span class="text-red-400">Total</span><span>${fmt(total())}</span></div>
        ${err}<button data-act="next" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-red-200 flex items-center justify-center space-x-2 transition text-sm"><span>Proceed to Attendee Details</span><i class="fas fa-arrow-right"></i></button></div>`
      if (bk.step === 2) return `<div class="space-y-4">
        <div><label class="block text-xs font-semibold text-gray-700 mb-1" for="bk-name">Full Name *</label><input class="field" id="bk-name" data-field="name" value="${esc(bk.name)}" autocomplete="name" placeholder="John Doe"></div>
        <div><label class="block text-xs font-semibold text-gray-700 mb-1" for="bk-email">Email Address *</label><input class="field" type="email" id="bk-email" data-field="email" value="${esc(bk.email)}" autocomplete="email" placeholder="john@example.com"><p class="text-[11px] text-gray-400 mt-1">Your tickets are also saved in your wallet.</p></div>
        ${err}<div class="flex items-center space-x-3 pt-1"><button data-act="back" class="w-1/3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 rounded-2xl transition text-sm">Back</button>
        <button data-act="next" class="w-2/3 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-2xl shadow-lg shadow-red-200 flex items-center justify-center space-x-2 transition text-sm"><span>Continue to Payment</span><i class="fas fa-arrow-right"></i></button></div></div>`
      const u = me(), sim = state.config.simulatedPayments, flwOn = state.config.flutterwaveEnabled
      const low = u && bk.gateway === 'wallet' && u.balance < total()
      return `<div class="space-y-4">
        <div class="bg-gray-900 text-white p-4 rounded-2xl text-xs space-y-1"><div class="flex justify-between items-center text-sm font-bold"><span class="text-red-400">Total Payable</span><span class="text-xl text-white">${fmt(total())}</span></div>
          <p class="text-gray-400">${seats()} ticket${seats() === 1 ? '' : 's'} for ${esc(bk.name)}</p></div>
        <div class="space-y-2"><label class="block text-xs font-bold text-gray-700" for="bk-gw">Payment Option</label>
          <select id="bk-gw" data-field="gateway" class="field font-bold"><option value="wallet" ${bk.gateway === 'wallet' ? 'selected' : ''}>Bookitfest Wallet${u ? ' (' + fmt(u.balance) + ')' : ''}</option>
            <option value="paystack" ${bk.gateway === 'paystack' ? 'selected' : ''} ${sim ? '' : 'disabled'}>Paystack Card / Transfer${sim ? ' (demo)' : ' (coming soon)'}</option>
            <option value="flutterwave" ${bk.gateway === 'flutterwave' ? 'selected' : ''} ${sim || flwOn ? '' : 'disabled'}>Card / Bank Transfer / USSD (Flutterwave)${flwOn ? '' : sim ? ' (demo)' : ' (coming soon)'}</option></select></div>
        ${low ? `<p class="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">Your balance is ${fmt(u.balance)}. <a href="wallet.html" class="underline font-bold">Top up your wallet</a> to pay with it.</p>` : ''}
        ${err}<div class="flex items-center space-x-3 pt-1"><button data-act="back" class="w-1/3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3.5 rounded-2xl transition text-sm">Back</button>
        <button data-act="pay" class="w-2/3 bg-red-600 hover:bg-red-700 text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-red-200 flex items-center justify-center space-x-2 transition text-sm">
          ${u ? '<i class="fas fa-lock text-xs"></i><span>Complete Purchase</span>' : '<i class="fas fa-user text-xs"></i><span>Sign in to pay</span>'}</button></div></div>`
    }

    const draw = () => {
      if ((ended || unlisted) && !bk.tickets) {
        panel.innerHTML = `${header(false)}<div class="p-6 text-center text-xs text-gray-500 space-y-3">
          <i class="fas fa-ticket-alt text-2xl text-gray-300"></i><p class="font-bold text-gray-700">${unlisted ? 'Not on sale yet' : 'This event has ended'}</p>
          <p>${unlisted ? 'This event is waiting for admin approval.' : 'Tickets are no longer available.'}</p><a href="events.html" class="inline-block text-red-600 font-bold hover:underline">Find another event</a></div>`
        return
      }
      panel.innerHTML = header() + `<div class="p-5 sm:p-6">${bodyStep()}</div>`
      $$('[data-qr]', panel).forEach((el) => renderQR(el, el.dataset.qr, 110))
    }

    const go = (step) => { bk.step = step; bk.error = ''; playSound('click'); draw() }
    const onClick = async (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return
      const a = b.dataset.act
      if (a === 'qty') {
        const t = b.dataset.t, d = Number(b.dataset.d)
        if (d > 0 && seats() >= max()) { bk.error = `You can buy up to ${max()} tickets per order.`; return draw() }
        bk.qty[t] = Math.max(0, bk.qty[t] + d); bk.error = ''; playSound('click'); draw()
      } else if (a === 'back') go(bk.step - 1)
      else if (a === 'next') {
        if (bk.step === 1 && seats() < 1) { bk.error = 'Choose at least one ticket.'; return draw() }
        if (bk.step === 2) {
          if (!bk.name.trim()) { bk.error = "Enter the attendee's full name."; return draw() }
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(bk.email.trim())) { bk.error = 'Enter a valid email address.'; return draw() }
        }
        go(bk.step + 1)
      } else if (a === 'pay') {
        if (!me()) return openAuth('login')
        setBusy(b, true, 'Processing…')
        try {
          if (bk.gateway === 'flutterwave' && state.config.flutterwaveEnabled) {
            const { url } = await post('flw/checkout', { kind: 'ticket', eventId: evt.id, qty: bk.qty, name: bk.name.trim(), email: bk.email.trim(), origin: location.origin })
            location.href = url; return
          }
          const res = await post('purchase', { eventId: evt.id, qty: bk.qty, name: bk.name.trim(), email: bk.email.trim(), gateway: bk.gateway })
          await refreshMe()
          bk.tickets = res.tickets; bk.error = ''
          playSound('win'); draw(); panel.scrollIntoView({ behavior: 'smooth', block: 'start' })
        } catch (err) { bk.error = errMsg(err); draw() }
      }
    }
    const onField = (e) => {
      const f = e.target.dataset?.field; if (!f) return
      bk[f] = e.target.value
      if (f === 'gateway') draw()
    }
    panel.addEventListener('click', onClick)
    panel.addEventListener('input', onField)
    panel.addEventListener('change', onField)
    const offAuth = bus.on('auth', () => { if (!bk.tickets && bk.step === 3) draw() })

    // Coming back from Flutterwave checkout (?status=...&tx_ref=...&transaction_id=...)
    const qs = new URLSearchParams(location.search)
    const ref = qs.get('tx_ref'), txId = qs.get('transaction_id'), fstatus = qs.get('status')
    if (ref) {
      history.replaceState(null, '', `event.html?id=${encodeURIComponent(evt.id)}`)
      if (fstatus === 'cancelled') { bk.step = 3; bk.error = 'Payment was cancelled. You have not been charged.' }
      else {
        panel.innerHTML = `${header(false)}<div class="p-8 text-center text-xs text-gray-500 space-y-3"><i class="fas fa-spinner fa-spin text-2xl text-red-500"></i><p class="font-bold text-gray-700">Confirming your payment…</p></div>`
        let res = null
        for (let i = 0; i < 6 && !res; i++) {
          try { const r = await pb.send('/api/bkf/flw/confirm', { query: { tx_ref: ref, ...(txId ? { transaction_id: txId } : {}) } }); if (r.status === 'paid') res = r; else if (r.status !== 'pending') break }
          catch (err) { bk.error = errMsg(err); break }
          if (!res) await new Promise((ok) => setTimeout(ok, 2000))
        }
        if (res?.tickets) { await refreshMe(); bk.tickets = res.tickets; playSound('win') }
        else { bk.step = 3; bk.error ||= "We couldn't confirm your payment. If you were charged, your tickets will appear in your wallet shortly." }
      }
    }
    draw()

    Object.assign(this, { _redraw: () => { $$('[data-tier-price]', root).forEach((el) => (el.textContent = fmt(price(evt, el.dataset.tierPrice)))); draw() } })
    return () => { offAuth() }
  },
  onCurrency() { this._redraw?.() },
}
