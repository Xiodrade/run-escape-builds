import { readFileSync } from "node:fs";

import {
    buildTotals,
    decodeBuild,
    encodeBuild,
    maxWeapons,
    newBuild,
    sumStats,
    weaponBlocked,
    weaponChoices,
    weaponNext,
} from "./build";
import { Content, Game } from "./content";

const game = new Game(JSON.parse(readFileSync("public/data/content.json", "utf8")) as Content);
const melee = game.content.characters.find((c) => c.style === "melee")!;
const magic = game.content.characters.find((c) => c.style === "magic")!;

describe("links", () => {
    it("bring a build back exactly", () => {
        const build = newBuild(game, melee.id);
        build.passives = game.content.passives.slice(0, 2).map((p) => ({ id: p.id, level: 2 }));
        const gear = game.content.gear.find((g) => g.slot === "head")!;
        build.gear = { head: gear.id };
        build.shop = true;
        build.quality = "rare";
        build.title = "Spin to win: ünïcode";
        build.notes = "Line one\nLine two";
        expect(decodeBuild(game, encodeBuild(build))).toEqual(build);
    });

    it("leave out what the game doesn't have or allow", () => {
        const build = newBuild(game, melee.id);
        build.weapons.push({ id: "not_a_weapon", level: 3 }, { id: build.weapons[0].id, level: 2 });
        build.passives = [{ id: game.content.passives[0].id, level: 999 }];
        build.gear = {
            head: "not_gear",
            cape: game.content.gear.find((g) => g.slot === "head")!.id,
        };
        const back = decodeBuild(game, encodeBuild(build))!;
        expect(back.weapons).toEqual([{ id: melee.startingWeapon, level: 1 }]);
        expect(back.passives[0].level).toBe(game.content.passives[0].maxLevel);
        expect(back.gear).toEqual({});
    });

    it("turn down a link that isn't a build", () => {
        expect(decodeBuild(game, "")).toBeUndefined();
        expect(decodeBuild(game, "!!!")).toBeUndefined();
        expect(decodeBuild(game, btoa(JSON.stringify([2, "x"])))).toBeUndefined();
    });
});

describe("weapons", () => {
    it("are an adventurer's class's and everyone's, never another class's", () => {
        const ids = weaponChoices(game, newBuild(game, melee.id)).map((w) =>
            game.weapon.get(w.id)!,
        );
        expect(ids.some((w) => w.classStyle === "magic")).toBe(false);
        expect(ids.some((w) => w.evolved)).toBe(false);
        expect(
            weaponChoices(game, newBuild(game, magic.id)).some((w) => w.classStyle === "melee"),
        ).toBe(false);
    });

    it("take more slots with the shop bought", () => {
        const build = newBuild(game, melee.id);
        const without = maxWeapons(game, build);
        build.shop = true;
        expect(maxWeapons(game, build)).toBeGreaterThanOrEqual(without);
    });

    it("can't be the same one twice", () => {
        const build = newBuild(game, melee.id);
        expect(weaponBlocked(game, build, game.weapon.get(melee.startingWeapon)!)).toBeDefined();
    });

    it("evolve once maxed with their passive", () => {
        const weapon = game.content.weapons.find((w) => w.evolution && !w.classStyle)!;
        const character = game.content.characters[0];
        const build = newBuild(game, character.id);
        build.weapons = [{ id: weapon.id, level: 1 }];
        expect(
            weaponNext(game, build, build.weapons[0]).find((n) => n.kind === "evolve")?.ready,
        ).toBe(false);
        build.weapons = [{ id: weapon.id, level: weapon.levels.length }];
        build.passives = [{ id: weapon.evolution!.requiresPassive, level: 1 }];
        expect(
            weaponNext(game, build, build.weapons[0]).find((n) => n.kind === "evolve")?.ready,
        ).toBe(true);
    });
});

describe("totals", () => {
    it("add a set's bonus only once enough pieces are worn", () => {
        const set = game.content.sets.find((s) => Object.keys(s.stats).length > 0)!;
        const pieces = game.content.gear.filter((g) => g.set === set.id && !g.variantOf);
        const build = newBuild(game, melee.id);
        for (const piece of pieces.slice(0, set.needed - 1)) build.gear[piece.slot] = piece.id;
        const before = buildTotals(game, build);
        expect([...before.values()].flat().some((p) => p.from === `${set.name} set`)).toBe(false);
        const last = pieces[set.needed - 1];
        build.gear[last.slot] = last.id;
        const after = buildTotals(game, build);
        expect([...after.values()].flat().some((p) => p.from === `${set.name} set`)).toBe(true);
    });

    it("count the adventurer's own bonus", () => {
        const character = game.content.characters.find((c) => Object.keys(c.bonus).length > 0)!;
        const totals = sumStats(buildTotals(game, newBuild(game, character.id)));
        for (const [key, value] of Object.entries(character.bonus)) {
            expect(totals[key]).toBeCloseTo(value);
        }
    });
});
