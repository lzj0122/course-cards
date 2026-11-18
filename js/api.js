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

// M1 mock-first：契约 §6 规定 mock 路径不读文件内容；页数/解析校验与 Function 调用随真实管线启用。
export async function extractPoints(file) {
  if (!file || !ACCEPTED_TYPES.includes(file.type)) {
    throw new ContractError('E_UNSUPPORTED_TYPE');
  }
  if (file.size > MAX_BYTES) {
    throw new ContractError('E_FILE_TOO_LARGE');
  }
  return { deck: mockDeck(), warnings: ['mock：示例模式，演示数据，非真实识别结果'] };
}