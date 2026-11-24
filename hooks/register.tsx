import type { EngineInterface, Register, ThemeSetArgs } from 'claude-code'

import type { SkyMood } from '../types'
import { makeColors } from './make-colors.js'
import { buildScene, describe, moonPhaseAt } from './scene'
import type { SkyMoment } from './scene'

// Your time zone. Empty uses the system's; set an IANA name such as
// 'Asia/Kolkata' if the sky's hour looks wrong.
const TIME_ZONE = ''

// How often the sky is redrawn to follow the clock and the moon.
const REDRAW_MS = 5 * 60 * 1000

// The "done" star is drawn only this long after a turn ends, so a later
// redraw does not fly it again.
const BURST_MS = 3000

// The "done" sound: a small, soft two-note chime, made quiet in the file
// itself (Windows' player has no volume control). Gain: 0 to 4; 1 is the
// file as made. sounds/make-chime.mjs.txt is the script that makes it.
const STAR_SOUND = 'sounds/star.wav'
const STAR_GAIN = 1

const TICK = { plugin: 'animal-sky', key: 'tick' } as const
const MOOD = { plugin: 'animal-sky', key: 'mood' } as const
const BURST = { plugin: 'animal-sky', key: 'burstAt' } as const

// On Windows the engine's player plays nothing, so the sound goes through
// PowerShell's own player, which takes about a second to start: the star
// waits that long so sound and light arrive together.
const WINDOWS_SOUND_LEAD_MS = 800

// Set during a turn when Claude puts a question to you; read when it ends.
let askedThisTurn = false

// Filled at session start from $.session.info().
let isWindows = false

// The waiting Windows player's trigger file, once it has said where it is.
let triggerPath: string | undefined
let triggerCount = 0

// Windows: one PowerShell player for the whole session, with the sound already
// loaded, waiting on a trigger file in %TEMP%\animal-sky. Touching the file
// plays the sound at once, so it starts with the star instead of a second
// late. The engine ends the child when the mod unloads or reloads.
function startWindowsPlayer($: EngineInterface): void {
  const wav = `${$.plugin.root}/${STAR_SOUND}`.replace(/'/g, "''")
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$d = Join-Path $env:TEMP 'animal-sky'",
    'New-Item -ItemType Directory -Force $d | Out-Null',
    "$f = Join-Path $d 'star.trigger'",
    'Set-Content -Path $f -Value 0',
    `$p = New-Object System.Media.SoundPlayer '${wav}'`,
    '$p.Load()',
    "$w = New-Object System.IO.FileSystemWatcher $d, 'star.trigger'",
    '$w.NotifyFilter = [System.IO.NotifyFilters]::LastWrite',
    '[Console]::Out.WriteLine($f); [Console]::Out.Flush()',
    '$last = [DateTime]::MinValue',
    'while ($true) {',
    '  $r = $w.WaitForChanged([System.IO.WatcherChangeTypes]::Changed, 3600000)',
    '  if (-not $r.TimedOut -and ([DateTime]::UtcNow - $last).TotalMilliseconds -gt 500) { $p.Play(); $last = [DateTime]::UtcNow }',
    '}',
  ].join('; ').replace(/\{; /g, '{ ').replace(/; \}/g, ' }')

  const child = $.process.spawn({
    argv: ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', script],
  })

  void (async () => {
    try {
      for await (const { stream, text } of child) {
        if (stream === 'stdout' && triggerPath === undefined) {
          const line = text.split(/\r?\n/)[0].trim()

          if (line !== '') triggerPath = line
        }
      }
    } catch {
      // the player could not start; flyStar falls back to a one-off player
    }
    triggerPath = undefined
  })()
}

// Sends the sky to the app. A session reopened before the desktop app
// reconnects has no one to draw it, so this runs again on every attach.
async function applyLook($: EngineInterface): Promise<string> {
  const set = await $.theme.set(LOOK)
  lookDrawn = set.isDrawn
  $.ui.status(set.isDrawn ? undefined : set.reason)

  return set.isDrawn ? 'drawn' : `not drawn: ${set.reason}`
}

// Whether the last applyLook reached an app; the redraw timer retries if not.
let lookDrawn = false

// The "done" star and its sound, as close together as this machine allows.
// Returns a line for /sky-star; `wait` holds the one-off player until it ends.
async function flyStar($: EngineInterface, wait: boolean): Promise<string> {
  if (!isWindows) {
    await $.state.set(BURST, await $.clock.now())

    try {
      await $.audio.play({ asset: STAR_SOUND }, { gain: STAR_GAIN })

      return 'A shooting star crossed, with its sound.'
    } catch (err) {
      return `The star flew, but the sound did not play: ${String(err)}`
    }
  }

  if (triggerPath !== undefined) {
    try {
      triggerCount += 1
      await $.fs.write(triggerPath, String(triggerCount))
      await $.state.set(BURST, await $.clock.now())

      return 'A shooting star crossed, with its sound (instant player).'
    } catch {
      // fall through to the one-off player
    }
  }

  const wav = `${$.plugin.root}/${STAR_SOUND}`.replace(/'/g, "''")
  $.clock.after(WINDOWS_SOUND_LEAD_MS, async () => {
    await $.state.set(BURST, await $.clock.now())
  })
  const playing = $.process.run([
    'powershell.exe', '-NoProfile', '-NonInteractive', '-Command',
    `(New-Object System.Media.SoundPlayer '${wav}').PlaySync()`,
  ])

  if (!wait) {
    playing.catch(() => undefined)

    return 'played through a one-off player'
  }
  const ran = await playing

  return ran.exitCode === 0
    ? 'A shooting star crossed, with its sound (one-off player: the waiting one was not ready).'
    : `The star flew, but Windows could not play the sound: ${ran.stderr.slice(0, 200)}`
}

function localHour(ms: number): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      ...(TIME_ZONE ? { timeZone: TIME_ZONE } : {}),
    }).formatToParts(new Date(ms))
    const hh = Number(parts.find(p => p.type === 'hour')?.value)
    const mm = Number(parts.find(p => p.type === 'minute')?.value)

    if (Number.isFinite(hh) && Number.isFinite(mm)) return hh + mm / 60
  } catch {
    // fall through to Date
  }
  const d = new Date(ms)

  return d.getHours() + d.getMinutes() / 60
}

function momentAt(ms: number, mood: SkyMood = 'idle', burstAt = 0): SkyMoment {
  return {
    hour: localHour(ms),
    moonPhase: moonPhaseAt(ms),
    mood,
    starBurst: ms - burstAt >= 0 && ms - burstAt < BURST_MS,
  }
}

// Does this tool call put a question to you? AskUserQuestion always does;
// the desktop app's next-step box does when it carries an `ask`.
function isQuestion(tool: string, input: unknown): boolean {
  if (tool === 'AskUserQuestion') return true
  if (!tool.endsWith('wrap_up')) return false
  const ask = (input as { ask?: unknown }).ask

  return typeof ask === 'string' && ask.trim() !== ''
}

// A night palette: deep indigo surfaces, starlight accents.
const { theme, problems } = makeColors({
  label: 'Animal sky',
  only: 'dark',
  roles: { accent: '#8fb4ff', danger: '#e07a7a', success: '#8cc79a', warning: '#e6b86a', pro: '#b59cf0' },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#0b1022',
        'surface-1': '#111830',
        'surface-2': '#162037',
        'surface-3': '#1b253e',
        'text-primary': '#e9edf8',
        'text-secondary': '#c4cbdc',
        'text-muted': '#9ba4bb',
      },
    },
  },
})

const LOOK: ThemeSetArgs = {
  colors: theme,
  backdrop: { scene: 'animal-sky', glass: { blur: 18, tint: '#0b1022', opacity: 0.55 } },
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))

    if (unpainted !== undefined) {
      $.ui.toast(unpainted)
    }
    await applyLook($)

    const info = await $.session.info()
    isWindows = info.platform === 'windows'

    if (isWindows) {
      startWindowsPlayer($)
    }

    await $.command.register({
      name: 'sky',
      description: 'Say what the animal sky is showing right now',
    })
    await $.command.register({
      name: 'sky-star',
      description: 'Fly the "done" shooting star and play its sound, to try it',
    })

    $.clock.every(REDRAW_MS, async () => {
      if (!lookDrawn) await applyLook($)
      const now = await $.clock.now()
      await $.state.set(TICK, Math.floor(now / REDRAW_MS))
    })

    return next(e)
  })

  // The desktop or mobile app joined (or rejoined): draw the sky for it.
  on('session.attach', async ($, e, next) => {
    const joined = await next(e)

    if (e.surface === 'desktop' || e.surface === 'mobile') {
      await applyLook($)
    }

    return joined
  })

  // Claude starts working: fireflies gather, the owl's eyes glow.
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      askedThisTurn = false
      // You just sent a message, so an app is surely there: draw if not yet.
      if (!lookDrawn) await applyLook($)
      await $.state.set(MOOD, 'working')
    }

    return next(e)
  })

  // A question to you: the animals look up while it is open.
  on('tool.call', async ($, e, next) => {
    if (!isQuestion(e.tool, e)) return next(e)

    if (e.tool !== 'AskUserQuestion') {
      // The next-step box: its question stays open after the turn ends.
      askedThisTurn = true

      return next(e)
    }

    await $.state.set(MOOD, 'waiting')
    const ran = await next(e)
    await $.state.set(MOOD, 'working')

    return ran
  })

  // Claude is done: a shooting star crosses with its sound, and the animals
  // stay alert if the turn ended on a question for you.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)

    if (e.agentId !== undefined) return done

    const isAnswer = e.reason === 'answer'
    const endsAsking = askedThisTurn || e.answer.trim().endsWith('?')
    await $.state.set(MOOD, isAnswer && endsAsking ? 'waiting' : 'idle')

    if (isAnswer) {
      await flyStar($, false)
    }

    return done
  })

  on('command.run', { command: 'sky' }, async $ => {
    const now = await $.clock.now()
    const { value: mood = 'idle' } = await $.state.get(MOOD)
    // Re-send the sky and say plainly whether the app took it.
    const look = await applyLook($)
    const surfaces = (await $.session.surfaces()).join(', ') || 'none'

    return { text: `${describe(momentAt(now))} Claude is ${mood}. Sky: ${look} (attached: ${surfaces}).` }
  })

  on('command.run', { command: 'sky-star' }, async $ => ({ text: await flyStar($, true) }))

  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    if (e.surface !== 'desktop' && e.surface !== 'mobile') {
      return next(e)
    }

    // Each get subscribes this drawing, so a change of any of them redraws it.
    await $.state.get(TICK)
    const { value: mood = 'idle' } = await $.state.get(MOOD)
    const { value: burstAt = 0 } = await $.state.get(BURST)
    const now = await $.clock.now()
    const { Svg } = $.ui.resolve(e)

    return (
      <Svg
        source={buildScene(momentAt(now, mood, burstAt))}
        alt="A quiet night sky over dark hills, following the clock and the moon, answering what Claude is doing"
        isInteractive
      />
    )
  })
}
