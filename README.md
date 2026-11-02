# Run Escape Builds

Plan a build for [Run Escape](https://github.com/Dynrothe/Run-Escape), the Old School RuneScape
survivors game: pick an adventurer, the weapons and passives you're going for and the gear you'd
wear. It shows the stat totals, set bonuses and evolutions the game would give, and the whole build
saves as an image to share, or as a link.

It's a static site on GitHub Pages: no server and no database. A build lives in its link, and
everything else is the game's content, snapshotted into `public/`.

## How it works

- `public/data/content.json` is Run Escape's content (adventurers, weapons and their levels,
  passives, gear, sets, evolutions, the shop), exported from the game's own tables and helpers by
  `scripts/export-content.ts`, so the wording and numbers are the game's.
- `public/icons/` are the item icons, drawn from the OSRS cache with the game's own icon renderer by
  `scripts/export-icons.ts`. The cache never leaves the machine that draws them.
- `src/build.ts` is the build: what can go in each slot, the stat totals (as the game's
  `Sim.updateStats` adds them up), set bonuses, evolutions and hilts, and the link format.
  `scripts/verify-totals.ts` checks the totals against the game's own `Sim` for hundreds of random
  builds.

## Working on it

```sh
npm install
npm run dev        # http://localhost:5173
npm test
npm run build
```

## After a Run Escape release

With the game checked out next to this repository (`../Run-Escape`, or set `GAME=`), at the new
release, with its cache downloaded (`npm run download-caches` there):

```sh
npm run export     # public/data/content.json from the game
npm run icons      # any new icons into public/icons/
npm run verify     # the site's totals still match the game's
npm test
```

Then commit and push. Links made on an older version still open, and show which version they
were made on.

## Publishing

`.github/workflows/pages.yml` tests, builds and publishes the site on every push to `main`. To turn it
on once: Settings, Pages, Source: **GitHub Actions**.

## Credits

Run Escape is by Dynrothe. Icons are drawn from the Old School RuneScape cache, which belongs to
Jagex; this site isn't affiliated with Jagex or with Run Escape. The RuneScape-style fonts are from
the Run Escape repository. Made by Okaeri.
