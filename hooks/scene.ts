// The night sky, built as one SVG string from the time of day and the moon.
// Pure: give it the hour and the moon phase, get markup back.
//
// Layout: the sky and hills fill the window and may be cropped at the sides.
// Everything that matters (animals, moon) sits in "pins"
// that CSS media queries slide in from the edges, so a narrow window still
// shows them at its own edges instead of cutting them off.

export type SkyMoment = {
  hour: number // local hour, 0 to 24 with fractions
  moonPhase: number // 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter
  mood?: Mood // what Claude is doing in the chat
  starBurst?: boolean // a turn just finished: one shooting star crosses
}

// idle: nothing running. working: Claude is on a turn. waiting: Claude asked you something.
export type Mood = 'idle' | 'working' | 'waiting'

// ---------- the clock and the moon ----------

const SYNODIC_DAYS = 29.530588853
// A known new moon: 2000-01-06 18:14 UTC.
const KNOWN_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14)

export function moonPhaseAt(ms: number): number {
  const days = (ms - KNOWN_NEW_MOON_MS) / 86_400_000
  const p = (days / SYNODIC_DAYS) % 1

  return p < 0 ? p + 1 : p
}

export function moonLitFraction(p: number): number {
  return (1 - Math.cos(2 * Math.PI * p)) / 2
}

export function moonName(p: number): string {
  const names = [
    'new moon', 'waxing crescent', 'first quarter', 'waxing gibbous',
    'full moon', 'waning gibbous', 'last quarter', 'waning crescent',
  ]

  return names[Math.round(p * 8) % 8]
}

// ---------- small helpers ----------

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16)

  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mix(a: string, b: string, t: number): string {
  const x = hex(a)
  const y = hex(b)
  const out = x.map((v, i) => Math.round(v + (y[i] - v) * t))

  return '#' + out.map(v => v.toString(16).padStart(2, '0')).join('')
}

function smooth(t: number): number {
  const c = Math.min(1, Math.max(0, t))

  return c * c * (3 - 2 * c)
}

function rng(seed: number): () => number {
  let s = seed >>> 0

  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const r1 = (v: number) => Math.round(v * 10) / 10

// ---------- light through the day ----------

// [hour, top, middle, horizon]: muted on purpose, so the sky never shouts.
const SKY: [number, string, string, string][] = [
  [0, '#050816', '#0a1029', '#141b3b'],
  [4.5, '#070b1f', '#111838', '#2a2550'],
  [6, '#1c2552', '#4a4272', '#c98a78'],
  [7.5, '#3b5584', '#7189ad', '#d9b9a0'],
  [10, '#3e5f8c', '#6f8fb3', '#a9bfd3'],
  [15, '#3d5c88', '#6d8bb0', '#b3c3d2'],
  [17.5, '#33467a', '#6a6a96', '#d6a07e'],
  [18.7, '#1d2150', '#4a3768', '#b8695c'],
  [20, '#0b1030', '#1a1a45', '#3a2c55'],
  [22, '#060a1c', '#0c1230', '#171d40'],
  [24, '#050816', '#0a1029', '#141b3b'],
]

function skyAt(h: number): [string, string, string] {
  for (let i = 0; i < SKY.length - 1; i++) {
    const [h0, ...a] = SKY[i]
    const [h1, ...b] = SKY[i + 1]

    if (h >= h0 && h <= h1) {
      const t = smooth((h - h0) / (h1 - h0))

      return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]
    }
  }

  return [SKY[0][1], SKY[0][2], SKY[0][3]]
}

// 0 at night, 1 in full day.
export function daylight(h: number): number {
  if (h < 5 || h > 19.5) return 0
  if (h < 8) return smooth((h - 5) / 3)
  if (h > 16.5) return smooth((19.5 - h) / 3)

  return 1
}

// ---------- the stars ----------

function starfield(): string {
  const rand = rng(20261122)
  const groups: string[][] = [[], [], [], []]

  for (let i = 0; i < 200; i++) {
    const x = r1(rand() * 1600)
    const y = r1(rand() * 760)
    const big = rand()
    const r = big > 0.96 ? 2 : big > 0.8 ? 1.4 : 0.85
    const o = r1(0.45 + rand() * 0.55)
    const fill = rand() > 0.85 ? '#ffe7c4' : '#e6ecff'
    groups[Math.floor(rand() * 4)].push(
      `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" opacity="${o}"/>`,
    )
  }

  return (
    `<g>${groups[0].join('')}</g>` +
    `<g class="tw1">${groups[1].join('')}</g>` +
    `<g class="tw2">${groups[2].join('')}</g>` +
    `<g class="tw3">${groups[3].join('')}</g>`
  )
}

// ---------- sun and moon (x is placed by CSS, see fitCss) ----------

type Body = { svg: string; x: number } | null

function moon(h: number, p: number, light: number): Body {
  // The moon crosses the sky about phase x 24 hours after the sun does.
  const transit = (12 + p * 24) % 24
  const ha = ((h - transit + 36) % 24) - 12

  if (Math.abs(ha) > 6.3) return null

  const t = (ha + 6.3) / 12.6
  const cy = r1(640 - Math.sin(Math.PI * t) * 520)
  const r = 32
  const k = moonLitFraction(p)
  const rx = r1(r * Math.abs(1 - 2 * k))
  const waxing = p < 0.5
  const crescent = k < 0.5
  const top = `0,${r1(cy - r)}`
  const bottom = `0,${r1(cy + r)}`
  const limb = waxing ? 1 : 0
  const term = waxing ? (crescent ? 0 : 1) : crescent ? 1 : 0
  const lit = `M${top} A${r},${r} 0 0 ${limb} ${bottom} A${rx},${r} 0 0 ${term} ${top} Z`
  const fade = r1(1 - light * 0.55)

  return {
    x: t,
    svg:
      `<g class="moon" opacity="${fade}">` +
      `<circle class="halo" cx="0" cy="${cy}" r="${r * 3.4}" fill="url(#moonglow)" opacity="${r1(0.3 + k * 0.6)}"/>` +
      `<circle cx="0" cy="${cy}" r="${r}" fill="#2a3150" opacity="0.55"/>` +
      (k > 0.02 ? `<path d="${lit}" fill="#f3efe0"/>` : '') +
      `</g>`,
  }
}

function sun(h: number): Body {
  if (h < 5.6 || h > 19) return null

  const t = (h - 5.6) / 13.4
  const cy = r1(760 - Math.sin(Math.PI * t) * 560)

  return {
    x: t,
    svg:
      `<g class="sun"><circle cx="0" cy="${cy}" r="150" fill="url(#sunglow)"/>` +
      `<circle cx="0" cy="${cy}" r="26" fill="#fff3d6" opacity="0.85"/></g>`,
  }
}

// ---------- the land ----------

const HILL_FAR = 'M0,780 C200,740 380,760 560,790 C760,820 900,760 1100,770 C1300,780 1450,740 1600,760 L1600,1000 L0,1000 Z'
const HILL_MID = 'M0,840 C150,800 300,810 420,835 C600,870 800,850 1000,860 C1200,870 1350,800 1600,815 L1600,1000 L0,1000 Z'
const HILL_NEAR = 'M0,905 C250,875 500,905 800,915 C1100,925 1350,885 1600,892 L1600,1000 L0,1000 Z'

// Bottom pins: y is measured up from the bottom edge (negative is up).

function knoll(cx: number, color: string): string {
  return `<path d="M${cx - 260},0 C${cx - 180},-150 ${cx + 180},-150 ${cx + 260},0 Z" fill="${color}"/>`
}

function tree(color: string): string {
  return (
    `<g fill="${color}" transform="translate(0 -1000)">` +
    `<path d="M112,880 L118,640 C110,610 96,590 80,575 L86,570 C102,582 114,596 121,612 L124,560 L132,560 L134,640 L232,688 L229,695 L134,662 L138,880 Z"/>` +
    `<circle cx="125" cy="540" r="58"/><circle cx="82" cy="575" r="40"/><circle cx="170" cy="575" r="42"/><circle cx="126" cy="490" r="40"/>` +
    `</g>`
  )
}

// Working: the eyes glow brighter and pulse. Waiting: the owl turns toward
// the chat (to its right) with wide eyes.
function owl(mood: Mood): string {
  const eyeR = mood === 'waiting' ? 7 : mood === 'working' ? 6.2 : 5.5
  const eyeFill = mood === 'idle' ? '#f0bd62' : '#ffd77e'
  const glow =
    mood === 'working'
      ? `<g class="eyeglow" fill="#ffcf6a"><circle cx="-10" cy="-58" r="15"/><circle cx="10" cy="-58" r="15"/></g>`
      : ''

  return (
    `<g transform="translate(206 -310) scale(0.72)">` +
    `<g class="${mood === 'waiting' ? 'owlalert' : 'owlhead'}">` +
    `<g fill="#0b0f1e">` +
    `<path d="M0,-80 C-18,-80 -28,-66 -28,-50 C-30,-28 -24,-8 -12,0 L12,0 C24,-8 30,-28 28,-50 C28,-66 18,-80 0,-80 Z"/>` +
    `<path d="M-22,-72 L-27,-92 L-11,-78 Z"/><path d="M22,-72 L27,-92 L11,-78 Z"/>` +
    `</g>` +
    glow +
    `<g class="blink" fill="${eyeFill}"><circle cx="-10" cy="-58" r="${eyeR}"/><circle cx="10" cy="-58" r="${eyeR}"/></g>` +
    `</g></g>`
  )
}

// Fireflies circling the tree's crown while Claude works.
function gather(): string {
  const rand = rng(404)
  let out = ''

  for (let i = 0; i < 14; i++) {
    const r = r1(70 + rand() * 90)
    const d = r1(10 + rand() * 10)
    const del = r1(-rand() * 20)
    const pulse = r1(2 + rand() * 3)
    out +=
      `<g class="orbit" style="animation-duration:${d}s;animation-delay:${del}s">` +
      `<circle cx="${-r}" cy="0" r="3" fill="none"/>` +
      `<g class="glim" style="animation-duration:${pulse}s;animation-delay:${del}s">` +
      `<circle cx="${r}" cy="0" r="9" fill="#e8f08a" opacity="0.22"/><circle cx="${r}" cy="0" r="2.8" fill="#f6fab8"/>` +
      `</g></g>`
  }

  return `<g transform="translate(126 -470) scale(1 0.5)">${out}</g>`
}

function deer(color: string, alert: boolean): string {
  return (
    `<g transform="translate(-180 -118)" fill="${color}" stroke="${color}">` +
    `<ellipse cx="0" cy="-70" rx="45" ry="21" stroke="none"/>` +
    `<path d="M-30,-58 L-32,0 M-18,-58 L-15,0 M24,-58 L27,0 M36,-58 L39,0" stroke-width="5" stroke-linecap="round" fill="none"/>` +
    `<path d="M42,-82 L52,-90 L48,-72 Z" stroke="none"/>` +
    `<g class="${alert ? 'still' : 'graze'}">` +
    `<path d="M-30,-82 C-42,-96 -48,-108 -52,-120 L-40,-124 C-36,-112 -26,-98 -16,-86 Z" stroke="none"/>` +
    `<ellipse cx="-58" cy="-124" rx="15" ry="8" transform="rotate(-20 -58 -124)" stroke="none"/>` +
    (alert
      ? `<path d="M-50,-130 L-46,-152 L-40,-131 Z" stroke="none"/><path d="M-42,-130 L-30,-148 L-34,-127 Z" stroke="none"/>`
      : `<path d="M-48,-132 L-40,-146 L-44,-130 Z" stroke="none"/>`) +
    `<path d="M-50,-132 C-52,-150 -46,-160 -38,-170 M-48,-148 L-60,-158 M-44,-160 L-34,-166" stroke-width="2.5" fill="none" stroke-linecap="round"/>` +
    `</g>` +
    `</g>`
  )
}

// A hare sitting up, facing left: a clear silhouette even at small sizes.
// Alert: both ears straight up and taller, no twitching.
function hare(color: string, alert: boolean): string {
  const ears = alert
    ? `<g><ellipse cx="-24" cy="-104" rx="6.5" ry="31" transform="rotate(-3 -24 -104)"/>` +
      `<ellipse cx="-11" cy="-104" rx="6.5" ry="31" transform="rotate(4 -11 -104)"/></g>`
    : `<g class="ears"><ellipse cx="-22" cy="-98" rx="6.5" ry="27" transform="rotate(-14 -22 -98)"/>` +
      `<ellipse cx="-9" cy="-97" rx="6.5" ry="26" transform="rotate(10 -9 -97)"/></g>`

  return (
    `<g transform="translate(-190 -118) scale(1.25)" fill="${color}">` +
    ears +
    `<g class="breathe">` +
    `<ellipse cx="10" cy="-30" rx="36" ry="28"/>` +
    `<ellipse cx="28" cy="-20" rx="24" ry="20"/>` +
    `<ellipse cx="-22" cy="-62" rx="19" ry="15"/>` +
    `<ellipse cx="-16" cy="-4" rx="12" ry="4.5"/>` +
    `<ellipse cx="30" cy="-3" rx="18" ry="5"/>` +
    `<circle cx="48" cy="-36" r="8"/>` +
    `</g>` +
    `<circle cx="-28" cy="-66" r="2.2" fill="#c9d2ea" opacity="0.7"/>` +
    `</g>`
  )
}

function fireflies(cx: number, seed: number): string {
  const rand = rng(seed)
  let out = ''

  for (let i = 0; i < 8; i++) {
    const x = r1(cx - 220 + rand() * 440)
    const y = r1(-140 - rand() * 220)
    const d = r1(7 + rand() * 6)
    const del = r1(-rand() * 12)
    out += `<g class="fly" style="animation-duration:${d}s;animation-delay:${del}s"><circle cx="${x}" cy="${y}" r="7" fill="#e8f08a" opacity="0.18"/><circle cx="${x}" cy="${y}" r="2.4" fill="#f4f8b0"/></g>`
  }

  return out
}

function bird(x: number, y: number, s: number): string {
  return `<g transform="translate(${x} ${y}) scale(${s})"><path class="flap" d="M-16,0 Q-8,-8 0,0 Q8,-8 16,0" fill="none" stroke="#1c2238" stroke-width="2.4" stroke-linecap="round"/></g>`
}

function flock(): string {
  const v: [number, number][] = [[0, 0], [-26, -14], [-26, 14], [-52, -28], [-52, 28], [-78, -40], [-78, 40]]

  return `<g class="flock">${v.map(([x, y]) => bird(x, y + 300, 1)).join('')}</g>`
}

function soaring(): string {
  return `<g transform="translate(-200 170)"><g class="soar">${bird(60, 0, 1.3)}${bird(-40, 50, 1)}</g></g>`
}

function clouds(light: number): string {
  const c = mix('#4a5878', '#dfe6f0', light)
  const blob = (x: number, y: number, s: number) =>
    `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="0" rx="90" ry="22"/><ellipse cx="-30" cy="-14" rx="40" ry="22"/><ellipse cx="25" cy="-18" rx="48" ry="26"/></g>`

  return `<g class="cloud" fill="${c}" opacity="0.38">${blob(500, 200, 1)}${blob(1050, 330, 0.8)}${blob(800, 120, 0.6)}</g>`
}

// The "done" star: one long, bright crossing, played once when drawn.
function starBurst(): string {
  return (
    `<g transform="translate(480 70)"><g class="burst">` +
    `<line x1="-190" y1="-80" x2="0" y2="0" stroke="url(#trail)" stroke-width="2.6" stroke-linecap="round"/>` +
    `<circle cx="0" cy="0" r="14" fill="#dfe8ff" opacity="0.3"/><circle cx="0" cy="0" r="3.4" fill="#ffffff"/>` +
    `</g></g>`
  )
}

// ---------- fitting any window ----------

// With "slice", a window of aspect a (width/height) below 1.6 shows only
// x from 800 - 500a to 800 + 500a. Each step slides the edge pins inward,
// shrinks them a little, and pulls the moon and sun onto the visible arc.
function fitCss(sunX: number | null, moonX: number | null): string {
  const arc = (t: number, half: number) => r1(800 + (t - 0.5) * 2 * half * 0.82)
  const rules = (edge: number, s: number, half: number) =>
    `.pTL{transform:translate(${edge}px,0) scale(${s})}` +
    `.pTR{transform:translate(${1600 - edge}px,0) scale(${s})}` +
    `.pBL{transform:translate(${edge}px,1000px) scale(${s})}` +
    `.pBR{transform:translate(${1600 - edge}px,1000px) scale(${s})}` +
    (moonX === null ? '' : `.pM{transform:translate(${arc(moonX, half)}px,0)}`) +
    (sunX === null ? '' : `.pS{transform:translate(${arc(sunX, half)}px,0)}`)

  let css = rules(0, 1, 800)

  for (let a = 1.55; a > 0.3; a -= 0.1) {
    const half = 500 * a
    const edge = r1(800 - half)
    const s = r1(Math.min(1, 0.45 + a * 0.5) * 100) / 100
    css += `@media (max-aspect-ratio: ${Math.round(a * 100)}/100){${rules(edge, s, half)}}`
  }

  return css
}

// ---------- the whole scene ----------

const CSS = `
.tw1{animation:tw 6s ease-in-out infinite}
.tw2{animation:tw 9s ease-in-out infinite;animation-delay:-4s}
.tw3{animation:tw 13s ease-in-out infinite;animation-delay:-8s}
@keyframes tw{0%,100%{opacity:1}50%{opacity:.2}}
.halo{transform-box:fill-box;transform-origin:center;animation:halo 10s ease-in-out infinite alternate}
@keyframes halo{0%{transform:scale(.92)}100%{transform:scale(1.08)}}
.blink{transform-box:fill-box;transform-origin:center;animation:blink 7s ease-in-out infinite}
@keyframes blink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
.owlhead{transform-box:fill-box;transform-origin:50% 100%;animation:look 22s ease-in-out infinite}
@keyframes look{0%,40%{transform:rotate(0deg)}48%,70%{transform:rotate(-10deg)}78%,100%{transform:rotate(0deg)}}
.graze{transform-box:fill-box;transform-origin:100% 100%;animation:graze 30s ease-in-out infinite}
@keyframes graze{0%,30%{transform:rotate(0deg)}42%,78%{transform:rotate(-38deg)}90%,100%{transform:rotate(0deg)}}
.ears{transform-box:fill-box;transform-origin:50% 100%;animation:ears 8s ease-in-out infinite}
@keyframes ears{0%,80%,100%{transform:rotate(0deg)}84%{transform:rotate(-9deg)}88%{transform:rotate(3deg)}92%{transform:rotate(0deg)}}
.breathe{transform-box:fill-box;transform-origin:50% 100%;animation:breathe 5s ease-in-out infinite alternate}
@keyframes breathe{0%{transform:scaleY(1)}100%{transform:scaleY(1.025)}}
.fly{opacity:.1;animation:fly 9s ease-in-out infinite alternate}
@keyframes fly{0%{opacity:.05;transform:translate(0,0)}50%{opacity:1}100%{opacity:.1;transform:translate(26px,-34px)}}
.flap{transform-box:fill-box;transform-origin:center;animation:flap 1.6s ease-in-out infinite alternate}
@keyframes flap{0%{transform:scaleY(1)}100%{transform:scaleY(.4)}}
.flock{animation:cross 70s linear infinite}
@keyframes cross{0%{transform:translate(-200px,0)}100%{transform:translate(1900px,-140px)}}
.soar{transform-box:fill-box;transform-origin:center;animation:soar 40s linear infinite}
@keyframes soar{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
.cloud{animation:cloud 180s ease-in-out infinite alternate}
@keyframes cloud{0%{transform:translate(-120px,0)}100%{transform:translate(160px,0)}}
.owlalert{transform-box:fill-box;transform-origin:50% 100%;transform:rotate(12deg)}
.eyeglow{opacity:.45;animation:eyeglow 2.4s ease-in-out infinite alternate}
@keyframes eyeglow{0%{opacity:.2}100%{opacity:.7}}
.orbit{transform-box:fill-box;transform-origin:center;animation:orbit 14s linear infinite}
@keyframes orbit{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
.glim{animation:glim 3s ease-in-out infinite alternate}
@keyframes glim{0%{opacity:.25}100%{opacity:1}}
.burst{opacity:0;animation:burst 2.6s ease-out 1 both}
@keyframes burst{0%{opacity:0;transform:translate(0,0)}10%{opacity:1}70%{opacity:.95}100%{opacity:0;transform:translate(640px,270px)}}
`

export function buildScene(m: SkyMoment): string {
  const h = ((m.hour % 24) + 24) % 24
  const light = daylight(h)
  const night = 1 - light
  const [top, middle, horizon] = skyAt(h)
  const far = mix('#0c1226', '#3a4a66', light)
  const mid = mix('#080c1c', '#2b384f', light)
  const near = mix('#05070f', '#1c2638', light)
  const ink = mix('#04060d', '#151d2c', light)

  const owlHour = h >= 21 || h < 4.5
  const deerHour = h >= 4.5 && h < 8.5
  const dayHour = h >= 8.5 && h < 16
  const duskHour = h >= 16 && h < 19.5
  const hareHour = h >= 19.5 && h < 21
  const starry = night > 0.02
  const mood: Mood = m.mood ?? 'idle'
  const alert = mood === 'waiting'
  // While Claude waits on you in the hours of the birds, the hare comes out to listen.
  const showHare = hareHour || (alert && (dayHour || duskHour))

  const s = sun(h)
  const mo = moon(h, m.moonPhase, light)
  const o = r1(night)

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">` +
    `<style>${CSS}${fitCss(s ? s.x : null, mo ? mo.x : null)}</style>` +
    `<defs>` +
    `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="0.55" stop-color="${middle}"/><stop offset="0.85" stop-color="${horizon}"/></linearGradient>` +
    `<radialGradient id="moonglow"><stop offset="0" stop-color="#e9ecff" stop-opacity="0.5"/><stop offset="1" stop-color="#e9ecff" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="sunglow"><stop offset="0" stop-color="#ffe9c2" stop-opacity="0.55"/><stop offset="1" stop-color="#ffe9c2" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="trail" gradientUnits="userSpaceOnUse" x1="-190" y1="-80" x2="0" y2="0"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.95"/></linearGradient>` +
    `</defs>` +
    `<rect width="1600" height="1000" fill="url(#sky)"/>` +
    (starry ? `<g opacity="${o}">${starfield()}</g>` : '') +
    (m.starBurst ? starBurst() : '') +
    (s ? `<g class="pS">${s.svg}</g>` : '') +
    (mo ? `<g class="pM">${mo.svg}</g>` : '') +
    (dayHour || (duskHour && h < 18) ? clouds(light) : '') +
    (duskHour ? flock() : '') +
    (dayHour ? `<g class="pTR">${soaring()}</g>` : '') +
    `<path d="${HILL_FAR}" fill="${far}"/>` +
    `<path d="${HILL_MID}" fill="${mid}"/>` +
    `<path d="${HILL_NEAR}" fill="${near}"/>` +
    `<g class="pBL">${knoll(120, near)}${tree(ink)}${owlHour ? owl(mood) : ''}${owlHour || hareHour ? fireflies(160, 77) : ''}${mood === 'working' ? gather() : ''}</g>` +
    `<g class="pBR">${knoll(-170, near)}${deerHour ? deer(ink, alert) : ''}${showHare ? hare(ink, alert) : ''}${hareHour ? fireflies(-190, 91) : ''}</g>` +
    `</svg>`
  )
}

export function describe(m: SkyMoment): string {
  const h = ((m.hour % 24) + 24) % 24
  const animal =
    h >= 21 || h < 4.5 ? 'an owl keeps watch from the tree'
      : h < 8.5 ? 'a deer grazes on the hill'
        : h < 16 ? 'two birds circle high on the warm air'
          : h < 19.5 ? 'a flock heads home across the sky'
            : 'a hare sits up on the hill among fireflies'
  const pct = Math.round(moonLitFraction(m.moonPhase) * 100)

  return `${moonName(m.moonPhase)} (${pct}% lit); ${animal}.`
}
