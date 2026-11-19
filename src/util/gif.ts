// A small GIF89a encoder: fixed 6x7x6 colour cube with ordered dithering, LZW compression, looping.
// Enough for short clips of the planet without pulling in a library.

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function palette(): Uint8Array {
  const p = new Uint8Array(256 * 3);
  let i = 0;
  for (let r = 0; r < 6; r++) for (let g = 0; g < 7; g++) for (let b = 0; b < 6; b++) { p[i++] = Math.round((r / 5) * 255); p[i++] = Math.round((g / 6) * 255); p[i++] = Math.round((b / 5) * 255); }
  return p;
}

/** Map RGBA pixels to palette indices, with a little ordered dither to hide the banding. */
function quantize(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const t = (BAYER[(y & 3) * 4 + (x & 3)]! / 16 - 0.5);
      const r = Math.max(0, Math.min(5, Math.round((rgba[o]! / 255) * 5 + t)));
      const g = Math.max(0, Math.min(6, Math.round((rgba[o + 1]! / 255) * 6 + t)));
      const b = Math.max(0, Math.min(5, Math.round((rgba[o + 2]! / 255) * 5 + t)));
      out[y * w + x] = r * 42 + g * 6 + b;
    }
  }
  return out;
}

/** GIF-flavoured LZW with 8-bit symbols, written as data sub-blocks. */
function lzw(indices: Uint8Array, out: number[]): void {
  const MIN = 8, CLEAR = 256, END = 257;
  out.push(MIN);
  let block: number[] = [];
  let acc = 0, bits = 0;
  const flush = () => { if (block.length) { out.push(block.length, ...block); block = []; } };
  const emit = (code: number, size: number) => {
    acc |= code << bits; bits += size;
    while (bits >= 8) { block.push(acc & 255); acc >>>= 8; bits -= 8; if (block.length === 255) flush(); }
  };
  let dict = new Map<number, number>();
  let next = 258, size = 9;
  emit(CLEAR, size);
  let prefix = indices[0]!;
  for (let i = 1; i < indices.length; i++) {
    const c = indices[i]!;
    const key = (prefix << 8) | c;
    const found = dict.get(key);
    if (found !== undefined) { prefix = found; continue; }
    emit(prefix, size);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > (1 << size) && size < 12) size++;
    } else {
      emit(CLEAR, size);
      dict = new Map(); next = 258; size = 9;
    }
    prefix = c;
  }
  emit(prefix, size);
  emit(END, size);
  if (bits > 0) { block.push(acc & 255); }
  flush();
  out.push(0);
}

/** Encode frames (RGBA, all the same size) as a looping GIF. delay is in hundredths of a second. */
export function encodeGif(frames: (Uint8ClampedArray | Uint8Array)[], width: number, height: number, delay = 8): Uint8Array {
  const out: number[] = [];
  const word = (v: number) => out.push(v & 255, (v >> 8) & 255);
  for (const ch of 'GIF89a') out.push(ch.charCodeAt(0));
  word(width); word(height);
  out.push(0xf7, 0, 0);
  out.push(...palette());
  // loop forever
  out.push(0x21, 0xff, 11);
  for (const ch of 'NETSCAPE2.0') out.push(ch.charCodeAt(0));
  out.push(3, 1, 0, 0, 0);
  for (const f of frames) {
    out.push(0x21, 0xf9, 4, 0); word(delay); out.push(0, 0);
    out.push(0x2c); word(0); word(0); word(width); word(height); out.push(0);
    lzw(quantize(f, width, height), out);
  }
  out.push(0x3b);
  return Uint8Array.from(out);
}
