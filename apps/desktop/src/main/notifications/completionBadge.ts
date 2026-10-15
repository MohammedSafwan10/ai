const digits: Record<string, string[]> = {
  "0": ["111", "101", "101", "101", "111"], "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"], "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"], "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"], "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"], "9": ["111", "101", "111", "001", "111"],
  "+": ["000", "010", "111", "010", "000"],
};

/** Native Windows overlay bitmap, BGRA pixels; no hidden renderer or remote assets. */
export const completionBadgeBitmap = (count: number) => {
  const label = count > 9 ? "9+" : String(Math.max(0, Math.floor(count)));
  const size = 32; const pixels = Buffer.alloc(size * size * 4);
  const paint = (x: number, y: number, color: [number, number, number, number]) => { const at = (y * size + x) * 4; pixels.set(color, at); };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const distance = Math.hypot(x - 15.5, y - 15.5);
    if (distance < 15.5) paint(x, y, distance > 13.7 ? [236, 236, 236, 255] : [65, 65, 65, 255]);
  }
  const scale = label.length === 1 ? 4 : 3;
  const width = (label.length * 4 - 1) * scale;
  const left = Math.floor((size - width) / 2); const top = Math.floor((size - 5 * scale) / 2);
  [...label].forEach((character, index) => digits[character].forEach((row, y) => [...row].forEach((cell, x) => {
    if (cell !== "1") return;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) paint(left + (index * 4 + x) * scale + dx, top + y * scale + dy, [255, 255, 255, 255]);
  })));
  return { pixels, size, label };
};
