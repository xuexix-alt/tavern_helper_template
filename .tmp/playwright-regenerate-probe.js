async page => {
  const frameLocator = page.frameLocator('iframe[name="TH-message--0--0"]');
  const sampleState = async () => page.evaluate(async () => {
    const iframe = document.querySelector('iframe');
    const frame = iframe?.contentWindow;
    const api = frame?.wrappedJSObject ?? frame;
    const getChatMessages = api?.getChatMessages || frame?.getChatMessages;
    const macro = api?.substitudeMacros;
    const list = await getChatMessages?.('0-80', { hide_state: 'all' });
    const latestUser = [...(list || [])].reverse().find(m => m.role === 'user');
    const latestAssistant = [...(list || [])].reverse().find(m => m.role === 'assistant');
    let lastUserMessage = null;
    let input = null;
    try { lastUserMessage = macro ? await macro('{{lastUserMessage}}') : 'no-macro'; } catch (e) { lastUserMessage = 'ERR:' + String(e); }
    try { input = macro ? await macro('{{input}}') : 'no-macro'; } catch (e) { input = 'ERR:' + String(e); }
    return {
      latestUserId: latestUser?.message_id ?? null,
      latestUserHidden: latestUser ? !!latestUser.is_hidden : null,
      latestAssistantId: latestAssistant?.message_id ?? null,
      latestAssistantHidden: latestAssistant ? !!latestAssistant.is_hidden : null,
      lastUserMessage: typeof lastUserMessage === 'string' ? lastUserMessage.slice(0,120) : lastUserMessage,
      input: typeof input === 'string' ? input.slice(0,120) : input,
      latestAssistantPreview: latestAssistant ? String(latestAssistant.message || latestAssistant.mes || '').slice(0,80) : null,
    };
  });

  const before = await sampleState();
  await frameLocator.getByRole('button', { name: '改词重生' }).click();
  await frameLocator.getByRole('button', { name: '确认重生' }).click();

  const samples = [];
  const start = Date.now();
  for (let i = 0; i < 240; i += 1) {
    const s = await sampleState();
    samples.push({ t: Date.now() - start, ...s });
    await page.waitForTimeout(50);
  }

  const interesting = samples.filter((sample, index, arr) => {
    if (index === 0) return true;
    const prev = arr[index - 1];
    return sample.latestUserHidden !== prev.latestUserHidden
      || sample.latestAssistantId !== prev.latestAssistantId
      || sample.latestAssistantHidden !== prev.latestAssistantHidden
      || sample.lastUserMessage !== prev.lastUserMessage
      || sample.latestAssistantPreview !== prev.latestAssistantPreview;
  });

  return {
    before,
    first: samples[0],
    last: samples[samples.length - 1],
    interesting,
    sawUnhiddenUser: samples.some(s => s.latestUserHidden === false),
    sawMacroFilled: samples.some(s => !!s.lastUserMessage),
    sawAssistantStreaming: samples.some(s => String(s.latestAssistantPreview || '').includes('<demo_phase>stream')),
    assistantIds: [...new Set(samples.map(s => s.latestAssistantId).filter(v => v != null))],
  };
}
