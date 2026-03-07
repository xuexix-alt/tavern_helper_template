import _ from 'lodash';

const SCRIPT_NAME = '开局角色选择器';
const BTN_INFO = '角色触发说明';
const MIGRATION_NOTICE_KEY = 'eden.role_selector.deprecated_notice_shown';

function readNoticeShown(): boolean {
  try {
    const vars = getVariables({ type: 'chat' }) ?? {};
    return _.get(vars, MIGRATION_NOTICE_KEY, false) === true;
  } catch {
    return false;
  }
}

function markNoticeShown() {
  try {
    updateVariablesWith(
      vars => {
        _.set(vars, MIGRATION_NOTICE_KEY, true);
        return vars;
      },
      { type: 'chat' },
    );
  } catch {}
}

function showDeprecatedNotice() {
  toastr.info('角色选择器已弃用：角色档案现改为酒馆原生绿灯触发。');
  toastr.info('旧的角色控制变量会暂时保留，仅用于兼容旧存档，不再参与触发。');
}

function ensureButtons() {
  if (typeof appendInexistentScriptButtons !== 'function') return;
  appendInexistentScriptButtons([{ name: BTN_INFO, visible: true }]);
}

function bindButtons() {
  if (typeof getButtonEvent !== 'function' || typeof eventOn !== 'function') return;
  eventOn(getButtonEvent(BTN_INFO), () => {
    showDeprecatedNotice();
  });
}

$(async () => {
  ensureButtons();
  bindButtons();

  if (!readNoticeShown()) {
    markNoticeShown();
    showDeprecatedNotice();
  }

  console.info(`[${SCRIPT_NAME}] 已切换为弃用兼容模式，不再参与角色档案触发。`);
});
