import { forwardRef } from "react";

import {
    Build,
    buildTotals,
    formatValue,
    setsWorn,
    sumStats,
    weaponLevel,
    weaponNext,
} from "./build";
import { Game } from "./content";
import { Icon } from "./Icon";

// The whole build on one card: what "Save image" turns into a picture
export const BuildCard = forwardRef<HTMLDivElement, { game: Game; build: Build }>(
    function BuildCard({ game, build }, ref) {
        const character = game.character.get(build.character);
        const starting = character && game.weapon.get(character.startingWeapon);
        const parts = buildTotals(game, build);
        const totals = sumStats(parts);
        const sets = setsWorn(game, build);
        const stats = Object.entries(game.content.stats).filter(([key]) => totals[key]);
        const outdated = build.game !== game.content.gameVersion;
        const evolutions = build.weapons.flatMap((slot) =>
            weaponNext(game, build, slot).filter((n) => n.kind === "evolve"),
        );

        return (
            <div className="panel card" ref={ref}>
                <div className="card-head">
                    {starting && <Icon objId={starting.iconObjId} scale={2} />}
                    <div>
                        <h2 className="card-title">{build.title || "Untitled build"}</h2>
                        <div className="muted">
                            {character?.name} ({character?.style})
                            {character?.bonusLines.length
                                ? `, ${character.bonusLines.join(", ")}`
                                : ""}
                        </div>
                    </div>
                </div>

                <h3>Weapons</h3>
                <div className="card-row">
                    {build.weapons.map((slot) => {
                        const weapon = game.weapon.get(slot.id);
                        if (!weapon) return null;
                        const at = weaponLevel(weapon, slot.level);
                        return (
                            <div key={slot.id} className="card-item">
                                <Icon objId={at.objId} title={at.name} />
                                <span>{at.name}</span>
                                <span className="level">
                                    {slot.level}/{weapon.levels.length}
                                </span>
                            </div>
                        );
                    })}
                    {build.weapons.length === 0 && <span className="muted">None</span>}
                </div>

                <h3>Passives</h3>
                <div className="card-row">
                    {build.passives.map((slot) => {
                        const passive = game.passive.get(slot.id);
                        if (!passive) return null;
                        return (
                            <div key={slot.id} className="card-item">
                                <Icon objId={passive.iconObjId} title={passive.name} />
                                <span>{passive.name}</span>
                                <span className="level">
                                    {slot.level}/{passive.maxLevel}
                                </span>
                            </div>
                        );
                    })}
                    {build.passives.length === 0 && <span className="muted">None</span>}
                </div>

                <h3>Gear</h3>
                <div className="card-gear">
                    {game.content.gearSlots.map((slot) => {
                        const gear = game.gear.get(build.gear[slot.id] ?? "");
                        return (
                            <div
                                key={slot.id}
                                className={gear ? "gear-cell" : "gear-cell empty"}
                                title={gear ? gear.name : slot.name}
                            >
                                {gear ? (
                                    <Icon objId={gear.objId} title={gear.name} />
                                ) : (
                                    <span className="gear-slot-name">{slot.name}</span>
                                )}
                            </div>
                        );
                    })}
                </div>

                {sets.length > 0 && (
                    <div className="card-sets">
                        {sets.map(({ set, worn, total }) => (
                            <div key={set.id} className={worn >= set.needed ? "set on" : "set"}>
                                {set.name} {worn}/{total}:{" "}
                                {worn >= set.needed
                                    ? `set bonus on, ${set.bonus}`
                                    : `${set.needed} worn give ${set.bonus}`}
                            </div>
                        ))}
                    </div>
                )}

                <h3>Totals</h3>
                <table className="totals">
                    <tbody>
                        {stats.map(([key, info]) => (
                            <tr
                                key={key}
                                title={parts
                                    .get(key)
                                    ?.map((p) => `${p.from} ${formatValue(info.unit, p.value)}`)
                                    .join("\n")}
                            >
                                <td className="total-value">
                                    {formatValue(info.unit, totals[key])}
                                </td>
                                <td>
                                    {info.label}
                                    {key === "cooldown" &&
                                        totals[key] > game.content.cooldownCap && (
                                            <span className="warn">
                                                {" "}
                                                (only {Math.round(game.content.cooldownCap * 100)}%
                                                counts)
                                            </span>
                                        )}
                                    {key === "maxHp" && (
                                        <span className="muted">
                                            {" "}
                                            (
                                            {Math.round(
                                                game.content.playerBaseHp * (1 + totals[key]),
                                            )}{" "}
                                            hitpoints)
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {stats.length === 0 && (
                            <tr>
                                <td className="muted">Nothing yet</td>
                            </tr>
                        )}
                    </tbody>
                </table>

                {evolutions.length > 0 && (
                    <>
                        <h3>Evolutions</h3>
                        {evolutions.map((evolution) => (
                            <div
                                key={evolution.into.id}
                                className={evolution.ready ? "set on" : "set"}
                            >
                                {evolution.why}
                            </div>
                        ))}
                    </>
                )}

                {build.notes && <p className="card-notes">{build.notes}</p>}

                <div className="card-foot">
                    <span>
                        Run Escape {build.game}
                        {outdated && ` (site has ${game.content.gameVersion})`}
                    </span>
                    <span>
                        Passives at {game.content.rarities[build.quality].name.toLowerCase()} picks
                        {build.shop ? ", shop all bought" : ""}
                    </span>
                </div>
            </div>
        );
    },
);
