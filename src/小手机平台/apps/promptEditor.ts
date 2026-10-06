import type { PhoneAppDefinition } from './phoneApps';
import { copyText } from './copyText';
import { PROMPT_DEFINITIONS } from '../ai/promptCatalog';
import {
  defaultPromptSettings,
  getPromptScope,
  loadPromptSettings,
  savePromptSettings,
  validatePromptSettings,
  renderPromptTemplate,
  type PromptSettings,
} from '../ai/promptTemplates';

export function createPromptEditorApp(): PhoneAppDefinition {
  const drafts = new Map<string, PromptSettings>();
  const dirty = new Set<string>();
  let selected = 'chat.rules';
  return {
    route: 'prompt-editor',
    title: '提示词',
    glyph: '✎',
    async render(ctx) {
      const doc = ctx.document,
        scope = getPromptScope();
      let loadError = '';
      if (!drafts.has(scope)) {
        try {
          drafts.set(scope, loadPromptSettings());
        } catch {
          drafts.set(scope, defaultPromptSettings());
          loadError = '保存的配置无法读取，当前显示默认值。保存前可先导出草稿。';
        }
      }
      let draft = drafts.get(scope)!;
      const root = doc.createElement('section');
      root.className = 'phone-prompt';
      const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => {
        const n = doc.createElement(tag);
        n.textContent = text;
        return n;
      };
      const status = el('p', loadError || (dirty.has(scope) ? '有未保存修改' : '已载入保存配置'));
      status.setAttribute('role', 'status');
      const changed = () => {
        dirty.add(scope);
        drafts.set(scope, draft);
        status.textContent = '有未保存修改 · 保存后用于后续生成';
      };
      const button = (text: string, action: () => void | Promise<void>) => {
        const b = el('button', text);
        b.type = 'button';
        ctx.listen(b, 'click', () => {
          Promise.resolve()
            .then(action)
            .catch(error => {
              status.textContent = String(error instanceof Error ? error.message : error);
            });
        });
        return b;
      };
      root.append(el('h3', '提示词工作台'), el('p', '当前角色：' + scope), status);
      const select = el('select');
      select.setAttribute('aria-label', '选择提示词');
      for (const group of [...new Set(PROMPT_DEFINITIONS.map(d => d.group))]) {
        const g = el('optgroup');
        g.label = group;
        for (const d of PROMPT_DEFINITIONS.filter(d => d.group === group)) {
          const option = el('option', d.title);
          option.value = d.id;
          g.append(option);
        }
        select.append(g);
      }
      select.value = selected;
      ctx.listen(select, 'change', () => {
        selected = select.value;
        ctx.requestRender();
      });
      root.append(select);
      const d = PROMPT_DEFINITIONS.find(d => d.id === selected)!;
      const override = draft.overrides[selected];
      const input = el('textarea');
      input.className = 'phone-prompt-editor';
      input.value = override?.text ?? d.text;
      input.spellcheck = false;
      input.setAttribute('aria-label', d.title + '内容');
      let enabled = override?.enabled ?? true;
      const update = () => {
        draft.overrides[d.id] = { text: input.value, enabled };
        changed();
      };
      if (d.canDisable) {
        const label = el('label', '启用此段 ');
        const check = el('input');
        check.type = 'checkbox';
        check.checked = enabled;
        ctx.listen(check, 'change', () => {
          enabled = check.checked;
          update();
        });
        label.append(check);
        root.append(label);
      }
      root.append(el('p', '动态变量在生成时自动填入。修改仅在保存后生效；切换页面会保留本次草稿。'), input);
      ctx.listen(input, 'input', update);
      const tokens = el('div');
      tokens.className = 'phone-prompt-actions';
      for (const token of Object.keys(d.tokens))
        tokens.append(
          button('{{' + token + '}}', () => {
            input.setRangeText('{{' + token + '}}', input.selectionStart, input.selectionEnd, 'end');
            input.focus();
            update();
          }),
        );
      root.append(tokens);
      root.append(
        button('恢复本段默认', () => {
          delete draft.overrides[d.id];
          changed();
          ctx.requestRender();
        }),
      );
      const preview = el('details');
      preview.append(el('summary', '模板预览与复制'));
      const output = el('textarea');
      output.readOnly = true;
      output.setAttribute('aria-label', '模板预览');
      output.rows = 10;
      const refreshPreview = () => {
        output.value = renderPromptTemplate(
          d.id,
          Object.fromEntries(Object.keys(d.tokens).map(k => [k, '【运行时填入：' + k + '】'])),
          draft,
        );
      };
      refreshPreview();
      preview.append(
        el('p', '此处使用占位说明，不读取聊天。实际人物、历史和裁切结果请以请求日志为准。'),
        button('刷新预览', refreshPreview),
        output,
        button('复制预览', async () => {
          refreshPreview();
          await copyText(doc, output.value);
          status.textContent = '预览已复制';
        }),
      );
      root.append(preview);
      const limits = el('details');
      limits.append(el('summary', '微信上下文额度'));
      const names: Record<keyof PromptSettings['context'], string> = {
        maxCharacters: '总预算（字符，非 token）',
        historyCount: '读取微信历史条数',
        protectedHistory: '优先保护最近微信条数',
        storyCount: '相关正文楼层数',
        storyCharacters: '每层正文最多字符（600～20000）',
      };
      for (const [key, title] of Object.entries(names)) {
        const label = el('label', title);
        const field = el('input');
        field.type = 'number';
        field.value = String(draft.context[key as keyof typeof draft.context]);
        ctx.listen(field, 'input', () => {
          draft.context[key as keyof typeof draft.context] = Number(field.value);
          changed();
        });
        label.append(field);
        limits.append(label);
      }
      limits.append(el('p', '默认保护最近 16 条微信。固定资料与受保护历史超过总额度时，会提示预算不足。'));
      root.append(limits);
      const transfer = el('details');
      transfer.append(el('summary', '备份、导入与恢复'));
      const json = el('textarea');
      json.rows = 6;
      json.setAttribute('aria-label', '提示词配置 JSON');
      transfer.append(
        json,
        button('导出当前草稿', async () => {
          json.value = JSON.stringify(draft, null, 2);
          await copyText(doc, json.value);
          status.textContent = '配置已复制（不含 API 密钥）';
        }),
        button('导入为草稿', () => {
          draft = validatePromptSettings(JSON.parse(json.value));
          changed();
          ctx.requestRender();
        }),
      );
      const confirm = el('input');
      confirm.type = 'checkbox';
      const confirmLabel = el('label', '允许恢复全部默认（仍需保存）');
      confirmLabel.append(confirm);
      transfer.append(
        confirmLabel,
        button('恢复全部默认', () => {
          if (!confirm.checked) throw new Error('请先勾选允许恢复全部默认');
          draft = defaultPromptSettings();
          changed();
          ctx.requestRender();
        }),
      );
      root.append(transfer);
      const actions = el('div');
      actions.className = 'phone-prompt-save';
      actions.append(
        button('保存全部修改', () => {
          if (getPromptScope() !== scope) throw new Error('角色已切换，请重新打开面板');
          savePromptSettings(draft, localStorage, scope);
          dirty.delete(scope);
          status.textContent = '已保存 · 后续生成使用新配置';
          ctx.announce('提示词已保存', 'info');
        }),
      );
      root.append(actions);
      return root;
    },
  };
}
