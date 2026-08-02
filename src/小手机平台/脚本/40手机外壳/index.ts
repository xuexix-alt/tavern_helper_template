import { createServiceModule } from '../../core/serviceModule';
import { registerPhoneModule } from '../../core/register';
import { createPhoneShell } from '../../shell/phoneShell';

const services = Object.freeze({
  'phone.shell': Object.freeze({ createPhoneShell }),
});

$(() => {
  registerPhoneModule({
    manifest: {
      id: 'phone.shell',
      version: '1.0.1',
      required: true,
      dependsOn: ['platform.services'],
      capabilities: ['phone.shell'],
    },
    factory: () => createServiceModule('phone.shell', services),
  });
});
