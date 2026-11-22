import { mockDeck } from '../data/mock-points.js';

const MESSAGES = {
  E_UNSUPPORTED_TYPE: '仅支持 PNG/JPG 截图或 PDF 课件，请更换文件格式后重试。',
  E_FILE_TOO_LARGE: '文件超过 20MB，请压缩或拆分后重试。',
  E_TOO_MANY_PAGES: 'PDF 超过 30 页，请截取前 30 页后重试。',
  E_PDF_PARSE: 'PDF 解析失败，文件可能已损坏，请重试。',
  E_EMPTY_POINTS: '未提取到任何考点，请更换文件或重试。',
  E_SERVICE_NOT_CONFIGURED: '识别服务未配置，已切换示例模式。',
  E_NETWORK: '网络连接失败，请检查网络后重试。',
  E_UPSTREAM: '识别服务出错，请稍后重试。',
  E_INVALID_PAYLOAD: '识别结果格式异常，请重试。',
  E_STORAGE_QUOTA: '本地存储空间不足，请清理后重试。',
  E_NOT_FLIPPED: '请先翻面看答案，再评分。',
};

export class ContractError extends Error {
  constructor(code, message = MESSAGES[code]) {
    super(message ?? code);
    this.name = 'ContractError';
    this.code = code;
  }
}

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'application/pdf'];
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_PAGES = 30;
const SCAN_MIN_CHARS = 50;      // D006：去空白 <50 字符/页判扫描
const RENDER_SCALE = 2;         // D006：扫描页 canvas scale=2
const JPEG_QUALITY = 0.8;       // D006：JPEG 0.8
const IMAGE_MAX_DIM = 1600;     // 上传截图客户端压缩上限（第四步加性）
const FETCH_TIMEOUT_MS = 60000;
const TRANSIENT_RETRY = 1;      // 第四步：失败自动重试 1 次
const RETRYABLE = new Set(['E_NETWORK', 'E_UPSTREAM']);
const ENDPOINT = '/functions/v1/app/extract';
const SOURCE_NAMES = { image: '图片', 'pdf-text': 'PDF 文字', 'pdf-scan': 'PDF 扫描', mock: '示例' };

// node 自检无 location → 视为 mock，保持 contract-check 可复跑；浏览器按 ?mock=1 判定（契约 §6）。
function isMockMode() {
  if (typeof location === 'undefined') return true;
  return new URLSearchParams(location.search).get('mock') === '1';
}

let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('../vendor/pdf.min.mjs')
      .then((m) => {
        m.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;
        return m;
      })
      .catch(() => { throw new ContractError('E_PDF_PARSE'); });
  }
  return pdfjsPromise;
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, IMAGE_MAX_DIM / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      } catch {
        reject(new ContractError('E_UNSUPPORTED_TYPE'));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new ContractError('E_UNSUPPORTED_TYPE')); };
    img.src = url;
  });
}

async function buildPdfPayload(file) {
  const pdfjs = await loadPdfjs();
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  } catch {
    throw new ContractError('E_PDF_PARSE');
  }
  try {
    if (doc.numPages > MAX_PAGES) throw new ContractError('E_TOO_MANY_PAGES');
    const warnings = [];
    const images = [];
    const textLines = [];
    let textPages = 0;
    let scanPages = 0;
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const stripped = content.items.map((it) => it.str).join('').replace(/\s/g, '');
      if (stripped.length < SCAN_MIN_CHARS) {
        scanPages++;
        const viewport = page.getViewport({ scale: RENDER_SCALE });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        images.push(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      } else {
        textPages++;
        let line = '';
        for (const it of content.items) {
          line += it.str;
          if (it.hasEOL) { textLines.push(line); line = ''; }
        }
        if (line) textLines.push(line);
      }
    }
    const sourceType = textPages >= scanPages ? 'pdf-text' : 'pdf-scan';
    if (textPages > 0 && scanPages > 0) {
      warnings.push(`混合 PDF：${textPages} 文字页 + ${scanPages} 扫描页，按多数页（${sourceType === 'pdf-text' ? '文字' : '视觉'}）通道提取。`);
    }
    const payload = sourceType === 'pdf-text'
      ? { kind: 'text', text: textLines.join('\n'), fileName: file.name }
      : { kind: 'images', images, fileName: file.name };
    return { payload, sourceType, warnings };
  } finally {
    doc.destroy();
  }
}

function validatePoints(points) {
  if (!Array.isArray(points)) throw new ContractError('E_INVALID_PAYLOAD');
  if (points.length === 0) throw new ContractError('E_EMPTY_POINTS');
  if (points.length > 99) throw new ContractError('E_INVALID_PAYLOAD');
  for (const pt of points) {
    const q = typeof pt?.question === 'string' ? pt.question.trim() : '';
    const a = typeof pt?.answer === 'string' ? pt.answer.trim() : '';
    if (q.length < 1 || q.length > 200 || a.length < 1 || a.length > 2000) {
      throw new ContractError('E_INVALID_PAYLOAD');
    }
  }
}

async function callFunction(payload) {
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    throw new ContractError('E_NETWORK');
  }
  // 404 或非 JSON = Function 未部署/网关异常，按 D004 零配置演示意图降级示例（D023）。
  if (res.status === 404) throw new ContractError('E_SERVICE_NOT_CONFIGURED');
  let body;
  try {
    body = await res.json();
  } catch {
    throw new ContractError('E_SERVICE_NOT_CONFIGURED');
  }
  if (!body || typeof body !== 'object') throw new ContractError('E_INVALID_PAYLOAD');
  if (body.ok === false) {
    throw new ContractError(typeof body.code === 'string' && MESSAGES[body.code] ? body.code : 'E_UPSTREAM');
  }
  if (body.ok !== true) throw new ContractError('E_INVALID_PAYLOAD');
  validatePoints(body.points);
  return body.points;
}

// 导出供自检/dev 以 fetch-stub 验证解析/重试/降级/错误映射（不依赖 DOM）。
export async function requestPoints(payload, sourceType, warnings = []) {
  let lastErr;
  for (let attempt = 0; attempt <= TRANSIENT_RETRY; attempt++) {
    try {
      const points = await callFunction(payload);
      const deck = {
        schemaVersion: 1,
        deckId: 'd' + Date.now().toString(36),
        title: '课件闪卡 · ' + SOURCE_NAMES[sourceType],
        sourceType,
        createdAt: new Date().toISOString(),
        points: points.map((pt, i) => ({
          id: 'p' + String(i + 1).padStart(2, '0'),
          question: pt.question.trim(),
          answer: pt.answer.trim(),
        })),
      };
      return { deck, warnings };
    } catch (err) {
      lastErr = err;
      if (!(err instanceof ContractError) || !RETRYABLE.has(err.code) || attempt === TRANSIENT_RETRY) throw err;
    }
  }
  throw lastErr;
}

export async function extractPoints(file) {
  if (!file || !ACCEPTED_TYPES.includes(file.type)) throw new ContractError('E_UNSUPPORTED_TYPE');
  if (file.size > MAX_BYTES) throw new ContractError('E_FILE_TOO_LARGE');
  if (isMockMode()) {
    return { deck: mockDeck(), warnings: ['mock：示例模式，演示数据，非真实识别结果'] };
  }
  let payload;
  let sourceType;
  let warnings = [];
  if (file.type === 'application/pdf') {
    ({ payload, sourceType, warnings } = await buildPdfPayload(file));
  } else {
    payload = { kind: 'images', images: [await compressImage(file)], fileName: file.name };
    sourceType = 'image';
  }
  try {
    return await requestPoints(payload, sourceType, warnings);
  } catch (err) {
    if (err instanceof ContractError && err.code === 'E_SERVICE_NOT_CONFIGURED') {
      return { deck: mockDeck(), warnings: ['service_not_configured：识别服务未配置，已自动降级示例模式。', ...warnings] };
    }
    throw err;
  }
}