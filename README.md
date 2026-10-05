# Drift & Bloom

**Play: https://iknalos.github.io/DriftAndBloom/**

A moonlit lily-pad hopping game. Tap a pad within reach to hop your spirit across the
pond, collect blooms, and land on the lotus before the clock runs out. There are 10
stages × 10 levels. The clock gets shorter every level, and each stage adds a new threat:
fading pads, currents, crocodiles, falling stars, snakes, saucers, the dragon.

Getting caught pulls you into a side world. Win it and you're back on your pad; lose it
and you lose a heart:
- A croc or snake bite → **Animal World**, a sword fight through the jungle with real
  crocodiles, pythons, boars and eagles.
- A saucer beam → **Alien World**, a space shooter that ends with the mothership.
- Dragon fire → **Hell**, an archer run across lava with the horde right behind you.

Each world has its own on-screen controller. Photo credits are on the title screen
under **Credits**.

## Put it on your phone like an app

- **iPhone:** open the link in **Safari** and tap **Share**, which is inside the **⋯** menu next to the address bar on iOS 26. Then tap **Add to Home Screen**.
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
