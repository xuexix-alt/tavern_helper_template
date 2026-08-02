import { createPhoneApps } from '../../apps/phoneApps';
import { createServiceModule } from '../../core/serviceModule';
import { registerPhoneModule } from '../../core/register';

const services = Object.freeze({
  'communication.apps': Object.freeze({ createPhoneApps }),
});

$(() => {
  registerPhoneModule({
    manifest: {
      id: 'communication.apps',
      version: '1.0.1',
      required: true,
      dependsOn: ['data.sync', 'ai.scheduler', 'phone.shell'],
      capabilities: ['communication.apps'],
    },
    factory: () => createServiceModule('communication.apps', services),
  });
});
