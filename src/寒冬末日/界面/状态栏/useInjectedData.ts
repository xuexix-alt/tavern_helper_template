type InjectedData = {
  content: string;
  options: string[];
};

function parseInjectedText(raw: string): InjectedData {
  const contentMatch = raw.match(/<content>([\s\S]*?)(?:<\/content>|<option>|$)/);
  const optionMatch = raw.match(/<option>([\s\S]*?)<\/option>/);

  const content = contentMatch?.[1]?.trim() ?? '';
  const optionsRaw = optionMatch?.[1]?.trim() ?? '';
  const options = optionsRaw
    ? optionsRaw
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
    : [];

  return { content, options };
}

export function useInjectedData() {
  const content = ref<string>('');
  const options = ref<string[]>([]);

  const refresh = () => {
    const el = document.getElementById('injected-data-container');
    const raw = el?.textContent ?? '';
    const parsed = parseInjectedText(raw);
    content.value = parsed.content;
    options.value = parsed.options;
  };

  let observer: MutationObserver | null = null;

  onMounted(() => {
    refresh();
    const el = document.getElementById('injected-data-container');
    if (!el) return;

    observer = new MutationObserver(() => refresh());
    observer.observe(el, { characterData: true, childList: true, subtree: true });
  });

  onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;
  });

  return { content, options, refresh };
}
