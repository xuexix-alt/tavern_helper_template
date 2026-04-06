function install(mod, label) {
  if (!mod) return;
  const path = require('path');
  const targetSuffix = path.normalize('dist/demo/界面/状态栏/index.html');
  const matches = target => typeof target === 'string' && path.normalize(target).endsWith(targetSuffix);
  const log = (kind, target) => {
    if (!matches(target)) return;
    const stack = new Error().stack?.split(/\r?\n/).slice(2, 14).join('\n') ?? '';
    console.error('\n[trace-open][' + label + '] ' + kind + ': ' + target + '\n' + stack + '\n');
  };
  for (const key of ['open', 'openSync', 'readFile', 'readFileSync', 'createReadStream']) {
    const original = mod[key];
    if (typeof original !== 'function') continue;
    mod[key] = function(target, ...args) {
      log(key, target);
      return original.call(this, target, ...args);
    };
  }
  if (mod.promises?.open) {
    const original = mod.promises.open.bind(mod.promises);
    mod.promises.open = async function(target, ...args) {
      log('promises.open', target);
      return original(target, ...args);
    };
  }
  if (mod.promises?.readFile) {
    const original = mod.promises.readFile.bind(mod.promises);
    mod.promises.readFile = async function(target, ...args) {
      log('promises.readFile', target);
      return original(target, ...args);
    };
  }
}
install(require('fs'), 'fs');
try { install(require('graceful-fs'), 'graceful-fs'); } catch {}
