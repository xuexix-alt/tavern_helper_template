/**
 * 最小路径：从 UI iframe 的 DOM 中直接获取图片
 *
 * 原理：
 * 1. 插件生成的图片已经以 base64 形式存在于 .st-chatu8-image-container img 元素中
 * 2. UI iframe 可以通过 document 访问自己的 DOM
 * 3. 直接从 DOM 中提取图片 src 即可
 */

export interface SimpleImageRef {
  src: string;
  promptToken: string;
  messageId: number;
  index: number;
}

export function collectImagesFromUIDom(messageId: number): SimpleImageRef[] {
  const images: SimpleImageRef[] = [];

  // 方式1：在当前 document 中查找
  // UI iframe 的 document 中，图片在 .st-chatu8-image-container 容器中
  const containers = document.querySelectorAll('.st-chatu8-image-container');

  containers.forEach((container, index) => {
    const img = container.querySelector('img');
    if (img && img.src && img.src.startsWith('data:image/png;base64')) {
      images.push({
        src: img.src,
        promptToken: img.getAttribute('alt') || img.title || '',
        messageId,
        index,
      });
    }
  });

  return images;
}

export function collectAllImagesFromUIDom(): Map<number, SimpleImageRef[]> {
  const result = new Map<number, SimpleImageRef[]>();

  // 遍历所有 transcript-entry
  const entries = document.querySelectorAll('.transcript-entry[data-message-id]');

  entries.forEach(entry => {
    const mesid = parseInt(entry.getAttribute('data-message-id') || '-1', 10);
    if (mesid < 0) return;

    const images: SimpleImageRef[] = [];
    const containers = entry.querySelectorAll('.st-chatu8-image-container');

    containers.forEach((container, index) => {
      const img = container.querySelector('img');
      if (img && img.src && img.src.startsWith('data:image/png;base64')) {
        images.push({
          src: img.src,
          promptToken: img.getAttribute('alt') || img.title || '',
          messageId: mesid,
          index,
        });
      }
    });

    if (images.length > 0) {
      result.set(mesid, images);
    }
  });

  return result;
}

/**
 * 最简单的获取方式：直接从 DOM 中的 img 元素获取
 */
export function getAllGeneratedImages(): HTMLImageElement[] {
  const images: HTMLImageElement[] = [];

  // 查找所有 alt="Generated Image" 的图片
  const allImages = document.querySelectorAll<HTMLImageElement>('img[alt="Generated Image"]');
  allImages.forEach(img => {
    if (img.src && img.src.startsWith('data:image')) {
      images.push(img);
    }
  });

  return images;
}
