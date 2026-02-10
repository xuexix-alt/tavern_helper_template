import { compare } from 'compare-versions';
import { z } from 'zod';

import { checkAndUpdateCharacter } from '@util/common';

const SCRIPT_VERSION = '0.1.0';
const ACTIVE_INSTANCE_KEY = '__winter_auto_update_active_instance__';
const INSTANCE_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const BTN_CHECK = '角色卡更新-检查';
const BTN_APPLY = '角色卡更新-执行';
const BTN_TOGGLE_AUTO = '角色卡更新-自动开关';

const SettingsSchema = z
  .object({
    enabled: z.boolean().prefault(true),
    auto_apply: z.boolean().prefault(false),
    check_on_load: z.boolean().prefault(false),
    notify_latest: z.boolean().prefault(false),

    manual_character_name: z.string().prefault(''),
    remote_index_url: z.string().prefault(''),
    remote_png_url: z.string().prefault(''),

    last_remote_version: z.string().prefault(''),
    last_check_at: z.string().prefault(''),
    last_error: z.string().prefault(''),
  })
  .prefault({
    enabled: true,
    auto_apply: false,
    check_on_load: false,
    notify_latest: false,
    manual_character_name: '',
    remote_index_url: '',
    remote_png_url: '',
    last_remote_version: '',
    last_check_at: '',
    last_error: '',
  });

type AutoUpdateSettings = z.output<typeof SettingsSchema>;

function scriptVarOption() {
  try {
    if (typeof getScriptId === 'function') {
      return { type: 'script' as const, script_id: getScriptId() };
    }
  } catch {
    // ignore
  }
  return { type: 'script' as const };
}

function readSettings(): AutoUpdateSettings {
  try {
    const raw = getVariables(scriptVarOption()) ?? {};
    return SettingsSchema.parse(raw);
  } catch {
    return SettingsSchema.parse({});
  }
}

function writeSettings(next: AutoUpdateSettings) {
  try {
    replaceVariables(next, scriptVarOption());
  } catch {
    // ignore
  }
}

function patchSettings(patcher: (prev: AutoUpdateSettings) => AutoUpdateSettings) {
  const prev = readSettings();
  const next = patcher(prev);
  writeSettings(SettingsSchema.parse(next));
}

function getHostGlobal(): any {
  try {
    return (window.top ?? window) as any;
  } catch {
    return window as any;
  }
}

function markThisInstanceActive() {
  try {
    const host = getHostGlobal();
    host[ACTIVE_INSTANCE_KEY] = {
      id: INSTANCE_ID,
      version: SCRIPT_VERSION,
      script_id: typeof getScriptId === 'function' ? getScriptId() : null,
      ts: new Date().toISOString(),
    };
  } catch {
    // ignore
  }
}

function isActiveInstance(): boolean {
  try {
    const host = getHostGlobal();
    const cur = host?.[ACTIVE_INSTANCE_KEY];
    if (!cur || typeof cur !== 'object') return true;
    return cur.id === INSTANCE_ID;
  } catch {
    return true;
  }
}

function safeCompareLt(currentVersion: string, remoteVersion: string): boolean {
  try {
    return compare(currentVersion, remoteVersion, '<');
  } catch {
    return String(currentVersion).trim() !== String(remoteVersion).trim();
  }
}

function toErrMsg(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? 'unknown error');
}

async function resolveCharacterName(settings: AutoUpdateSettings): Promise<string> {
  const manual = String(settings.manual_character_name ?? '').trim();
  if (manual) return manual;

  const raw = getCharData('current');
  const name = String(raw?.name ?? '').trim();
  if (!name) throw new Error('未能读取当前角色卡名称');
  return name;
}

function resolveRemoteUrls(settings: AutoUpdateSettings, characterName: string) {
  const index = String(settings.remote_index_url ?? '').trim();
  const png = String(settings.remote_png_url ?? '').trim();
  if (index && png) {
    return { index_url: index, png_url: png, derived: false };
  }

  const encoded = encodeURIComponent(characterName);
  const base = `https://testingcf.jsdelivr.net/gh/StageDog/tavern_helper_template/dist/${encoded}`;

  return {
    index_url: index || `${base}/index.yaml`,
    png_url: png || `${base}/${encoded}.png`,
    derived: true,
  };
}

async function fetchRemoteVersion(indexUrl: string): Promise<string> {
  const response = await fetch(indexUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`拉取远程版本失败（${response.status}）: ${indexUrl}`);
  }

  const text = await response.text();
  const data = YAML.parse(text);
  const version = String(_.get(data, '版本', '')).trim();
  if (!version) {
    throw new Error(`远程 index.yaml 缺少“版本”字段: ${indexUrl}`);
  }
  return version;
}

async function runUpdateFlow(options?: { force_apply?: boolean; from_button?: boolean }) {
  if (!isActiveInstance()) return;

  const forceApply = options?.force_apply === true;
  const fromButton = options?.from_button === true;
  const settings = readSettings();

  if (!settings.enabled && !forceApply) {
    return;
  }

  try {
    const characterName = await resolveCharacterName(settings);
    const remote = resolveRemoteUrls(settings, characterName);
    const remoteVersion = await fetchRemoteVersion(remote.index_url);
    const current = await getCharacter(characterName);
    const currentVersion = String(current?.version ?? '0.0.0').trim() || '0.0.0';
    const needUpdate = safeCompareLt(currentVersion, remoteVersion);

    patchSettings(prev => ({
      ...prev,
      last_check_at: new Date().toISOString(),
      last_remote_version: remoteVersion,
      last_error: '',
    }));

    if (needUpdate) {
      const shouldApply = settings.auto_apply || forceApply;
      if (shouldApply) {
        await checkAndUpdateCharacter(characterName, remoteVersion, remote.png_url);
        toastr.success(
          `[自动更新] 已更新 ${characterName}: ${currentVersion} -> ${remoteVersion}`,
          '自动更新角色卡',
        );
      } else {
        toastr.info(
          `[自动更新] 检测到新版本 ${remoteVersion}（当前 ${currentVersion}），点击“${BTN_APPLY}”可执行更新`,
          '自动更新角色卡',
        );
      }
      return;
    }

    if (settings.notify_latest || fromButton) {
      const suffix = remote.derived ? '（URL为自动推导）' : '';
      toastr.success(`[自动更新] 已是最新版本 ${currentVersion}${suffix}`, '自动更新角色卡');
    }
  } catch (error) {
    const msg = toErrMsg(error);
    patchSettings(prev => ({
      ...prev,
      last_check_at: new Date().toISOString(),
      last_error: msg,
    }));
    toastr.warning(`[自动更新] ${msg}`, '自动更新角色卡');
  }
}

function registerButtons() {
  if (typeof appendInexistentScriptButtons === 'function') {
    appendInexistentScriptButtons([
      { name: BTN_CHECK, visible: true },
      { name: BTN_APPLY, visible: true },
      { name: BTN_TOGGLE_AUTO, visible: true },
    ]);
  }

  if (typeof getButtonEvent !== 'function') return;

  eventOn(getButtonEvent(BTN_CHECK), () => {
    void runUpdateFlow({ from_button: true });
  });

  eventOn(getButtonEvent(BTN_APPLY), () => {
    void runUpdateFlow({ force_apply: true, from_button: true });
  });

  eventOn(getButtonEvent(BTN_TOGGLE_AUTO), () => {
    patchSettings(prev => ({ ...prev, auto_apply: !prev.auto_apply }));
    const now = readSettings();
    toastr.info(`[自动更新] auto_apply: ${now.auto_apply ? '开启' : '关闭'}`, '自动更新角色卡');
  });
}

$(() => {
  markThisInstanceActive();
  if (!isActiveInstance()) return;

  registerButtons();

  const settings = readSettings();
  console.info(`[自动更新角色卡] 已加载 v${SCRIPT_VERSION}; auto_apply=${settings.auto_apply}`);

  if (settings.enabled && settings.check_on_load) {
    void runUpdateFlow();
  }
});
