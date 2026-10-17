// Format/size exports only. The approved source artwork is not redrawn here.
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { execFileSync } = require("node:child_process");
const source = path.resolve(
  process.argv[2] ||
    path.join(__dirname, "../../marketing/public/privora-logo.png"),
);
const assets = path.resolve(__dirname, "../assets");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "privora-icons-"));
function png(size) {
  const file = path.join(scratch, `${size}.png`);
  execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-y",
      "-i",
      source,
      "-vf",
      `scale=${size}:${size}:flags=lanczos`,
      "-frames:v",
      "1",
      file,
    ],
    { stdio: "inherit" },
  );
  return fs.readFileSync(file);
}
const sizes = [16, 24, 32, 48, 64, 128, 256],
  images = sizes.map(png);
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
images.forEach((image, i) => {
  const p = 6 + 16 * i;
  header[p] = sizes[i] === 256 ? 0 : sizes[i];
  header[p + 1] = header[p];
  header.writeUInt16LE(1, p + 4);
  header.writeUInt16LE(32, p + 6);
  header.writeUInt32LE(image.length, p + 8);
  header.writeUInt32LE(offset, p + 12);
  offset += image.length;
});
fs.writeFileSync(
  path.join(assets, "icon.ico"),
  Buffer.concat([header, ...images]),
);
const chunks = [
  [16, "icp4"],
  [32, "icp5"],
  [64, "icp6"],
  [128, "ic07"],
  [256, "ic08"],
  [512, "ic09"],
  [1024, "ic10"],
].map(([size, type]) => {
  const bytes = png(size),
    head = Buffer.alloc(8);
  head.write(type);
  head.writeUInt32BE(bytes.length + 8, 4);
  return Buffer.concat([head, bytes]);
});
const icns = Buffer.alloc(8);
icns.write("icns");
icns.writeUInt32BE(8 + chunks.reduce((n, b) => n + b.length, 0), 4);
fs.writeFileSync(
  path.join(assets, "icon.icns"),
  Buffer.concat([icns, ...chunks]),
);
fs.writeFileSync(path.join(assets, "icon.png"), png(1024));
console.log(
  "Exported approved Portal artwork to PNG, multi-size ICO and ICNS.",
);
