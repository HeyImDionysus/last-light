// Pixel-art sprite definitions and rendering. Sprites are small 2D grids of
// palette indices, drawn once into offscreen canvases and blitted with nearest-
// neighbour sampling for crisp pixels. Animation frames are pre-rendered the
// same way. The shared palette deliberately avoids the dark-blue-with-gold
// procedural-Canvas default — this is a warm storybook/cozy-dark scheme.

export type Sprite = {
  width: number;
  height: number;
  pixels: readonly (readonly number[])[];
};

export const PALETTE: readonly string[] = [
  'rgba(0,0,0,0)',     // 0: transparent
  '#0e0805',           // 1: void (deepest)
  '#1a0e08',           // 2: forest deepest (warm brown)
  '#1f3a1f',           // 3: forest canopy dark (deep green)
  '#3e6a36',           // 4: forest canopy mid (mid green)
  '#7ab050',           // 5: forest canopy light (sunlit leaves)
  '#3a2218',           // 6: trunk (warm brown)
  '#5a3828',           // 7: trunk light (highlight)
  '#e8d4a8',           // 8: parchment
  '#c8a878',           // 9: parchment dim
  '#ffb84d',           // A: lantern warm
  '#ffe080',           // B: lantern bright
  '#fff0c0',           // C: lantern core
  '#3a2540',           // D: cloak deepest (brighter for readability)
  '#6a4a78',           // E: cloak mid
  '#a888b8',           // F: cloak light
  '#6a1a2a',           // G: shadow crimson
  '#3a0a14',           // H: shadow deep
  '#a89878',           // I: stone (brighter)
  '#c8b898',           // J: stone light
  '#ffd76a',           // K: star gold
  '#fff8d0',           // L: star bright
  '#a02838',           // M: danger red
];

function parseSprite(rows: readonly string[]): Sprite {
  const height = rows.length;
  let width = 0;
  for (const r of rows) if (r.length > width) width = r.length;
  const pixels: number[][] = [];
  for (let y = 0; y < height; y += 1) {
    const row: number[] = [];
    const line = rows[y]!;
    for (let x = 0; x < width; x += 1) {
      const ch = x < line.length ? line.charCodeAt(x) : 32;
      const idx = ch === 32 /* space */
        ? 0
        : ch >= 65 /* 'A' */
          ? ch - 55
          : ch - 48;
      row.push(idx);
    }
    pixels.push(row);
  }
  return { width, height, pixels };
}

export const PLAYER_RIGHT_IDLE: Sprite = parseSprite([
  '  DDDDD  ',
  ' DFFFFD  ',
  'DFFFFFFDD',
  'DFFFFFFFD',
  ' DEEEEEEL',
  ' DEEEEELL',
  ' DEEBLLL ',
  ' DEEELL  ',
  ' DEEEEEE ',
  ' DEEEEEE ',
  '  DDEEDD ',
  '  DD  DD ',
]);

export const PLAYER_RIGHT_WALK_1: Sprite = parseSprite([
  '  DDDDD  ',
  ' DFFFFD  ',
  'DFFFFFFDD',
  'DFFFFFFFD',
  ' DEEEEELL',
  ' DEEEELL ',
  ' DEEBLL  ',
  ' DEEEEL  ',
  ' DEEEEEE ',
  ' DEEEEEE ',
  '  DDEEDD ',
  '  D   DD ',
]);

export const PLAYER_RIGHT_WALK_2: Sprite = parseSprite([
  '  DDDDD  ',
  ' DFFFFD  ',
  'DFFFFFFDD',
  'DFFFFFFFD',
  ' DEEEEELL',
  ' DEEEELL ',
  ' DEEBLLL ',
  ' DEEELL  ',
  ' DEEEEEE ',
  ' DEEEEEE ',
  '  DDEEDD ',
  '  DD   D ',
]);

export const PLAYER_DOWN_IDLE: Sprite = parseSprite([
  '  DDDDD  ',
  ' DFFFFD  ',
  'DFFFFFFDD',
  'DFFFFFFFD',
  ' DLEELL D',
  ' DLEELL D',
  ' DEEEEED ',
  ' DEEEEED ',
  ' DEEEEED ',
  ' DEEEEED ',
  '  DDEEDD ',
  '  DD  DD ',
]);

export const PLAYER_DOWN_WALK_1: Sprite = parseSprite([
  '  DDDDD  ',
  ' DFFFFD  ',
  'DFFFFFFDD',
  'DFFFFFFFD',
  ' DLEELL D',
  ' DLEELL D',
  ' DEEEEED ',
  ' DEEEEED ',
  ' DEEEEED ',
  ' DEEEEED ',
  '  DDEEDD ',
  '  D   DD ',
]);

export const PLAYER_DOWN_WALK_2: Sprite = parseSprite([
  '  DDDDD  ',
  ' DFFFFD  ',
  'DFFFFFFDD',
  'DFFFFFFFD',
  ' DLEELL D',
  ' DLEELL D',
  ' DEEEEED ',
  ' DEEEEED ',
  ' DEEEEED ',
  ' DEEEEED ',
  '  DDEEDD ',
  '  DD   D ',
]);

export const PLAYER_UP_IDLE: Sprite = parseSprite([
  '  DDDDD  ',
  ' DDDDDD  ',
  ' DDDDDDD ',
  ' DDDDDDD ',
  ' DDDDDDD ',
  ' DDDDDDD ',
  ' DEEEEED ',
  ' DEEEEED ',
  ' DEEEEED ',
  ' DEEEEED ',
  '  DDEEDD ',
  '  DD  DD ',
]);

export const PLAYER_UP_WALK_1: Sprite = parseSprite([
  '  DDDDD  ',
  ' DDDDDD  ',
  ' DDDDDDD ',
  ' DDDDDDD ',
  ' DDDDDDD ',
  ' DDDDDDD ',
  ' DEEEEED ',
  ' DEEEEED ',
  ' DEEEEED ',
  ' DEEEEED ',
  '  DDEEDD ',
  '  D   DD ',
]);

export const PLAYER_UP_WALK_2: Sprite = parseSprite([
  '  DDDDD  ',
  ' DDDDDD  ',
  ' DDDDDDD ',
  ' DDDDDDD ',
  ' DDDDDDD ',
  ' DDDDDDD ',
  ' DEEEEED ',
  ' DEEEEED ',
  ' DEEEEED ',
  ' DEEEEED ',
  '  DDEEDD ',
  '  DD   D ',
]);

export const TREE_SPRITES: Sprite[] = [
  parseSprite([
    '    333333    ',
    '   34444433   ',
    '  3445555443  ',
    ' 34555555543  ',
    ' 345555555443 ',
    '34555555555443',
    '34555555555443',
    '34555555555443',
    ' 345555555443 ',
    '  3455555543  ',
    '   34444433   ',
    '      67      ',
    '      67      ',
    '      76      ',
  ]),
  parseSprite([
    '   33333    ',
    '  34444433  ',
    ' 3455555443 ',
    '345555555443',
    '345555555554',
    '345555555554',
    '345555555554',
    ' 3455555543 ',
    '  344444433 ',
    '    6776    ',
    '     76     ',
    '     76     ',
  ]),
  parseSprite([
    '     3333     ',
    '   34444433   ',
    '  3455555443  ',
    ' 345555555543 ',
    ' 345555555543 ',
    '34555555555443',
    '34555555555443',
    ' 345555555543 ',
    '  3455555443  ',
    '   34444433   ',
    '     6767     ',
    '      76      ',
  ]),
];

export const STAR_SPRITE: Sprite = parseSprite([
  '  K  ',
  ' KKK ',
  'KLLLK',
  ' KKK ',
  '  K  ',
]);

export const STAR_BIG: Sprite = parseSprite([
  '   K   ',
  '   K   ',
  ' KKKKK ',
  'KLLLLLK',
  ' KKKKK ',
  '   K   ',
  '   K   ',
]);

export const SHADOW_SPRITE: Sprite = parseSprite([
  '  HHHHH  ',
  ' HGGGGGH ',
  'HGMMMGGGH',
  'HGGGGGGGH',
 ' HGGGGGH ',
  '  HHHHH  ',
]);

export const SHADOW_MENACE: Sprite = parseSprite([
  '  HHHHH  ',
  ' HGGGGGH ',
 'HGMGMGMGH',
  'HGGGGGGH',
  ' HGGGGGH ',
  '  HHHHH  ',
]);

export const LIGHTHOUSE_SPRITE: Sprite = parseSprite([
  '  IJ  ',
  ' IIJ  ',
  ' IIJI ',
  ' IIJI ',
  ' IIJI ',
  ' IIJI ',
  'IIJJII',
  'IIJJII',
  ' IIJI ',
  ' IIJI ',
  ' IIJI ',
  ' IIJI ',
  ' IIJI ',
  '  II  ',
  ' ABB  ',
  ' ACC  ',
]);

export type BlitSprite = {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  width: number;
  height: number;
};

const spriteCache = new Map<Sprite, BlitSprite>();

export function blitFor(sprite: Sprite): BlitSprite {
  const cached = spriteCache.get(sprite);
  if (cached) return cached;
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(sprite.width, sprite.height)
    : Object.assign(document.createElement('canvas'), { width: sprite.width, height: sprite.height });
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error('Sprite canvas context unavailable');
  const imageData = ctx.createImageData(sprite.width, sprite.height);
  const data = imageData.data;
  for (let y = 0; y < sprite.height; y += 1) {
    const row = sprite.pixels[y]!;
    for (let x = 0; x < sprite.width; x += 1) {
      const idx = row[x]!;
      const o = (y * sprite.width + x) * 4;
      if (idx === 0) continue;
      const color = PALETTE[idx]!;
      const m = parseRGBA(color);
      data[o] = m[0]; data[o + 1] = m[1]; data[o + 2] = m[2]; data[o + 3] = m[3];
    }
  }
  ctx.putImageData(imageData, 0, 0);
  const result: BlitSprite = { canvas, width: sprite.width, height: sprite.height };
  spriteCache.set(sprite, result);
  return result;
}

function parseRGBA(color: string): [number, number, number, number] {
  if (color.startsWith('rgba')) {
    const m = color.match(/[\d.]+/g);
    if (!m) return [0, 0, 0, 0];
    return [Number(m[0]), Number(m[1]), Number(m[2]), Math.round(Number(m[3]) * 255)];
  }
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return [r, g, b, 255];
}

export function spriteIndexForTree(id: number): Sprite {
  return TREE_SPRITES[id % TREE_SPRITES.length]!;
}
