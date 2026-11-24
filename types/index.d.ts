export type SkyTick = number

// idle: nothing running. working: Claude is on a turn. waiting: Claude asked you something.
export type SkyMood = 'idle' | 'working' | 'waiting'

declare module 'claude-code' {
  interface PluginState {
    'animal-sky': {
      tick: SkyTick
      mood: SkyMood
      // When the last turn finished, in ms since the epoch: the "done" star flies then.
      burstAt: number
    }
  }
}
