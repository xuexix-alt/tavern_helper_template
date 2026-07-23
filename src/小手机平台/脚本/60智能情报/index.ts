import { createServiceModule } from '../../core/serviceModule';
import { registerPhoneModule } from '../../core/register';
import { createIntelligenceService } from '../../intelligence/intelligenceService';
import { MemoryProfileStore, MemoryTaskStore, PhoneDbProfileStore, PhoneDbTaskStore } from '../../intelligence/storage';

const services = Object.freeze({
  'intelligence.service': Object.freeze({ createIntelligenceService }),
  'intelligence.storage': Object.freeze({
    MemoryProfileStore,
    MemoryTaskStore,
    PhoneDbProfileStore,
    PhoneDbTaskStore,
  }),
});

$(() => {
  registerPhoneModule({
    manifest: {
      id: 'intelligence.services',
      version: '1.0.0',
      required: false,
      dependsOn: ['platform.services', 'data.sync', 'ai.scheduler'],
      capabilities: ['intelligence.service', 'intelligence.storage'],
    },
    factory: () => createServiceModule('intelligence.services', services),
  });
});
