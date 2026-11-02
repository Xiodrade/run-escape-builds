import { toPng } from "html-to-image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
    Build,
    NOTES_MAX,
    TITLE_MAX,
    decodeBuild,
    encodeBuild,
    formatValue,
    maxPassives,
    maxWeapons,
    newBuild,
    passiveBlocked,
    passiveGain,
    weaponBlocked,
    weaponChoices,
    weaponLevel,
    weaponNext,
} from "./build";
import { BuildCard } from "./BuildCard";
import { Game, Rarity, Style, loadContent } from "./content";
import { Icon } from "./Icon";
import { Picker, PickerOption } from "./Picker";

const STYLES: Style[] = ["melee", "ranged", "magic"];
const GAME_URL = "https://github.com/Dynrothe/Run-Escape";

type Picking =
    { kind: "weapon"; replace?: string } | { kind: "passive" } | { kind: "gear"; slot: string };

function buildFromHash(game: Game): Build | undefined {
    const code = new URLSearchParams(window.location.hash.slice(1)).get("b");
    return code ? decodeBuild(game, code) : undefined;
}

export function App() {
    const [game, setGame] = useState<Game>();
    const [error, setError] = useState<string>();

    useEffect(() => {
        loadContent().then(setGame, (e: Error) => setError(e.message));
    }, []);

    if (error) {
        return <p className="page muted">{error}</p>;
    }
    if (!game) {
        return <p className="page muted">Loading the game's content...</p>;
    }
    return <Builder game={game} />;
}

function Builder({ game }: { game: Game }) {
    const [build, setBuild] = useState<Build>(
        () => buildFromHash(game) ?? newBuild(game, game.content.characters[0].id),
    );
    const [picking, setPicking] = useState<Picking>();
    const [styleFilter, setStyleFilter] = useState<Style | "all">("all");
    const [status, setStatus] = useState("");
    const card = useRef<HTMLDivElement>(null);

    // The build is always in the address, so the page's link is the build
    useEffect(() => {
        window.history.replaceState(null, "", `#b=${encodeBuild(build)}`);
    }, [build]);

    useEffect(() => {
        const onHash = () => {
            const fromLink = buildFromHash(game);
            if (fromLink) setBuild(fromLink);
        };
        window.addEventListener("hashchange", onHash);
        return () => window.removeEventListener("hashchange", onHash);
    }, [game]);

    const say = (text: string) => {
        setStatus(text);
        window.setTimeout(() => setStatus((s) => (s === text ? "" : s)), 2500);
    };

    const update = useCallback((change: (b: Build) => Build) => setBuild((b) => change(b)), []);
    const character = game.character.get(build.character)!;
    const weaponSlots = maxWeapons(game, build);
    const passiveSlots = maxPassives(game, build);

    const chooseCharacter = (id: string) => {
        if (id === build.character) return;
        const fresh = newBuild(game, id);
        // Keep what still fits: passives and gear are anyone's, weapons only
        // when this adventurer can find them
        update((b) => {
            const next = {
                ...fresh,
                passives: b.passives,
                gear: b.gear,
                shop: b.shop,
                quality: b.quality,
                title: b.title,
                notes: b.notes,
            };
            const allowed = new Set(weaponChoices(game, next).map((w) => w.id));
            for (const slot of b.weapons) {
                const weapon = game.weapon.get(slot.id);
                if (
                    weapon &&
                    next.weapons.length < maxWeapons(game, next) &&
                    (allowed.has(slot.id) || weapon.evolved || weapon.pickOnly) &&
                    (!weapon.classStyle || weapon.classStyle === game.character.get(id)?.style) &&
                    !weaponBlocked(game, next, weapon)
                ) {
                    next.weapons.push(slot);
                }
            }
            return next;
        });
    };

    const pickerOptions = useMemo((): { title: string; options: PickerOption[] } | undefined => {
        if (!picking) return undefined;
        const rarities = game.content.rarities;
        if (picking.kind === "weapon") {
            return {
                title: "Pick a weapon",
                options: weaponChoices(game, build).map((w) => ({
                    id: w.id,
                    name: w.name,
                    objId: w.iconObjId,
                    color: rarities[w.rarity].color,
                    lines: [w.description],
                    keywords: `${w.kind} ${w.damageStyle} ${w.classStyle ?? ""}`,
                    note: [
                        w.classStyle && `${w.classStyle} only`,
                        w.unlock && `Unlock: ${w.unlock}`,
                    ]
                        .filter(Boolean)
                        .join(". "),
                    blocked: w.id === picking.replace ? undefined : weaponBlocked(game, build, w),
                })),
            };
        }
        if (picking.kind === "passive") {
            return {
                title: "Pick a passive",
                options: game.content.passives.map((p) => ({
                    id: p.id,
                    name: p.name,
                    objId: p.iconObjId,
                    color: rarities[p.rarity].color,
                    lines: [
                        `${formatValue(p.unit, passiveGain(game, build, p))} ${p.effect} a pick, up to ${p.maxLevel}`,
                    ],
                    keywords: p.effect,
                    note: p.unlock && `Unlock: ${p.unlock}`,
                    blocked: passiveBlocked(build, p),
                })),
            };
        }
        const slotName =
            game.content.gearSlots.find((s) => s.id === picking.slot)?.name ?? picking.slot;
        return {
            title: `Pick ${slotName.toLowerCase()} gear`,
            options: game.content.gear
                .filter((g) => g.slot === picking.slot)
                .map((g) => ({
                    id: g.id,
                    name: g.name,
                    objId: g.objId,
                    color: rarities[g.rarity].color,
                    lines: g.lines,
                    keywords: g.set ?? "",
                    note: [
                        g.set && `${game.set.get(g.set)?.name} set`,
                        g.variantOf && `Armoury upgrade of ${game.gear.get(g.variantOf)?.name}`,
                        g.unlock && `Unlock: ${g.unlock}`,
                    ]
                        .filter(Boolean)
                        .join(". "),
                })),
        };
    }, [picking, build, game]);

    const onPick = (id: string) => {
        if (!picking) return;
        if (picking.kind === "weapon") {
            update((b) => ({
                ...b,
                weapons: picking.replace
                    ? b.weapons.map((w) => (w.id === picking.replace ? { id, level: 1 } : w))
                    : [...b.weapons, { id, level: 1 }],
            }));
        } else if (picking.kind === "passive") {
            update((b) => ({ ...b, passives: [...b.passives, { id, level: 1 }] }));
        } else {
            update((b) => ({ ...b, gear: { ...b.gear, [picking.slot]: id } }));
        }
        setPicking(undefined);
    };

    const saveImage = async () => {
        if (!card.current) return;
        try {
            const url = await toPng(card.current, { pixelRatio: 2, cacheBust: false });
            const a = document.createElement("a");
            a.href = url;
            a.download = `${(build.title || character.name).replace(/[^\w -]+/g, "").trim() || "build"}.png`;
            a.click();
            say("Image saved");
        } catch {
            say("Couldn't make the image");
        }
    };

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            say("Link copied");
        } catch {
            say("Copy the address bar to share");
        }
    };

    const characters = game.content.characters.filter(
        (c) => styleFilter === "all" || c.style === styleFilter,
    );

    return (
        <div className="page">
            <header className="top">
                <h1>Run Escape Builds</h1>
                <span className="muted">
                    Plan a build for <a href={GAME_URL}>Run Escape</a> {game.content.gameVersion}. A
                    fan site, not part of the game.
                </span>
            </header>

            <main className="layout">
                <div className="builder">
                    <section className="panel">
                        <div className="section-head">
                            <h2>Adventurer</h2>
                            <div className="chips">
                                {(["all", ...STYLES] as const).map((s) => (
                                    <button
                                        key={s}
                                        className={styleFilter === s ? "chip on" : "chip"}
                                        onClick={() => setStyleFilter(s)}
                                    >
                                        {s === "all" ? "All" : s[0].toUpperCase() + s.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="tiles">
                            {characters.map((c) => {
                                const weapon = game.weapon.get(c.startingWeapon);
                                return (
                                    <button
                                        key={c.id}
                                        className={c.id === build.character ? "tile on" : "tile"}
                                        onClick={() => chooseCharacter(c.id)}
                                        title={[c.description, c.unlock && `Unlock: ${c.unlock}`]
                                            .filter(Boolean)
                                            .join("\n")}
                                    >
                                        {weapon && <Icon objId={weapon.iconObjId} />}
                                        <span className="tile-name">{c.name}</span>
                                        <span className="tile-sub">{c.style}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <p className="about">{character.description}</p>
                    </section>

                    <section className="panel">
                        <div className="section-head">
                            <h2>Weapons</h2>
                            <span className="muted">
                                {build.weapons.length}/{weaponSlots}
                            </span>
                        </div>
                        {build.weapons.map((slot) => {
                            const weapon = game.weapon.get(slot.id);
                            if (!weapon) return null;
                            const at = weaponLevel(weapon, slot.level);
                            const next = weaponNext(game, build, slot);
                            return (
                                <div key={slot.id} className="slot">
                                    <Icon objId={at.objId} scale={2} />
                                    <div className="slot-body">
                                        <div
                                            className="slot-name"
                                            style={{
                                                color: game.content.rarities[weapon.rarity].color,
                                            }}
                                        >
                                            {at.name}
                                        </div>
                                        <div className="slot-lines">{at.lines.join(", ")}</div>
                                        {next.map((n) => (
                                            <div key={n.into.id} className="slot-next">
                                                {n.kind === "hilt"
                                                    ? `${n.why}: ${n.into.name}`
                                                    : n.why}
                                                {n.ready && (
                                                    <button
                                                        className="link-button"
                                                        onClick={() =>
                                                            update((b) => ({
                                                                ...b,
                                                                weapons: b.weapons.map((w) =>
                                                                    w.id === slot.id
                                                                        ? {
                                                                              id: n.into.id,
                                                                              level:
                                                                                  n.kind === "hilt"
                                                                                      ? Math.min(
                                                                                            w.level,
                                                                                            n.into
                                                                                                .levels
                                                                                                .length,
                                                                                        )
                                                                                      : 1,
                                                                          }
                                                                        : w,
                                                                ),
                                                            }))
                                                        }
                                                    >
                                                        {n.kind === "evolve" ? "Evolve" : "Take it"}
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    <Stepper
                                        value={slot.level}
                                        max={weapon.levels.length}
                                        onChange={(level) =>
                                            update((b) => ({
                                                ...b,
                                                weapons: b.weapons.map((w) =>
                                                    w.id === slot.id ? { ...w, level } : w,
                                                ),
                                            }))
                                        }
                                    />
                                    <div className="slot-actions">
                                        <button
                                            className="button"
                                            onClick={() =>
                                                setPicking({ kind: "weapon", replace: slot.id })
                                            }
                                        >
                                            Swap
                                        </button>
                                        <button
                                            className="button"
                                            onClick={() =>
                                                update((b) => ({
                                                    ...b,
                                                    weapons: b.weapons.filter(
                                                        (w) => w.id !== slot.id,
                                                    ),
                                                }))
                                            }
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                        {build.weapons.length < weaponSlots && (
                            <button className="add" onClick={() => setPicking({ kind: "weapon" })}>
                                Add a weapon
                            </button>
                        )}
                    </section>

                    <section className="panel">
                        <div className="section-head">
                            <h2>Passives</h2>
                            <span className="muted">
                                {build.passives.length}/{passiveSlots}
                            </span>
                        </div>
                        {build.passives.map((slot) => {
                            const passive = game.passive.get(slot.id);
                            if (!passive) return null;
                            const total = passiveGain(game, build, passive) * slot.level;
                            return (
                                <div key={slot.id} className="slot">
                                    <Icon objId={passive.iconObjId} scale={2} />
                                    <div className="slot-body">
                                        <div
                                            className="slot-name"
                                            style={{
                                                color: game.content.rarities[passive.rarity].color,
                                            }}
                                        >
                                            {passive.name}
                                        </div>
                                        <div className="slot-lines">
                                            {formatValue(passive.unit, total)} {passive.effect}
                                        </div>
                                    </div>
                                    <Stepper
                                        value={slot.level}
                                        max={passive.maxLevel}
                                        onChange={(level) =>
                                            update((b) => ({
                                                ...b,
                                                passives: b.passives.map((p) =>
                                                    p.id === slot.id ? { ...p, level } : p,
                                                ),
                                            }))
                                        }
                                    />
                                    <div className="slot-actions">
                                        <button
                                            className="button"
                                            onClick={() =>
                                                update((b) => ({
                                                    ...b,
                                                    passives: b.passives.filter(
                                                        (p) => p.id !== slot.id,
                                                    ),
                                                }))
                                            }
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                        {build.passives.length < passiveSlots && (
                            <button className="add" onClick={() => setPicking({ kind: "passive" })}>
                                Add a passive
                            </button>
                        )}
                    </section>

                    <section className="panel">
                        <div className="section-head">
                            <h2>Gear</h2>
                            <span className="muted">From caskets, and the Armoury's upgrades</span>
                        </div>
                        <div className="gear-slots">
                            {game.content.gearSlots.map((slot) => {
                                const gear = game.gear.get(build.gear[slot.id] ?? "");
                                return (
                                    <div key={slot.id} className="gear-slot">
                                        <button
                                            className="gear-pick"
                                            onClick={() =>
                                                setPicking({ kind: "gear", slot: slot.id })
                                            }
                                        >
                                            {gear ? (
                                                <Icon
                                                    objId={gear.objId}
                                                    scale={2}
                                                    title={gear.name}
                                                />
                                            ) : (
                                                <span className="gear-empty" />
                                            )}
                                            <span className="gear-label">
                                                <span className="muted">{slot.name}</span>
                                                <span
                                                    style={{
                                                        color: gear
                                                            ? game.content.rarities[gear.rarity]
                                                                  .color
                                                            : undefined,
                                                    }}
                                                >
                                                    {gear?.name ?? "Empty"}
                                                </span>
                                            </span>
                                        </button>
                                        {gear && (
                                            <button
                                                className="link-button"
                                                onClick={() =>
                                                    update((b) => {
                                                        const rest = { ...b.gear };
                                                        delete rest[slot.id];
                                                        return { ...b, gear: rest };
                                                    })
                                                }
                                            >
                                                Clear
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    <section className="panel">
                        <h2>Details</h2>
                        <label className="field">
                            <span>Title</span>
                            <input
                                maxLength={TITLE_MAX}
                                value={build.title}
                                placeholder={`${character.name} build`}
                                onChange={(e) => update((b) => ({ ...b, title: e.target.value }))}
                            />
                        </label>
                        <label className="field">
                            <span>Notes</span>
                            <textarea
                                maxLength={NOTES_MAX}
                                rows={3}
                                value={build.notes}
                                placeholder="What to pick first, which map it's for"
                                onChange={(e) => update((b) => ({ ...b, notes: e.target.value }))}
                            />
                        </label>
                        <label className="check">
                            <input
                                type="checkbox"
                                checked={build.shop}
                                onChange={(e) => update((b) => ({ ...b, shop: e.target.checked }))}
                            />
                            Count every shop upgrade as bought (more slots, and their bonuses)
                        </label>
                        <label className="field inline">
                            <span>Passive picks roll</span>
                            <select
                                value={build.quality}
                                onChange={(e) =>
                                    update((b) => ({ ...b, quality: e.target.value as Rarity }))
                                }
                            >
                                {(Object.keys(game.content.rarities) as Rarity[]).map((r) => (
                                    <option key={r} value={r}>
                                        {game.content.rarities[r].name}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </section>
                </div>

                <aside className="preview">
                    <div className="toolbar">
                        <button className="button go" onClick={saveImage}>
                            Save image
                        </button>
                        <button className="button" onClick={copyLink}>
                            Copy link
                        </button>
                        <button
                            className="button"
                            onClick={() => setBuild(newBuild(game, build.character))}
                        >
                            Start over
                        </button>
                        <span className="status" role="status">
                            {status}
                        </span>
                    </div>
                    <BuildCard ref={card} game={game} build={build} />
                </aside>
            </main>

            <footer className="foot muted">
                Content from Run Escape {game.content.gameVersion}. Icons drawn from the Old School
                RuneScape cache, which belongs to Jagex. Not affiliated with Jagex or Run Escape.
                Made by Okaeri.
            </footer>

            {pickerOptions && (
                <Picker
                    title={pickerOptions.title}
                    options={pickerOptions.options}
                    onPick={onPick}
                    onClose={() => setPicking(undefined)}
                />
            )}
        </div>
    );
}

function Stepper({
    value,
    max,
    onChange,
}: {
    value: number;
    max: number;
    onChange: (v: number) => void;
}) {
    return (
        <div className="stepper" aria-label="Level">
            <button
                className="button"
                disabled={value <= 1}
                onClick={() => onChange(value - 1)}
                aria-label="Lower"
            >
                -
            </button>
            <span>
                {value}/{max}
            </span>
            <button
                className="button"
                disabled={value >= max}
                onClick={() => onChange(value + 1)}
                aria-label="Higher"
            >
                +
            </button>
        </div>
    );
}
