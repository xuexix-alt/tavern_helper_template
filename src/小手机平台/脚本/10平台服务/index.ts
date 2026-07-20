import { createServiceModule } from '../../core/serviceModule';
import { registerPhoneModule } from '../../core/register';
import { createTopHostGateway } from '../../platform/hostGateway';
import { createSettingsStore } from '../../platform/settingsStore';

const services = Object.freeze({
  'host.gateway': Object.freeze({ createTopHostGateway }),
  'settings.store': Object.freeze({ createSettingsStore }),
});

$(() => {
  registerPhoneModule({
    manifest: {
      id: 'platform.services',
      version: '1.0.0',
      required: true,
      dependsOn: [],
      capabilities: ['host.gateway', 'settings.store'],
    },
    factory: () => createServiceModule('platform.services', services),
  });
});
