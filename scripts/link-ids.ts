// Gives every adventurer, weapon, passive, gear piece, rarity and game version
// a number for short build links (public/data/link-ids.json). The lists only
// ever grow: new things go on the end and nothing is renumbered or removed,
// so links made today still open the same build after any game update.
//
//   npm run link-ids                   # runs after npm run export by itself
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Content, LinkIds } from "../src/content";


const here = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(here, "../public/data/content.json");
const OUT = join(here, "../public/data/link-ids.json");

const content = JSON.parse(readFileSync(CONTENT, "utf8")) as Content;
const ids: LinkIds = existsSync(OUT)
    ? JSON.parse(readFileSync(OUT, "utf8"))
    : { characters: [], weapons: [], passives: [], gear: [], rarities: [], versions: [] };

const current: { [K in keyof LinkIds]: string[] } = {
    characters: content.characters.map((c) => c.id),
    weapons: content.weapons.map((w) => w.id),
    passives: content.passives.map((p) => p.id),
    gear: content.gear.map((g) => g.id),
    rarities: Object.keys(content.rarities),
    versions: [content.gameVersion],
};

let added = 0;
for (const kind of Object.keys(current) as (keyof LinkIds)[]) {
    const known = new Set(ids[kind]);
    for (const id of current[kind]) {
        if (!known.has(id)) {
            ids[kind].push(id);
            added++;
        }
    }
}
writeFileSync(OUT, JSON.stringify(ids, null, 1) + "\n");
console.log(`${added} new link numbers -> ${OUT}`);
