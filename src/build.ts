// A build: an adventurer, the weapons and passives they're aiming for, and the
// gear they'd wear. Everything here works the way Run Escape does (see the
// files named in each comment), so the totals are what the game would have.
import { Game, GearSet, Passive, Rarity, StatMap, Weapon } from "./content";

export type Slotted = { id: string; level: number };

export type Build = {
    // The game version it was made on
    game: string;
    character: string;
    weapons: Slotted[];
    passives: Slotted[];
    gear: Record<string, string>;
    // Count every shop upgrade as bought (more slots, and their stats)
    shop: boolean;
    // What each passive pick is assumed to roll (rarer picks add more)
    quality: Rarity;
    title: string;
    notes: string;
};

export const TITLE_MAX = 60;
export const NOTES_MAX = 600;

export function newBuild(game: Game, characterId: string): Build {
    const character = game.character.get(characterId) ?? game.content.characters[0];
    return {
        game: game.content.gameVersion,
        character: character.id,
        weapons: [{ id: character.startingWeapon, level: 1 }],
        passives: [],
        gear: {},
        shop: false,
        quality: "common",
        title: "",
        notes: "",
    };
}

// ---- What can go in a slot ----

// The shop's stats, all bought (content/shop.ts)
export function shopStats(game: Game): StatMap {
    const stats: StatMap = {};
    for (const upgrade of game.content.shop) {
        stats[upgrade.stat] = (stats[upgrade.stat] ?? 0) + upgrade.perRank * upgrade.maxRank;
    }
    return stats;
}

export function maxWeapons(game: Game, build: Build): number {
    return game.content.maxWeapons + (build.shop ? (shopStats(game).weaponSlots ?? 0) : 0);
}

export function maxPassives(game: Game, build: Build): number {
    return game.content.maxPassives + (build.shop ? (shopStats(game).passiveSlots ?? 0) : 0);
}

// Weapons a level up can offer this adventurer: their class's and everyone's,
// but not evolutions (those come from evolving) or hilted godswords (from
// their blade), plus whatever they start with (core/Upgrades.ts)
export function weaponChoices(game: Game, build: Build): Weapon[] {
    const character = game.character.get(build.character);
    return game.content.weapons.filter(
        (w) =>
            w.id === character?.startingWeapon ||
            (!w.evolved && !w.pickOnly && (!w.classStyle || w.classStyle === character?.style)),
    );
}

// Why a weapon can't go in (already carried, or one of its family is)
export function weaponBlocked(game: Game, build: Build, weapon: Weapon): string | undefined {
    if (build.weapons.some((s) => s.id === weapon.id)) {
        return "Already in the build";
    }
    if (weapon.family) {
        const same = build.weapons.find((s) => game.weapon.get(s.id)?.family === weapon.family);
        if (same) {
            return `Only one ${weapon.family} at a time`;
        }
    }
    return undefined;
}

// What a weapon in the build can become: an evolution once it's maxed and its
// passive is in the build, or a hilt at its blade's pick level
export function weaponNext(
    game: Game,
    build: Build,
    slot: Slotted,
): { kind: "evolve" | "hilt"; into: Weapon; ready: boolean; why: string }[] {
    const weapon = game.weapon.get(slot.id);
    if (!weapon) {
        return [];
    }
    const next: { kind: "evolve" | "hilt"; into: Weapon; ready: boolean; why: string }[] = [];
    if (weapon.evolution) {
        const into = game.weapon.get(weapon.evolution.into);
        const passive = game.passive.get(weapon.evolution.requiresPassive);
        if (into && passive) {
            const maxed = slot.level >= weapon.levels.length;
            const hasPassive = build.passives.some((p) => p.id === passive.id);
            const missing = [
                !maxed && `level ${weapon.levels.length}`,
                !hasPassive && passive.name,
            ].filter(Boolean);
            next.push({
                kind: "evolve",
                into,
                ready: missing.length === 0,
                why:
                    missing.length === 0
                        ? `Evolves into ${into.name}`
                        : `Evolves into ${into.name} with ${missing.join(" and ")}`,
            });
        }
    }
    if (weapon.hilts) {
        for (const id of weapon.hilts.into) {
            const into = game.weapon.get(id);
            if (into) {
                next.push({
                    kind: "hilt",
                    into,
                    ready: slot.level >= weapon.hilts.level,
                    why: `Takes a hilt at level ${weapon.hilts.level}`,
                });
            }
        }
    }
    return next;
}

// A weapon at a level: that level's name and item, or the weapon's
export function weaponLevel(weapon: Weapon, level: number) {
    const at = weapon.levels[Math.min(Math.max(level, 1), weapon.levels.length) - 1];
    return { ...at, name: at.name ?? weapon.name, objId: at.objId ?? weapon.iconObjId };
}

export function passiveBlocked(build: Build, passive: Passive): string | undefined {
    return build.passives.some((p) => p.id === passive.id) ? "Already in the build" : undefined;
}

// ---- Totals (core/Sim.ts updateStats) ----

// What one pick of a passive adds, at the build's assumed quality
// (content/passives.ts getPassiveGain)
export function passiveGain(game: Game, build: Build, passive: Passive): number {
    return passive.whole
        ? passive.perLevel
        : passive.perLevel * game.content.rarities[build.quality].power;
}

function add(into: StatMap, stats: StatMap): void {
    for (const [key, value] of Object.entries(stats)) {
        into[key] = (into[key] ?? 0) + value;
    }
}

// How many of each set's pieces are worn (content/sets.ts countSetPieces)
export function setsWorn(
    game: Game,
    build: Build,
): { set: GearSet; worn: number; total: number }[] {
    return game.content.sets
        .map((set) => ({
            set,
            worn: Object.values(build.gear).filter((id) => game.gear.get(id)?.set === set.id)
                .length,
            // The caskets' pieces; the Armoury's upgrades of them count as them
            total: game.content.gear.filter((g) => g.set === set.id && !g.variantOf).length,
        }))
        .filter((s) => s.worn > 0);
}

export type StatSource = { from: string; value: number };

// Every stat the build adds up to, and where each part comes from
export function buildTotals(game: Game, build: Build): Map<string, StatSource[]> {
    const parts = new Map<string, StatSource[]>();
    const note = (from: string, stats: StatMap) => {
        for (const [key, value] of Object.entries(stats)) {
            if (value) {
                const list = parts.get(key) ?? [];
                list.push({ from, value });
                parts.set(key, list);
            }
        }
    };
    const character = game.character.get(build.character);
    if (character) {
        note(character.name, character.bonus);
    }
    if (build.shop) {
        note("Shop (all bought)", shopStats(game));
    }
    for (const slot of build.passives) {
        const passive = game.passive.get(slot.id);
        if (passive) {
            const value = passiveGain(game, build, passive) * slot.level;
            for (const stat of [passive.stat, ...passive.alsoAdds]) {
                note(`${passive.name} ${slot.level}`, { [stat]: value });
            }
        }
    }
    for (const id of Object.values(build.gear)) {
        const gear = game.gear.get(id);
        if (gear) {
            note(gear.name, gear.stats);
        }
    }
    for (const { set, worn } of setsWorn(game, build)) {
        if (worn >= set.needed) {
            note(`${set.name} set`, set.stats);
        }
    }
    return parts;
}

export function sumStats(parts: Map<string, StatSource[]>): StatMap {
    const stats: StatMap = {};
    for (const [key, list] of parts) {
        add(stats, { [key]: list.reduce((sum, part) => sum + part.value, 0) });
    }
    return stats;
}

// "+10%", "-1" (content/stats.ts formatStatValue)
export function formatValue(unit: "percent" | "flat", value: number): string {
    const sign = value < 0 ? "-" : "+";
    const abs = Math.abs(value);
    return unit === "percent"
        ? `${sign}${Math.round(abs * 100)}%`
        : `${sign}${Math.round(abs * 10) / 10}`;
}

// ---- Links ----

// A build in a link: compact JSON, base64url. Version 1.
export function encodeBuild(build: Build): string {
    const packed = [
        1,
        build.game,
        build.character,
        build.weapons.map((w) => `${w.id}.${w.level}`).join(","),
        build.passives.map((p) => `${p.id}.${p.level}`).join(","),
        Object.entries(build.gear)
            .map(([slot, id]) => `${slot}.${id}`)
            .join(","),
        `${build.shop ? 1 : 0}${build.quality}`,
        build.title,
        build.notes,
    ];
    const bytes = new TextEncoder().encode(JSON.stringify(packed));
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// A build from a link, with anything the game doesn't have (or doesn't allow)
// left out, or undefined for a link that isn't one
export function decodeBuild(game: Game, code: string): Build | undefined {
    let packed: unknown;
    try {
        const binary = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
        const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
        packed = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        return undefined;
    }
    if (!Array.isArray(packed) || packed[0] !== 1) {
        return undefined;
    }
    const [, gameVersion, characterId, weapons, passives, gear, flags, title, notes] = packed.map(
        (part) => (typeof part === "string" ? part : String(part ?? "")),
    );
    if (!game.character.has(characterId)) {
        return undefined;
    }
    const build = newBuild(game, characterId);
    build.game = gameVersion.slice(0, 20) || game.content.gameVersion;
    build.shop = flags.startsWith("1");
    const quality = flags.slice(1) as Rarity;
    build.quality = quality in game.content.rarities ? quality : "common";
    build.title = title.slice(0, TITLE_MAX);
    build.notes = notes.slice(0, NOTES_MAX);

    const slotted = (list: string) =>
        list
            .split(",")
            .filter(Boolean)
            .map((part) => {
                const dot = part.lastIndexOf(".");
                return { id: part.slice(0, dot), level: parseInt(part.slice(dot + 1)) || 1 };
            });

    build.weapons = [];
    for (const { id, level } of slotted(weapons)) {
        const weapon = game.weapon.get(id);
        if (
            weapon &&
            build.weapons.length < maxWeapons(game, build) &&
            !weaponBlocked(game, build, weapon)
        ) {
            build.weapons.push({ id, level: Math.min(Math.max(level, 1), weapon.levels.length) });
        }
    }
    for (const { id, level } of slotted(passives)) {
        const passive = game.passive.get(id);
        if (
            passive &&
            build.passives.length < maxPassives(game, build) &&
            !passiveBlocked(build, passive)
        ) {
            build.passives.push({ id, level: Math.min(Math.max(level, 1), passive.maxLevel) });
        }
    }
    for (const part of gear.split(",").filter(Boolean)) {
        const dot = part.indexOf(".");
        const slot = part.slice(0, dot);
        const item = game.gear.get(part.slice(dot + 1));
        if (item && item.slot === slot) {
            build.gear[slot] = item.id;
        }
    }
    return build;
}
