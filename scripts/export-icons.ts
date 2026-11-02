// Draws every icon the site shows (adventurers' starting weapons, weapons at
// each level, passives, gear) with Run Escape's own icon renderer, from the
// OSRS cache, into public/icons/<objId>.png. The cache stays on this machine;
// only the small PNGs are committed.
//
//   npm run icons                      # needs npm run export first, and the game
//                                      # at ../Run-Escape with its cache downloaded
//   GAME=C:/path/to/Run-Escape npm run icons
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const GAME = resolve(process.env.GAME ?? join(here, "../../Run-Escape"));
const OUT = join(here, "../public/icons");
const content = JSON.parse(readFileSync(join(here, "../public/data/content.json"), "utf8"));

const ids = new Set<number>();
for (const w of content.weapons) {
    ids.add(w.iconObjId);
    for (const level of w.levels) {
        if (level.objId !== undefined) {
            ids.add(level.objId);
        }
    }
}
for (const p of content.passives) {
    ids.add(p.iconObjId);
}
for (const g of content.gear) {
    ids.add(g.objId);
}

// The game finds its cache from its own folder
process.chdir(GAME);
const game = (file: string) => import(pathToFileURL(join(GAME, file)).href);
const { ICON_HEIGHT, ICON_WIDTH, renderItemIcon } = await game(
    "src/mapviewer/worker/ItemIconLoader.ts",
);
const { CacheSystem } = await game("src/rs/cache/CacheSystem.ts");
const { getCacheLoaderFactory } = await game("src/rs/cache/loader/CacheLoaderFactory.ts");
const { ObjModelLoader } = await game("src/rs/config/objtype/ObjModelLoader.ts");
const { loadGameCache } = await game("scripts/cache/scene-util.ts");

const loaded = loadGameCache();
const factory = getCacheLoaderFactory(
    loaded.info,
    CacheSystem.fromFiles(loaded.type, loaded.files),
);
const objTypeLoader = factory.getObjTypeLoader();
const textureLoader = factory.getTextureLoader();
const objModelLoader = new ObjModelLoader(objTypeLoader, factory.getModelLoader(), textureLoader);
const state = { objTypeLoader, objModelLoader, textureLoader };

mkdirSync(OUT, { recursive: true });
let drawn = 0;
let empty = 0;
for (const objId of [...ids].sort((a, b) => a - b)) {
    const file = join(OUT, `${objId}.png`);
    if (existsSync(file) && !process.env.FORCE) {
        continue;
    }
    const pixels: Int32Array | number[] = renderItemIcon(state, objId, 1);
    if (!pixels.some((p) => p >>> 24 !== 0)) {
        empty++;
        console.warn(`${objId}: nothing drawn`);
    }
    writeFileSync(file, png(pixels, ICON_WIDTH, ICON_HEIGHT));
    drawn++;
}
console.log(`${drawn} icons drawn (${ids.size} needed, ${empty} empty) -> ${OUT}`);

// A PNG from ARGB pixels: RGBA rows, each with filter byte 0
function png(pixels: ArrayLike<number>, width: number, height: number): Buffer {
    const raw = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) {
        const row = y * (width * 4 + 1);
        for (let x = 0; x < width; x++) {
            const p = pixels[x + y * width];
            const at = row + 1 + x * 4;
            raw[at] = (p >> 16) & 0xff;
            raw[at + 1] = (p >> 8) & 0xff;
            raw[at + 2] = p & 0xff;
            raw[at + 3] = p >>> 24;
        }
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8; // bit depth
    header[9] = 6; // RGBA
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", header),
        chunk("IDAT", deflateSync(raw)),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}

function chunk(type: string, data: Buffer): Buffer {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
}

function crc32(data: Buffer): number {
    let crc = ~0;
    for (const byte of data) {
        crc ^= byte;
        for (let k = 0; k < 8; k++) {
            crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
        }
    }
    return ~crc >>> 0;
}
