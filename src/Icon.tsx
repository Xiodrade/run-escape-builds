import { iconUrl } from "./content";

// An item icon from the game's cache, drawn at a whole multiple of its size so
// its pixels stay sharp
export function Icon({
    objId,
    scale = 1,
    title,
}: {
    objId: number;
    scale?: number;
    title?: string;
}) {
    return (
        <img
            className="icon"
            src={iconUrl(objId)}
            width={36 * scale}
            height={32 * scale}
            alt={title ?? ""}
            title={title}
            draggable={false}
        />
    );
}
