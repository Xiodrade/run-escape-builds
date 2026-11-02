// The game's content, as scripts/export-content.ts snapshots it from Run
// Escape into public/data/content.json

export type Style = "melee" | "ranged" | "magic";
export type Rarity = "common" | "uncommon" | "rare" | "veryRare";
export type GearSlot = string;
export type StatMap = Record<string, number>;

export type StatInfo = { label: string; unit: "percent" | "flat"; capped: boolean };

export type Character = {
    id: string;
    name: string;
    description: string;
    style: Style;
    startingWeapon: string;
    bonus: StatMap;
    bonusLines: string[];
    unlock?: string;
};

export type WeaponLevel = {
    name?: string;
    objId?: number;
    description: string;
    lines: string[];
};

export type Weapon = {
    id: string;
    name: string;
    kind: string;
    description: string;
    iconObjId: number;
    rarity: Rarity;
    classStyle?: Style;
    damageStyle: Style;
    family?: string;
    evolved: boolean;
    pickOnly: boolean;
    evolution?: { into: string; requiresPassive: string };
    hilts?: { level: number; into: string[] };
    unlock?: string;
    levels: WeaponLevel[];
};

export type Passive = {
    id: string;
    name: string;
    description: string;
    stat: string;
    alsoAdds: string[];
    perLevel: number;
    effect: string;
    unit: "percent" | "flat";
    whole: boolean;
    maxLevel: number;
    rarity: Rarity;
    iconObjId: number;
    unlock?: string;
};

export type Gear = {
    id: string;
    name: string;
    objId: number;
    rarity: Rarity;
    slot: GearSlot;
    stats: StatMap;
    lines: string[];
    set?: string;
    variantOf?: string;
    unlock?: string;
};

export type GearSet = {
    id: string;
    name: string;
    needed: number;
    bonus: string;
    stats: StatMap;
};

export type Evolution = { into: string; passive: string; weapons: string[]; name: string };

export type ShopUpgrade = {
    id: string;
    name: string;
    description: string;
    stat: string;
    perRank: number;
    maxRank: number;
};

export type Content = {
    gameVersion: string;
    exportedAt: string;
    maxWeapons: number;
    maxPassives: number;
    cooldownCap: number;
    playerBaseHp: number;
    stats: Record<string, StatInfo>;
    rarities: Record<Rarity, { name: string; color: string; power: number }>;
    gearSlots: { id: GearSlot; name: string }[];
    characters: Character[];
    weapons: Weapon[];
    passives: Passive[];
    gear: Gear[];
    sets: GearSet[];
    evolutions: Evolution[];
    shop: ShopUpgrade[];
};

// Lookups by id, made once
export class Game {
    readonly character = new Map<string, Character>();
    readonly weapon = new Map<string, Weapon>();
    readonly passive = new Map<string, Passive>();
    readonly gear = new Map<string, Gear>();
    readonly set = new Map<string, GearSet>();

    constructor(readonly content: Content) {
        for (const c of content.characters) this.character.set(c.id, c);
        for (const w of content.weapons) this.weapon.set(w.id, w);
        for (const p of content.passives) this.passive.set(p.id, p);
        for (const g of content.gear) this.gear.set(g.id, g);
        for (const s of content.sets) this.set.set(s.id, s);
    }
}

export async function loadContent(): Promise<Game> {
    const response = await fetch(`${import.meta.env.BASE_URL}data/content.json`);
    if (!response.ok) {
        throw new Error(`Couldn't load the game's content (${response.status})`);
    }
    return new Game((await response.json()) as Content);
}

export function iconUrl(objId: number): string {
    return `${import.meta.env.BASE_URL}icons/${objId}.png`;
}
