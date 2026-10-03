# Drift & Bloom

**Play: https://iknalos.github.io/DriftAndBloom/**

A moonlit lily-pad hopping game. Tap a pad within reach to hop your spirit across the
pond, collect blooms, and land on the lotus before the clock runs out. There are 10
stages × 10 levels. The clock gets shorter every level, and each stage adds a new threat:
fading pads, currents, crocodiles, falling stars, snakes, saucers, the dragon.

## Put it on your phone like an app

- **iPhone:** open the link in **Safari**, tap **Share**, then **Add to Home Screen**.
- **Android:** open the link in **Chrome**, tap **⋮**, then **Add to Home screen** or
  **Install app**.

It opens full screen from its own icon and works offline after the first visit. Your
progress and chosen spirit are saved on the phone. New versions arrive on their own: the
next launch after an update runs the new game.

This is the developer version, so every stage and level is unlocked.

## How it's built

The game is a single HTML5 canvas page with two drawing modules. `tools/build_site.py`
copies it in from the game's working folder and writes:

- `index.html`: the game plus the home-screen app tags (manifest, icon, service worker)
- `sw.js`: an offline cache stamped with a hash of every file, so updates are picked up

Each push to `main` deploys to GitHub Pages. It then opens the live site in Safari on a
simulated iPhone and saves screenshots in the run's `iphone-safari` artifact.

```powershell
python tools\build_site.py      # pull in the latest game
git add -A ; git commit -m "Update game" ; git push origin main
```
