import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "./Icon";

export type PickerOption = {
    id: string;
    name: string;
    objId: number;
    color?: string;
    // Short lines under the name
    lines: string[];
    // Searched as well as the name
    keywords?: string;
    // Why it can't be picked, if it can't
    blocked?: string;
    note?: string;
};

// A list to pick one thing from, with a search box. Esc or the backdrop closes it.
export function Picker({
    title,
    options,
    onPick,
    onClose,
}: {
    title: string;
    options: PickerOption[];
    onPick: (id: string) => void;
    onClose: () => void;
}) {
    const [query, setQuery] = useState("");
    const search = useRef<HTMLInputElement>(null);

    useEffect(() => {
        search.current?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onClose();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q
            ? options.filter((o) => `${o.name} ${o.keywords ?? ""}`.toLowerCase().includes(q))
            : options;
    }, [options, query]);

    return (
        <div className="backdrop" onMouseDown={onClose}>
            <div
                className="panel picker"
                role="dialog"
                aria-label={title}
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="picker-head">
                    <h2>{title}</h2>
                    <input
                        ref={search}
                        className="search"
                        placeholder="Search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    <button className="button" onClick={onClose}>
                        Close
                    </button>
                </div>
                <div className="picker-list">
                    {shown.length === 0 && <p className="muted">Nothing matches that.</p>}
                    {shown.map((option) => (
                        <button
                            key={option.id}
                            className="option"
                            disabled={option.blocked !== undefined}
                            title={option.blocked}
                            onClick={() => onPick(option.id)}
                        >
                            <Icon objId={option.objId} />
                            <span className="option-body">
                                <span className="option-name" style={{ color: option.color }}>
                                    {option.name}
                                </span>
                                {option.lines.map((line) => (
                                    <span key={line} className="option-line">
                                        {line}
                                    </span>
                                ))}
                                {option.note && <span className="option-note">{option.note}</span>}
                                {option.blocked && (
                                    <span className="option-note">{option.blocked}</span>
                                )}
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
