// A build: an adventurer, the weapons and passives they're aiming for, and the
// gear they'd wear. Everything here works the way Run Escape does (see the
// files named in each comment), so the totals are what the game would have.
import { Game, GearSet, LinkIds, Passive, Rarity, StatMap, Weapon } from "./content";

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
//
// A link holds the whole build, so it needs no server. Short links (format 2)
// are a few bytes: things by their number in public/data/link-ids.json, levels
// as bytes, then the title and notes as text. Format 1 links (base64 JSON with
// names spelled out) still open.

function toBase64Url(bytes: Uint8Array): string {
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(code: string): Uint8Array {
    const binary = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function encodeBuild(game: Game, build: Build): string {
    const ids = game.linkIds;
    const number = (kind: keyof LinkIds, id: string) => ids?.[kind].indexOf(id) ?? -1;
    const gear = Object.values(build.gear);
    const numbers = [
        number("versions", build.game),
        number("characters", build.character),
        number("rarities", build.quality),
        ...build.weapons.map((w) => number("weapons", w.id)),
        ...build.passives.map((p) => number("passives", p.id)),
        ...gear.map((g) => number("gear", g)),
    ];
    if (
        !ids ||
        numbers.some((n) => n < 0) ||
        number("rarities", build.quality) > 7 ||
        build.weapons.length > 15 ||
        build.passives.length > 15
    ) {
        return encodeV1(build);
    }

    const out: number[] = [2];
    const varint = (n: number) => {
        while (n >= 0x80) {
            out.push((n & 0x7f) | 0x80);
            n >>>= 7;
        }
        out.push(n);
    };
    varint(number("versions", build.game));
    varint(number("characters", build.character));
    out.push((build.shop ? 1 : 0) | (number("rarities", build.quality) << 1));
    out.push((build.weapons.length << 4) | build.passives.length);
    for (const w of build.weapons) {
        varint(number("weapons", w.id));
        out.push(Math.min(Math.max(w.level, 0), 255));
    }
    for (const p of build.passives) {
        varint(number("passives", p.id));
        out.push(Math.min(Math.max(p.level, 0), 255));
    }
    varint(gear.length);
    for (const g of gear) varint(number("gear", g));
    const title = new TextEncoder().encode(build.title);
    varint(title.length);
    out.push(...title, ...new TextEncoder().encode(build.notes));
    return toBase64Url(Uint8Array.from(out));
}

function encodeV1(build: Build): string {
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
    return toBase64Url(new TextEncoder().encode(JSON.stringify(packed)));
}

// What a link says, before it's checked against the game
type Unchecked = {
    game: string;
    character: string;
    weapons: Slotted[];
    passives: Slotted[];
    // Format 1 also names the slot each piece is worn in
    gear: { slot?: string; id: string }[];
    shop: boolean;
    quality: string;
    title: string;
    notes: string;
};

function readV2(game: Game, bytes: Uint8Array): Unchecked | undefined {
    const ids = game.linkIds;
    if (!ids) return undefined;
    let at = 1;
    const byte = () => {
        if (at >= bytes.length) throw new Error("too short");
        return bytes[at++];
    };
    const varint = () => {
        let n = 0;
        for (let shift = 0; shift < 28; shift += 7) {
            const b = byte();
            n |= (b & 0x7f) << shift;
            if (b < 0x80) return n;
        }
        throw new Error("too long");
    };
    const name = (kind: keyof LinkIds) => ids[kind][varint()] ?? "";
    try {
        const version = name("versions");
        const character = name("characters");
        const flags = byte();
        const counts = byte();
        const weapons: Slotted[] = [];
        for (let i = 0; i < counts >> 4; i++) {
            weapons.push({ id: name("weapons"), level: byte() });
        }
        const passives: Slotted[] = [];
        for (let i = 0; i < (counts & 15); i++) {
            passives.push({ id: name("passives"), level: byte() });
        }
        const gear: { id: string }[] = [];
        for (let i = varint(); i > 0; i--) {
            gear.push({ id: name("gear") });
        }
        const titleLength = varint();
        const text = new TextDecoder();
        return {
            game: version,
            character,
            weapons,
            passives,
            gear,
            shop: (flags & 1) === 1,
            quality: ids.rarities[(flags >> 1) & 7] ?? "",
            title: text.decode(bytes.subarray(at, at + titleLength)),
            notes: text.decode(bytes.subarray(at + titleLength)),
        };
    } catch {
        return undefined;
    }
}

function readV1(bytes: Uint8Array): Unchecked | undefined {
    let packed: unknown;
    try {
        packed = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        return undefined;
    }
    if (!Array.isArray(packed) || packed[0] !== 1) {
        return undefined;
    }
    const [, game, character, weapons, passives, gear, flags, title, notes] = packed.map((part) =>
        typeof part === "string" ? part : String(part ?? ""),
    );
    const slotted = (list: string) =>
        list
            .split(",")
            .filter(Boolean)
            .map((part) => {
                const dot = part.lastIndexOf(".");
                return { id: part.slice(0, dot), level: parseInt(part.slice(dot + 1)) || 1 };
            });
    return {
        game,
        character,
        weapons: slotted(weapons),
        passives: slotted(passives),
        gear: gear
            .split(",")
            .filter(Boolean)
            .map((part) => {
                const dot = part.indexOf(".");
                return { slot: part.slice(0, dot), id: part.slice(dot + 1) };
            }),
        shop: flags.startsWith("1"),
        quality: flags.slice(1),
        title,
        notes,
    };
}

// A build from a link, with anything the game doesn't have (or doesn't allow)
// left out, or undefined for a link that isn't one
export function decodeBuild(game: Game, code: string): Build | undefined {
    let bytes: Uint8Array;
    try {
        bytes = fromBase64Url(code);
    } catch {
        return undefined;
    }
    const read = bytes[0] === 2 ? readV2(game, bytes) : readV1(bytes);
    if (!read || !game.character.has(read.character)) {
        return undefined;
    }
    const build = newBuild(game, read.character);
    build.game = read.game.slice(0, 20) || game.content.gameVersion;
    build.shop = read.shop;
    build.quality = read.quality in game.content.rarities ? (read.quality as Rarity) : "common";
    build.title = read.title.slice(0, TITLE_MAX);
    build.notes = read.notes.slice(0, NOTES_MAX);

    build.weapons = [];
    for (const { id, level } of read.weapons) {
        const weapon = game.weapon.get(id);
        if (
            weapon &&
            build.weapons.length < maxWeapons(game, build) &&
            !weaponBlocked(game, build, weapon)
        ) {
            build.weapons.push({ id, level: Math.min(Math.max(level, 1), weapon.levels.length) });
        }
    }
    for (const { id, level } of read.passives) {
        const passive = game.passive.get(id);
        if (
            passive &&
            build.passives.length < maxPassives(game, build) &&
            !passiveBlocked(build, passive)
        ) {
            build.passives.push({ id, level: Math.min(Math.max(level, 1), passive.maxLevel) });
        }
    }
    for (const { slot, id } of read.gear) {
        const item = game.gear.get(id);
        if (item && (slot === undefined || item.slot === slot)) {
            build.gear[item.slot] = item.id;
        }
    }
    return build;
}
