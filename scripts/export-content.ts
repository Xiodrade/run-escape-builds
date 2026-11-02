// Snapshots Run Escape's content into public/data/content.json, for the site
// to read: adventurers, weapons and their levels, passives, gear, sets,
// evolutions, the shop and how stats read. It imports the game's own tables
// and helpers, so the numbers and wording are the game's.
//
//   npm run export                     # the game checked out at ../Run-Escape
//   GAME=C:/path/to/Run-Escape npm run export
//
// Run it again after each game release, with the game at that release, and
// commit the JSON (and any new icons: npm run icons).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const GAME = resolve(process.env.GAME ?? join(here, "../../Run-Escape"));
const OUT = join(here, "../public/data/content.json");

async function load<T = any>(file: string): Promise<T> {
    return import(pathToFileURL(join(GAME, "src/game", file)).href);
}

const { CHARACTERS } = await load("content/characters.ts");
const { WEAPONS, getWeaponStyle } = await load("content/weapons.ts");
const { PASSIVES } = await load("content/passives.ts");
const { GEAR, GEAR_SLOTS } = await load("content/items.ts");
const { SETS } = await load("content/sets.ts");
const { EVOLUTIONS } = await load("content/evolutions.ts");
const { STAT_INFO, formatStats } = await load("content/stats.ts");
const { RARITIES, RARITY_ORDER } = await load("content/rarity.ts");
const { SHOP_UPGRADES } = await load("content/shop.ts");
const { describeUnlockTask } = await load("content/unlocks.ts");
const { weaponStats, formatWeaponStat } = await load("content/weaponStats.ts");
const { CAPPED_STATS } = await load("content/endless.ts");
const { MAX_WEAPONS, MAX_PASSIVES } = await load("core/Upgrades.ts");

const gamePackage = JSON.parse(readFileSync(join(GAME, "package.json"), "utf8"));

const unlock = (task: any) => (task ? describeUnlockTask(task) : undefined);

const content = {
    gameVersion: gamePackage.version as string,
    exportedAt: new Date().toISOString().slice(0, 10),
    maxWeapons: MAX_WEAPONS,
    maxPassives: MAX_PASSIVES,
    // Weapon speed (cooldown) does nothing past this (Sim.ts)
    cooldownCap: 0.6,
    playerBaseHp: 25,
    stats: Object.fromEntries(
        Object.entries(STAT_INFO).map(([key, info]: [string, any]) => [
            key,
            { label: info.label, unit: info.unit, capped: CAPPED_STATS.has(key) },
        ]),
    ),
    rarities: Object.fromEntries(
        RARITY_ORDER.map((r: string) => [
            r,
            { name: RARITIES[r].name, color: RARITIES[r].color, power: RARITIES[r].power },
        ]),
    ),
    gearSlots: GEAR_SLOTS.map((s: any) => ({ id: s.id, name: s.name })),
    characters: CHARACTERS.map((c: any) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        style: c.style,
        startingWeapon: c.startingWeapon,
        bonus: c.bonus,
        bonusLines: formatStats(c.bonus),
        unlock: unlock(c.unlock),
    })),
    weapons: WEAPONS.map((w: any) => ({
        id: w.id,
        name: w.name,
        kind: w.kind,
        description: w.description,
        iconObjId: w.iconObjId,
        rarity: w.rarity,
        // Class weapons: only for adventurers who fight this way
        classStyle: w.style,
        // What its hits count as, for style damage bonuses
        damageStyle: getWeaponStyle(w),
        family: w.family,
        evolved: w.evolved === true,
        pickOnly: w.pickOnly === true,
        evolution: w.evolution,
        hilts: w.hilts && {
            level: w.hilts.level,
            into: w.hilts.into.map((h: any) => h.weaponId),
        },
        unlock: unlock(w.unlock),
        levels: w.levels.map((level: any) => ({
            name: level.name,
            objId: level.objId,
            description: level.description,
            lines: weaponStats(w, level).map(formatWeaponStat),
        })),
    })),
    passives: PASSIVES.map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        stat: p.stat,
        alsoAdds: p.alsoAdds ?? [],
        perLevel: p.perLevel,
        effect: p.effect,
        unit: p.unit,
        whole: p.whole === true,
        maxLevel: p.maxLevel,
        rarity: p.rarity,
        iconObjId: p.iconObjId,
        unlock: unlock(p.unlock),
    })),
    gear: GEAR.map((g: any) => ({
        id: g.id,
        name: g.name,
        objId: g.objId,
        rarity: g.rarity,
        slot: g.slot,
        stats: g.stats,
        lines: formatStats(g.stats),
        set: g.set,
        variantOf: g.variantOf,
        unlock: unlock(g.unlock),
    })),
    sets: SETS.map((s: any) => ({
        id: s.id,
        name: s.name,
        needed: s.needed,
        bonus: s.bonus,
        stats: s.stats ?? {},
        weapons: s.weapons,
    })),
    evolutions: EVOLUTIONS.map((e: any) => ({
        into: e.into.id,
        passive: e.passive.id,
        weapons: e.weapons.map((w: any) => w.id),
        name: e.name,
    })),
    shop: SHOP_UPGRADES.map((u: any) => ({
        id: u.id,
        name: u.name,
        description: u.description,
        stat: u.stat,
        perRank: u.perRank,
        maxRank: u.maxRank,
    })),
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(content));
console.log(
    `Run Escape ${content.gameVersion}: ${content.characters.length} adventurers, ` +
        `${content.weapons.length} weapons, ${content.passives.length} passives, ` +
        `${content.gear.length} gear, ${content.sets.length} sets -> ${OUT}`,
);
