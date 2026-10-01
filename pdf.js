/* PDF helpers shared by invoices (T42), acceptance reports (T63) and site reports: WinAnsi text, line
   wrapping, a small document writer and PNG images (for drawn signatures and photos). No dependencies. */
const zlib = require("node:zlib");

// Characters outside Latin-1 that Windows-1252 (WinAnsiEncoding) still has, mapped to their byte.
const WIN_ANSI_EXTRA = {
  "€": 0x80,
  "‚": 0x82,
  "„": 0x84,
  "…": 0x85,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
  "–": 0x96,
  "—": 0x97,
  "™": 0x99,
};
// Text for a PDF string in WinAnsiEncoding: one byte per character (as a latin1 string), escaped.
// Characters Windows-1252 cannot show are dropped.
function pdfText(value) {
  let out = "";
  for (const ch of String(value ?? "").normalize("NFC")) {
    const code = ch.codePointAt(0);
    if (WIN_ANSI_EXTRA[ch]) out += String.fromCharCode(WIN_ANSI_EXTRA[ch]);
    else if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) out += ch;
    else if (/\s/.test(ch)) out += " ";
  }
  return out.replace(/[\\()]/g, "\\$&");
}
// Splits text into lines of at most `size`-point Helvetica fitting `width` points (approximate widths).
function wrapPdfText(value, width, size, maxLines = Infinity) {
  const maxChars = Math.max(8, Math.floor(width / (size * 0.52))),
    lines = [];
  let current = "";
  for (let word of String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")) {
    while (word.length > maxChars) {
      if (current) lines.push(current);
      current = "";
      lines.push(word.slice(0, maxChars));
      word = word.slice(maxChars);
    }
    if (!current) current = word;
    else if ((current + " " + word).length <= maxChars) current += " " + word;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, maxChars - 1) + "…";
  }
  return lines.length ? lines : [""];
}
// Decodes an 8-bit, non-interlaced PNG (grey, RGB, grey+alpha or RGBA; what a canvas exports) into
// compressed RGB and alpha streams for a PDF image. Returns null for anything else.
function pngImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 33) return null;
  if (buffer.readUInt32BE(0) !== 0x89504e47 || buffer.readUInt32BE(4) !== 0x0d0a1a0a) return null;
  let pos = 8,
    width = 0,
    height = 0,
    depth = 0,
    type = 0,
    interlace = 0;
  const idat = [];
  while (pos + 8 <= buffer.length) {
    const len = buffer.readUInt32BE(pos),
      name = buffer.toString("latin1", pos + 4, pos + 8),
      data = buffer.subarray(pos + 8, pos + 8 + len);
    if (name === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      type = data[9];
      interlace = data[12];
    } else if (name === "IDAT") idat.push(data);
    else if (name === "IEND") break;
    pos += 12 + len;
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[type];
  if (!channels || depth !== 8 || interlace || !width || !height || width * height > 4e6) return null;
  let raw;
  try {
    raw = zlib.inflateSync(Buffer.concat(idat));
  } catch {
    return null;
  }
  const stride = width * channels;
  if (raw.length < (stride + 1) * height) return null;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)],
      row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)),
      out = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[out + x - channels] : 0,
        b = y ? pixels[out - stride + x] : 0,
        c = y && x >= channels ? pixels[out - stride + x - channels] : 0;
      let v = row[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c,
          pa = Math.abs(p - a),
          pb = Math.abs(p - b),
          pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixels[out + x] = v & 255;
    }
  }
  const rgb = Buffer.alloc(width * height * 3),
    alpha = channels === 2 || channels === 4 ? Buffer.alloc(width * height) : null;
  for (let i = 0; i < width * height; i++) {
    const p = i * channels,
      grey = channels < 3;
    rgb[i * 3] = pixels[p];
    rgb[i * 3 + 1] = grey ? pixels[p] : pixels[p + 1];
    rgb[i * 3 + 2] = grey ? pixels[p] : pixels[p + 2];
    if (alpha) alpha[i] = pixels[p + channels - 1];
  }
  return { width, height, rgb: zlib.deflateSync(rgb), alpha: alpha && zlib.deflateSync(alpha) };
}

// Reads width, height and colour channels from a baseline or progressive JPEG; the file is embedded as is.
function jpegImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let pos = 2;
  while (pos + 9 < buffer.length) {
    if (buffer[pos] !== 0xff) return null;
    const marker = buffer[pos + 1],
      len = buffer.readUInt16BE(pos + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      const height = buffer.readUInt16BE(pos + 5),
        width = buffer.readUInt16BE(pos + 7),
        channels = buffer[pos + 9];
      if (!width || !height || ![1, 3].includes(channels)) return null;
      return { width, height, jpeg: buffer, gray: channels === 1 };
    }
    pos += 2 + len;
  }
  return null;
}
const imageOf = (buffer) => pngImage(buffer) || jpegImage(buffer);

// A4 portrait document. `pages` are arrays of content-stream commands; fonts F1 (Helvetica) and
// F2 (Helvetica-Bold) are always available, images from `images` (pngImage or jpegImage results) as /Im1, /Im2 …
function pdfDocument(pages, images = []) {
  const font = (name) => `<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`,
    objects = [null, null, Buffer.from(font("Helvetica")), Buffer.from(font("Helvetica-Bold"))],
    add = (obj) => objects.push(obj) && objects.length,
    stream = (dict, data) =>
      Buffer.concat([
        Buffer.from(`<< ${dict} /Length ${data.length} >>\nstream\n`),
        data,
        Buffer.from("\nendstream"),
      ]);
  const imageRefs = images.map((img) => {
    if (img.jpeg)
      return add(
        stream(
          `/Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /${img.gray ? "DeviceGray" : "DeviceRGB"} /BitsPerComponent 8 /Filter /DCTDecode`,
          img.jpeg,
        ),
      );
    const mask = img.alpha
      ? add(
          stream(
            `/Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`,
            img.alpha,
          ),
        )
      : 0;
    return add(
      stream(
        `/Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode${mask ? ` /SMask ${mask} 0 R` : ""}`,
        img.rgb,
      ),
    );
  });
  const xobjects = imageRefs.length
      ? ` /XObject << ${imageRefs.map((ref, i) => `/Im${i + 1} ${ref} 0 R`).join(" ")} >>`
      : "",
    pageRefs = pages.map((commands) => {
      const content = add(stream("", Buffer.from(commands.join("\n"), "latin1")));
      return add(
        Buffer.from(
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xobjects} >> /Contents ${content} 0 R >>`,
        ),
      );
    });
  objects[0] = Buffer.from("<< /Type /Catalog /Pages 2 0 R >>");
  objects[1] = Buffer.from(
    `<< /Type /Pages /Kids [${pageRefs.map((r) => `${r} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`,
  );
  const parts = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")],
    offsets = [];
  let size = parts[0].length;
  objects.forEach((object, i) => {
    const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), object, Buffer.from("\nendobj\n")]);
    offsets.push(size);
    parts.push(chunk);
    size += chunk.length;
  });
  let tail = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) tail += `${String(offset).padStart(10, "0")} 00000 n \n`;
  tail += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${size}\n%%EOF`;
  parts.push(Buffer.from(tail));
  return Buffer.concat(parts);
}

module.exports = { pdfText, wrapPdfText, pngImage, jpegImage, imageOf, pdfDocument };
