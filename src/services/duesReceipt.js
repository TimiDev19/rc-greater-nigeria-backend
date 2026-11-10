const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

const template = fs.readFileSync(path.join(__dirname, '../assets/rotary-dues-payment-receipt-template.pdf'));
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
    if (!supported) throw new Error(`The receipt font cannot render “${original}”`);
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

const widthOf = (segments, size) => segments.reduce((sum, part) => sum + part.font.widthOfTextAtSize(part.text, size), 0);
const fitSize = (segments, width, initial) => {
  let size = initial;
  while (size > 5 && widthOf(segments, size) > width) size -= 0.5;
  return size;
};

const drawValue = (page, fonts, value, { x, y, width, size = 13, align = 'left' }) => {
  const segments = segmentText(value, fonts);
  const fitted = fitSize(segments, width, size);
  const totalWidth = widthOf(segments, fitted);
  let cursor = align === 'center' ? x + (width - totalWidth) / 2 : x;
  for (const part of segments) {
    page.drawText(part.text, { x: cursor, y, size: fitted, font: part.font, color: rgb(0.05, 0.05, 0.05) });
    cursor += part.font.widthOfTextAtSize(part.text, fitted);
  }
};

exports.generateDuesReceipt = async (receipt) => {
  const document = await PDFDocument.load(template);
  document.registerFontkit(fontkit);
  const fonts = {
    latin: await document.embedFont(latinBytes),
    extended: await document.embedFont(extendedBytes),
  };
  const page = document.getPages()[0];
  const [year, month, day] = receipt.receipt_date.split('-');

  drawValue(page, fonts, `${day}/${month}/${year}`, { x: 76, y: 519, width: 460 });
  drawValue(page, fonts, receipt.rotarian_name, { x: 76, y: 475, width: 460 });
  drawValue(page, fonts, receipt.amount_paid, { x: 76, y: 431, width: 460 });
  drawValue(page, fonts, receipt.rotary_year, { x: 76, y: 387, width: 460 });
  // The two officer names sit just above the existing signature lines.
  drawValue(page, fonts, receipt.president_name, { x: 124, y: 337, width: 105, size: 10, align: 'center' });
  drawValue(page, fonts, receipt.secretary_name, { x: 383, y: 337, width: 105, size: 10, align: 'center' });

  return Buffer.from(await document.save());
};
