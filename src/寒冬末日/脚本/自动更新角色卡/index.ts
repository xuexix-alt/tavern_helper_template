import { compare } from 'compare-versions';
import { z } from 'zod';

const SCRIPT_VERSION = '1.0.1';
const ACTIVE_INSTANCE_KEY = '__winter_auto_update_active_instance__';
const INSTANCE_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const CHARACTER_NAME = '末世寒冬 - 星穹秩序';
const BASE_URL = 'https://cdn.jsdelivr.net/gh/xuexix-alt/tavern_helper_template@20260211';
const REMOTE_VERSION_PATH = 'src/寒冬末日/自动更新角色卡版本.yaml';
const CHARACTER_CARD_PATH = 'src/末世寒冬 - 星穹秩序.png';

const BTN_CHECK = '角色卡更新-检查';
const BTN_APPLY = '角色卡更新-执行';
const BTN_TOGGLE_AUTO = '角色卡更新-自动开关';
let updateInProgress = false;

function hasIntegratedPhone(scripts: ScriptTree[]): boolean {
  return scripts.some(script => {
    if (!script.enabled) return false;
    if (script.type === 'folder') return hasIntegratedPhone(script.scripts);
    return (
      script.id === 'd9d2a605-64f7-4b3e-8d79-310b6bf87051' && script.content.includes('dist/小手机平台/一体化/index.js')
    );
  });
}

function requiresIntegratedPhone(version: string): boolean {
  return compare(version, '2.0.0', '>=');
}

const SettingsSchema = z
  .object({
    enabled: z.boolean().prefault(true),
    auto_apply: z.boolean().prefault(false),
    check_on_load: z.boolean().prefault(true),
    notify_latest: z.boolean().prefault(false),

    last_remote_version: z.string().prefault(''),
    last_applied_remote_version: z.string().prefault(''),
    last_check_at: z.string().prefault(''),
    last_error: z.string().prefault(''),
  })
  .prefault({
    enabled: true,
    auto_apply: false,
    check_on_load: true,
    notify_latest: false,
    last_remote_version: '',
    last_applied_remote_version: '',
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

function resolveRemoteUrls() {
  return {
    version_url: `${BASE_URL}/${REMOTE_VERSION_PATH}`,
    png_url: `${BASE_URL}/${CHARACTER_CARD_PATH}`,
  };
}

async function fetchRemoteVersion(versionUrl: string): Promise<string> {
  const response = await fetch(versionUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`拉取远程版本失败（${response.status}）: ${versionUrl}`);
  }

  const text = await response.text();
  const data = YAML.parse(text);
  const version = String(_.get(data, '版本', '')).trim();
  if (!version) {
    throw new Error(`远程版本清单缺少"版本"字段: ${versionUrl}`);
  }
  return version;
}

async function importRemoteCharacterPng(pngUrl: string, expectedVersion: string) {
  // 版本参数隔离不同发布版本；CDN 仍可能返回旧内容，因此导入后必须回读核验。
  const url = new URL(pngUrl);
  url.searchParams.set('version', expectedVersion);
  const response = await fetch(url.toString(), { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`拉取远程角色卡失败（${response.status}）: ${pngUrl}`);
  }

  const pngBlob = await response.blob();
  if (pngBlob.size <= 0) {
    throw new Error(`远程角色卡为空: ${pngUrl}`);
  }
  const imported = await importRawCharacter(`${CHARACTER_NAME}.png`, pngBlob);
  if (!imported.ok) throw new Error(`导入角色卡失败（${imported.status}），未确认更新成功`);

  const installed = await getCharacter(CHARACTER_NAME);
  if (installed.version.trim() !== expectedVersion) {
    throw new Error(
      `导入后版本为 ${installed.version || '空'}，预期 ${expectedVersion}；远端卡可能尚未同步，请稍后重试`,
    );
  }
  if (
    requiresIntegratedPhone(expectedVersion) &&
    !hasIntegratedPhone(installed.extensions.tavern_helper?.scripts ?? [])
  ) {
    throw new Error('导入后缺少已启用的小手机一体化脚本，更新不完整；请重新执行更新');
  }
}

async function runUpdateFlow(options?: { force_apply?: boolean; from_button?: boolean }) {
  if (!isActiveInstance() || updateInProgress) return;

  const forceApply = options?.force_apply === true;
  const fromButton = options?.from_button === true;
  const settings = readSettings();

  if (!settings.enabled && !forceApply) {
    return;
  }

  updateInProgress = true;
  try {
    const remote = resolveRemoteUrls();
    const remoteVersion = await fetchRemoteVersion(remote.version_url);
    const current = await getCharacter(CHARACTER_NAME);
    const currentVersion = String(current?.version ?? '').trim() || '0.0.0';
    const needUpdate = safeCompareLt(currentVersion, remoteVersion);

    patchSettings(prev => ({
      ...prev,
      last_check_at: new Date().toISOString(),
      last_remote_version: remoteVersion,
      last_error: '',
    }));

    if (needUpdate || (forceApply && currentVersion === remoteVersion)) {
      const shouldApply = settings.auto_apply || forceApply;
      if (shouldApply) {
        await importRemoteCharacterPng(remote.png_url, remoteVersion);
        patchSettings(prev => ({ ...prev, last_applied_remote_version: remoteVersion }));
        toastr.success(
          `[自动更新] 已核验 ${CHARACTER_NAME}: ${currentVersion} -> ${remoteVersion}。请刷新整个酒馆页面，清理旧小手机运行时`,
          '自动更新角色卡',
          { timeOut: 15_000 },
        );
      } else {
        toastr.info(
          `[自动更新] 检测到新版本 ${remoteVersion}（当前 ${currentVersion}），点击"${BTN_APPLY}"可执行更新`,
          '自动更新角色卡',
        );
      }
      return;
    }

    if (
      requiresIntegratedPhone(currentVersion) &&
      !hasIntegratedPhone(current.extensions.tavern_helper?.scripts ?? [])
    ) {
      throw new Error('当前卡缺少已启用的小手机一体化脚本；同版本可点击“角色卡更新-执行”重新导入，随后刷新酒馆');
    }
    if (settings.notify_latest || fromButton) {
      toastr.success(`[自动更新] 已是最新版本 ${currentVersion}`, '自动更新角色卡');
    }
  } catch (error) {
    const msg = toErrMsg(error);
    patchSettings(prev => ({
      ...prev,
      last_check_at: new Date().toISOString(),
      last_error: msg,
    }));
    toastr.warning(`[自动更新] ${msg}`, '自动更新角色卡');
  } finally {
    updateInProgress = false;
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
  console.info(`[自动更新角色卡] 寒冬末日 v${SCRIPT_VERSION}; auto_apply=${settings.auto_apply}`);

  if (settings.enabled && settings.check_on_load) {
    void runUpdateFlow();
  }
});
