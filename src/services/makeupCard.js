const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

const template = fs.readFileSync(path.join(__dirname, '../assets/rotary-makeup-card-template.pdf'));
const latinBytes = fs.readFileSync(path.join(__dirname, '../assets/noto-sans-latin.ttf'));
const extendedBytes = fs.readFileSync(path.join(__dirname, '../assets/noto-sans-latin-ext.ttf'));
const latinMap = fontkit.create(latinBytes);
const extendedMap = fontkit.create(extendedBytes);

const segmentText = (value, fonts) => {
  const segments = [];
  for (const original of value) {
    const variants = [original, original.normalize('NFD')];
    const supported = variants.find((candidate) => [...candidate].every((char) => {
      const codePoint = char.codePointAt(0);
      return latinMap.hasGlyphForCodePoint(codePoint) || extendedMap.hasGlyphForCodePoint(codePoint);
    }));
    if (!supported) throw new Error(`The card template font cannot render “${original}”`);
    for (const char of supported) {
      const extended = !latinMap.hasGlyphForCodePoint(char.codePointAt(0));
      const font = extended ? fonts.extended : fonts.latin;
      const last = segments[segments.length - 1];
      if (last?.font === font) last.text += char;
      else segments.push({ font, text: char });
    }
  }
  return segments;
};

const measureText = (segments, size) => segments.reduce((total, segment) => total + segment.font.widthOfTextAtSize(segment.text, size), 0);

const fittedSize = (segments, maxWidth, startSize = 13) => {
  let size = startSize;
  while (size > 5 && measureText(segments, size) > maxWidth) size -= 0.5;
  return size;
};

const drawField = (page, fonts, value, { x, y, width, align = 'left', fontSize = 13, maskBottom = 4 }) => {
  const segments = segmentText(value, fonts);
  const size = fittedSize(segments, width, fontSize);
  const textWidth = measureText(segments, size);
  const textX = align === 'center' ? x + (width - textWidth) / 2 : x;
  // Cover the template's bracketed variable before writing the approved value.
  // Keep the mask tight to the original value so it does not erase the label above it.
  page.drawRectangle({ x, y: y - maskBottom, width, height: maskBottom + 10, color: rgb(1, 1, 1) });
  let cursor = textX;
  for (const segment of segments) {
    page.drawText(segment.text, { x: cursor, y, size, font: segment.font, color: rgb(0.05, 0.05, 0.05) });
    cursor += segment.font.widthOfTextAtSize(segment.text, size);
  }
};

exports.generateMakeupCard = async ({ visitorName, hostClub, requestDate, presidentName, secretaryName }) => {
  const document = await PDFDocument.load(template);
  document.registerFontkit(fontkit);
  const fonts = {
    latin: await document.embedFont(latinBytes),
    extended: await document.embedFont(extendedBytes),
  };
  const page = document.getPages()[0];
  const [year, month, day] = requestDate.split('-');
  const displayDate = `${day}/${month}/${year}`;

  drawField(page, fonts, visitorName, { x: 67, y: 518, width: 470 });
  drawField(page, fonts, hostClub, { x: 67, y: 482, width: 470, maskBottom: 8 });
  drawField(page, fonts, displayDate, { x: 67, y: 442, width: 470, maskBottom: 8 });
  drawField(page, fonts, presidentName, { x: 64, y: 407, width: 224, align: 'center', fontSize: 12, maskBottom: 8 });
  drawField(page, fonts, secretaryName, { x: 324, y: 407, width: 224, align: 'center', fontSize: 12, maskBottom: 8 });

  return Buffer.from(await document.save());
};
