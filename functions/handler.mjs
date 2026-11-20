// Qoder Sites Edge Function /extract（方案 a，D001/D019）。
// 密钥仅服务端 Secret（Deno.env.get('APP_API_KEY')）；未配返回 E_SERVICE_NOT_CONFIGURED。
// 上游固定 DashScope OpenAI 兼容端点；文本 qwen-plus、视觉 qwen3-vl-plus（D022）。不回传密钥/原始上游异常。
const UPSTREAM = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const MODEL_TEXT = 'qwen-plus';
const MODEL_VISION = 'qwen3-vl-plus'; // D022：qwen-vl-max 已被上游下线（公告 118177）
const TIMEOUT_MS = 60000;
const MAX_IMAGES = 30;
const MAX_TEXT_CHARS = 200000;

const SYSTEM_PROMPT = [
  '你是课件考点提取器。从用户提供的课件文本或页面图片中提取相互独立、可自测的考点。',
  '只输出一个 JSON 数组，不要任何解释、不要 markdown 代码块。',
  '每个元素形如 {"question":"...","answer":"..."}：question 为卡片正面问题（纯文本、1-200 字），answer 为背面答案（纯文本、1-2000 字）。',
  '数组长度 1-99；按课件顺序；不要输出 HTML；不要编造课件中没有的内容。',
].join('\n');

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function fail(code, message, status = 200) {
  return json({ ok: false, code, message }, status);
}

function parseModelPoints(content) {
  if (typeof content !== 'string') return null;
  let s = content.trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  let arr;
  try {
    arr = JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(arr)) return null;
  const points = [];
  for (const item of arr) {
    const q = typeof item?.question === 'string' ? item.question.trim() : '';
    const a = typeof item?.answer === 'string' ? item.answer.trim() : '';
    if (q.length >= 1 && q.length <= 200 && a.length >= 1 && a.length <= 2000) {
      points.push({ question: q, answer: a });
    }
    if (points.length >= 99) break;
  }
  return points;
}

export function createHandler({ getSecret, fetchImpl }) {
  return async function handler(request) {
    const url = new URL(request.url);
    if (!url.pathname.endsWith('/extract')) {
      return fail('E_INVALID_PAYLOAD', '未知路径。', 404);
    }
    if (request.method !== 'POST') {
      return json({ ok: false, code: 'E_INVALID_PAYLOAD', message: '仅支持 POST。' }, 405);
    }
    const key = getSecret('APP_API_KEY');
    if (!key) {
      return fail('E_SERVICE_NOT_CONFIGURED', '识别服务未配置密钥。');
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return fail('E_INVALID_PAYLOAD', '请求体不是合法 JSON。', 400);
    }
    const fileName = typeof body?.fileName === 'string' ? body.fileName.slice(0, 200) : '';
    let model;
    let userContent;
    if (body?.kind === 'text') {
      if (typeof body.text !== 'string' || body.text.trim().length === 0 || body.text.length > MAX_TEXT_CHARS) {
        return fail('E_INVALID_PAYLOAD', '文本通道入参不合约定。', 400);
      }
      model = MODEL_TEXT;
      userContent = `课件文件名：${fileName}\n课件文本：\n${body.text}`;
    } else if (body?.kind === 'images') {
      if (!Array.isArray(body.images) || body.images.length === 0 || body.images.length > MAX_IMAGES) {
        return fail('E_INVALID_PAYLOAD', '视觉通道入参不合约定。', 400);
      }
      for (const img of body.images) {
        if (typeof img !== 'string' || !img.startsWith('data:image/')) {
          return fail('E_INVALID_PAYLOAD', '图片须为 dataURL。', 400);
        }
      }
      model = MODEL_VISION;
      userContent = [
        ...body.images.map((img) => ({ type: 'image_url', image_url: { url: img } })),
        { type: 'text', text: `课件文件名：${fileName}。请从以上页面图片提取考点。` },
      ];
    } else {
      return fail('E_INVALID_PAYLOAD', 'kind 须为 text 或 images。', 400);
    }

    let upstreamRes;
    try {
      upstreamRes = await fetchImpl(UPSTREAM, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userContent },
          ],
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return fail('E_UPSTREAM', '识别服务暂不可达，请稍后重试。');
    }
    if (!upstreamRes.ok) {
      return fail('E_UPSTREAM', '识别服务返回错误，请稍后重试。');
    }
    let upstreamBody;
    try {
      upstreamBody = await upstreamRes.json();
    } catch {
      return fail('E_UPSTREAM', '识别服务响应异常，请稍后重试。');
    }
    const points = parseModelPoints(upstreamBody?.choices?.[0]?.message?.content);
    if (!points || points.length === 0) {
      return fail('E_EMPTY_POINTS', '未提取到任何考点，请更换文件或重试。');
    }
    return json({ ok: true, points });
  };
}

const defaultGetSecret = (name) => (globalThis.Deno ? globalThis.Deno.env.get(name) : undefined);
export const handler = createHandler({ getSecret: defaultGetSecret, fetchImpl: (...a) => fetch(...a) });