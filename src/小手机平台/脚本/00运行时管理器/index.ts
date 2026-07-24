import { installPhoneRuntime } from '../../core/runtime';

$(() => {
  const runtime = installPhoneRuntime();

  // 延迟初始化逻辑：在所有模块注册完成后，初始化未自动初始化的关键模块
  setTimeout(async () => {
    console.log('[运行时管理器] 检查延迟初始化模块...');

    const criticalModules = ['wechat.adapter', 'main.adapter'];

    for (const moduleId of criticalModules) {
      const registration = runtime.registry?.registrations?.get(moduleId);
      const instance = runtime.registry?.instances?.get(moduleId);

      // 只有当模块已注册但未初始化时，才尝试初始化
      if (registration && !instance) {
        try {
          console.log(`[运行时管理器] 正在初始化 ${moduleId}...`);

          const module = registration.factory();
          const context = {
            moduleId,
            runtime,
            services: runtime.services,
            getOwner: () => runtime.getOwner(),
            getSession: () => runtime.getSession(),
          };

          await module.init(context);
          runtime.registry.instances.set(moduleId, module);
          runtime.registry.initializedOrder.push(moduleId);

          console.log(`[运行时管理器] ✅ ${moduleId} 初始化成功`);
        } catch (error) {
          console.error(`[运行时管理器] ❌ ${moduleId} 初始化失败:`, error);
        }
      } else if (instance) {
        const status = instance.getStatus?.();
        console.log(`[运行时管理器] ${moduleId} 已初始化，状态: ${status}`);

        // 如果 main.adapter 已经初始化成功，但 runtime owner 为空，设置它
        if (moduleId === 'main.adapter' && status === 'READY' && !runtime.getOwner()) {
          console.log(`[运行时管理器] main.adapter 状态正常但 runtime owner 为空，设置默认 owner`);
          runtime.setOwner({
            characterName: '末世寒冬 - 星穹秩序',
            adapterId: 'winter-apocalypse',
            runtimeMajor: 1,
          });
        }
      } else {
        console.warn(`[运行时管理器] ⚠️ ${moduleId} 未注册`);
      }
    }

    console.log('[运行时管理器] 延迟初始化完成');
  }, 1000); // 等待 1 秒，确保所有模块都已注册
});
