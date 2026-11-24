# animal-sky

A calm, moving night-sky background for the Claude desktop app (Code tab), as a Claude Code mod.

- **Follows your clock and the real moon.** The sky moves from deep night to dawn, soft day and dusk on your local time, and the moon shows its real phase and rough place in the sky.
- **An animal for each part of the day:** an owl in the tree late at night, a deer grazing at dawn, birds circling by day, a flock heading home at dusk, a hare among fireflies in the evening.
- **It answers what Claude is doing:**
  - *Working:* fireflies circle the tree, and at night the owl's eyes glow.
  - *Done:* a shooting star crosses the sky with a small, soft chime.
  - *Waiting for you:* when Claude asks you something, the animal looks up with its ears raised.
- Twinkling stars, drifting clouds and fireflies; the animals stay at the edges of any window size, away from your text.

## Install

At the prompt of a terminal Claude Code session:

```
/plugin install animal-sky --marketplace VivekJain13/animal-sky
```

Answer `y` to add the marketplace, then pick a scope (the user scope, first in the list, makes it load in every session).

From a shell:

```
claude plugin install animal-sky --marketplace VivekJain13/animal-sky
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `VivekJain13/animal-sky`, then **Add plugin**.

The background draws in the desktop and mobile apps; a plain terminal shows no background.

## Commands

- `/sky` says what the sky shows now (moon phase, the animal of the hour, what Claude is doing) and whether the app drew it.
- `/sky-star` flies the "done" shooting star and plays its chime, to try it.

## Notes

- **Time zone:** the sky uses your system's time zone. To pin another, set `TIME_ZONE` near the top of `hooks/register.tsx` to a name such as `'Asia/Kolkata'`.
- **Sound on Windows:** Claude Code's own player is silent on Windows, so the mod keeps one PowerShell sound player waiting during the session and plays the chime through it (a small trigger file in `%TEMP%\animal-sky`). On macOS it uses Claude Code's player.
- **The chime** is made from code: `sounds/make-chime.mjs.txt` rebuilds `sounds/star.wav` (`node make-chime.mjs <out.wav>`); change `TARGET` for a softer or louder chime.
- Made as an early-access Claude Code mod; the mod API may change between Claude Code releases.
