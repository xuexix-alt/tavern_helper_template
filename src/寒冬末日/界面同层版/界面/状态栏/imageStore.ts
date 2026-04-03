/**
 * IndexedDB 图片存储（已废弃）
 *
 * Native-first runtime 已停用该路径。
 * 仅保留空壳 API 以兼容可能存在的旧调用。
 */

export const LEGACY_INDEXED_DB_IMAGE_STORE_ENABLED = false;

export async function storeImage(_input: {
  messageId: number;
  requestId: string;
  promptToken: string;
  prompt: string;
  imageData: string;
}): Promise<string> {
  return '';
}

export async function loadImage(_messageId: number, _requestId: string): Promise<string | null> {
  return null;
}

export async function loadImagesByMessage(_messageId: number): Promise<never[]> {
  return [];
}

export async function loadAllImagesForChat(): Promise<never[]> {
  return [];
}

export async function deleteImage(_messageId: number, _requestId: string): Promise<void> {}
