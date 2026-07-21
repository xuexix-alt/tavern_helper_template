import { createServiceModule } from '../../core/serviceModule';
import { registerPhoneModule } from '../../core/register';
import { ChatLoreSync, LORE_ENTRY_DEFINITIONS } from '../../data/chatLoreSync';
import { buildLoreSummary } from '../../data/loreSummary';
import { createIndexedDbPhoneDb, createMemoryPhoneDb } from '../../data/phoneDb';

const services = Object.freeze({
  'phone.db': Object.freeze({ createIndexedDbPhoneDb, createMemoryPhoneDb }),
  'chat-lore.sync': Object.freeze({ ChatLoreSync, LORE_ENTRY_DEFINITIONS, buildLoreSummary }),
});

$(() => {
  registerPhoneModule({
    manifest: {
      id: 'data.sync',
      version: '1.0.0',
      required: true,
      dependsOn: ['platform.services'],
      capabilities: ['phone.db', 'chat-lore.sync'],
    },
    factory: () => createServiceModule('data.sync', services),
  });
});
