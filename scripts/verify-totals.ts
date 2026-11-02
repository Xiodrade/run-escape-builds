// Checks the site's stat totals against Run Escape's own: for random builds
// (every adventurer, random passives at random levels and qualities, random
// gear, with and without the shop), it sets up the game's Sim with the same
// things and compares every stat. Run it after npm run export.
//
//   npm run verify                     # the game at ../Run-Escape
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Build, buildTotals, newBuild, passiveGain, shopStats, sumStats } from "../src/build";
import { Content, Game, Rarity } from "../src/content";

const here = dirname(fileURLToPath(import.meta.url));
const GAME = resolve(process.env.GAME ?? join(here, "../../Run-Escape"));
const game = new Game(
    JSON.parse(readFileSync(join(here, "../public/data/content.json"), "utf8")) as Content,
);
const load = (file: string) => import(pathToFileURL(join(GAME, "src/game", file)).href);
const { Sim } = await load("core/Sim.ts");
const { emptyStats } = await load("content/types.ts");
const { makeGrid } = await load("core/world/testGrid.ts");

function openField(): string[] {
    return Array.from({ length: 72 }, (_, y) =>
        Array.from({ length: 72 }, (_, x) =>
            x === 0 || y === 0 || x === 71 || y === 71 ? "#" : ".",
        ).join(""),
    );
}

let seed = 1;
const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = <T>(list: T[]): T => list[Math.floor(random() * list.length)];
const qualities: Rarity[] = ["common", "uncommon", "rare", "veryRare"];

let checked = 0;
let failures = 0;
for (const character of game.content.characters) {
    for (let round = 0; round < 12; round++) {
        const build: Build = newBuild(game, character.id);
        build.shop = random() < 0.5;
        build.quality = pick(qualities);
        const passives = [...game.content.passives].sort(() => random() - 0.5).slice(0, 4);
        build.passives = passives.map((p) => ({
            id: p.id,
            level: 1 + Math.floor(random() * p.maxLevel),
        }));
        for (const slot of game.content.gearSlots) {
            const options = game.content.gear.filter((g) => g.slot === slot.id);
            if (options.length > 0 && random() < 0.75) {
                build.gear[slot.id] = pick(options).id;
            }
        }
        // Lean on the sets now and then, so their bonuses get checked
        if (round % 3 === 0) {
            const set = pick(game.content.sets);
            for (const g of game.content.gear.filter((g) => g.set === set.id && !g.variantOf)) {
                build.gear[g.slot] = g.id;
            }
        }

        const metaStats = { ...emptyStats(), ...(build.shop ? shopStats(game) : {}) };
        const sim = new Sim({
            grid: makeGrid(openField(), 1000, 1000),
            characterId: character.id,
            metaStats,
            seed: 7,
            spawnX: 1036.5,
            spawnY: 1036.5,
        });
        for (const slot of build.passives) {
            const passive = game.passive.get(slot.id)!;
            sim.passives.push({
                id: slot.id,
                level: slot.level,
                value: passiveGain(game, build, passive) * slot.level,
            });
        }
        for (const id of Object.values(build.gear)) {
            sim.equip(id);
        }
        sim.updateStats();

        const ours = sumStats(buildTotals(game, build));
        for (const key of Object.keys(game.content.stats)) {
            const theirs = sim.stats[key] ?? 0;
            const mine = ours[key] ?? 0;
            if (Math.abs(theirs - mine) > 1e-9) {
                failures++;
                if (failures <= 10) {
                    console.log(
                        `${character.id} ${key}: game ${theirs}, site ${mine}`,
                        JSON.stringify({
                            passives: build.passives,
                            gear: build.gear,
                            shop: build.shop,
                        }),
                    );
                }
            }
        }
        checked++;
    }
}
console.log(`${checked} builds checked, ${failures} stats that differ`);
process.exit(failures > 0 ? 1 : 0);
