// PDF 课件鉴定探针：文本层字符数 / 图像绘制指令 / 文本 dump / 扫描页 JPEG 抽取
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const samples = path.join(root, 'samples');
const fontUrl = new URL('./node_modules/pdfjs-dist/standard_fonts/', import.meta.url).href;

async function probe(file) {
  const data = new Uint8Array(fs.readFileSync(path.join(samples, file)));
  const doc = await getDocument({ data, standardFontDataUrl: fontUrl, useSystemFonts: true, isEvalSupported: false }).promise;
  const report = { file, pages: doc.numPages, perPage: [] };
  let fullText = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const text = tc.items.map(it => it.str).join('');
    const chars = text.replace(/\s/g, '').length;
    const ops = await page.getOperatorList();
    let imgOps = 0;
    for (let j = 0; j < ops.fnArray.length; j++) {
      if (ops.fnArray[j] === OPS.paintImageXObject || ops.fnArray[j] === OPS.paintInlineImageXObject) imgOps++;
    }
    report.perPage.push({ page: i, textChars: chars, imagePaintOps: imgOps });
    fullText += `\n===== PAGE ${i} =====\n` + text;
  }
  report.totalTextChars = report.perPage.reduce((s, p) => s + p.textChars, 0);
  report.verdict = report.totalTextChars < 50 ? 'SCAN (no text layer)' : 'TEXT (extractable text layer)';
  console.log(JSON.stringify(report, null, 2));
  if (file.includes('text')) fs.writeFileSync(path.join(root, 'tools', 'text-dump.txt'), fullText);
  // 扫描版：直接从 PDF 字节流抽嵌入 JPEG（DCTDecode），免 canvas 渲染
  if (file.includes('scan')) {
    const buf = fs.readFileSync(path.join(samples, file));
    const jpgs = [];
    let start = 0;
    while ((start = buf.indexOf(Buffer.from([0xff, 0xd8, 0xff]), start)) !== -1) {
      const end = buf.indexOf(Buffer.from([0xff, 0xd9]), start);
      if (end === -1) break;
      jpgs.push(buf.subarray(start, end + 2));
      start = end + 2;
    }
    jpgs.sort((a, b) => b.length - a.length);
    if (jpgs.length) {
      fs.writeFileSync(path.join(samples, 'scan-page-extract.jpg'), jpgs[0]);
      console.log(`extracted ${jpgs.length} embedded JPEGs, largest = ${jpgs[0].length} bytes -> samples/scan-page-extract.jpg`);
    } else console.log('no embedded JPEG found (may be Flate/PNG encoded)');
  }
  await doc.destroy();
}

await probe('sample-text.pdf');
await probe('sample-scan.pdf');