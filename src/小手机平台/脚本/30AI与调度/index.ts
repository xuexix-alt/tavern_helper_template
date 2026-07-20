import { assemblePrompt, createPromptContextSnapshot } from '../../ai/promptAssembler';
import { OpenAICompatibleProvider, TavernProvider } from '../../ai/providers';
import { parseResponse } from '../../ai/responseParser';
import { createServiceModule } from '../../core/serviceModule';
import { registerPhoneModule } from '../../core/register';
import { ControlledPhoneScheduler } from '../../scheduler/phoneScheduler';

const services = Object.freeze({
  'prompt.assembler': Object.freeze({ assemblePrompt, createPromptContextSnapshot, parseResponse }),
  'ai.providers': Object.freeze({ OpenAICompatibleProvider, TavernProvider }),
  'phone.scheduler': Object.freeze({ ControlledPhoneScheduler }),
});

$(() => {
  registerPhoneModule({
    manifest: {
      id: 'ai.scheduler',
      version: '1.0.0',
      required: true,
      dependsOn: ['platform.services', 'data.sync'],
      capabilities: ['prompt.assembler', 'ai.providers', 'phone.scheduler'],
    },
    factory: () => createServiceModule('ai.scheduler', services),
  });
});
