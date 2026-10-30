import { state } from './state.js'

// Sound effects are synthesised with Tone.js, loaded the first time a sound is needed.
let loading = null
function loadTone() {
  if (window.Tone) return Promise.resolve()
  loading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.js'
    s.onload = resolve
    s.onerror = reject
    document.head.appendChild(s)
  })
  return loading
}

export async function playSound(type) {
  if (!state.sound) return
  try {
    await loadTone()
    if (Tone.context.state !== 'running') await Tone.start()
    if (type === 'win') {
      const poly = new Tone.PolySynth().toDestination()
      poly.triggerAttackRelease(['C4', 'E4', 'G4', 'B4'], '4n')
    } else {
      new Tone.Synth().toDestination().triggerAttackRelease('C5', '8n')
    }
  } catch { /* audio is optional */ }
}

export function toggleSound() {
  state.sound = !state.sound
  localStorage.setItem('bkf_sound', state.sound ? 'on' : 'off')
  return state.sound
}
