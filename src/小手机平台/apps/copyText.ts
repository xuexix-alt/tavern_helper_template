/** 使用外壳所属 document，兼容酒馆脚本 iframe 不具备 Clipboard 权限的情况。 */
export async function copyText(document: Document, value: string): Promise<void> {
  try {
    const clipboard = document.defaultView?.navigator.clipboard;
    if (clipboard) {
      await clipboard.writeText(value);
      return;
    }
  } catch {
    // iframe 的 Clipboard API 可能被权限策略禁用，继续使用选区复制。
  }
  const active = document.activeElement as HTMLElement | null;
  const selection = document.getSelection();
  const ranges = selection
    ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange())
    : [];
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.readOnly = true;
  textarea.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.append(textarea);
  try {
    textarea.select();
    if (!document.execCommand('copy')) throw new Error('复制失败，请手动选择日志文本复制');
  } finally {
    textarea.remove();
    active?.focus({ preventScroll: true });
    if (selection) {
      selection.removeAllRanges();
      for (const range of ranges) selection.addRange(range);
    }
  }
}
