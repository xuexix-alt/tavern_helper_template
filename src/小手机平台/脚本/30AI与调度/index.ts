import { assemblePrompt, createPromptContextSnapshot } from '../../ai/promptAssembler';
import { fetchOpenAiCompatibleModels, OpenAICompatibleProvider, TavernProvider } from '../../ai/providers';
import { parseResponse } from '../../ai/responseParser';
import { createServiceModule } from '../../core/serviceModule';
import { registerPhoneModule } from '../../core/register';
import { ControlledPhoneScheduler } from '../../scheduler/phoneScheduler';
import {
  createGenerateRaw,
  createStopGenerationById,
  checkTavernApiAvailability,
} from '../../platform/tavernApiAdapter';

const services = Object.freeze({
  'prompt.assembler': Object.freeze({ assemblePrompt, createPromptContextSnapshot, parseResponse }),
  'ai.providers': Object.freeze({ fetchOpenAiCompatibleModels, OpenAICompatibleProvider, TavernProvider }),
  'phone.scheduler': Object.freeze({ ControlledPhoneScheduler }),
  'tavern.api': Object.freeze({ createGenerateRaw, createStopGenerationById, checkTavernApiAvailability }),
});

$(() => {
  registerPhoneModule({
    manifest: {
      id: 'ai.scheduler',
      version: '1.0.2',
      required: true,
      dependsOn: ['platform.services', 'data.sync'],
      capabilities: ['prompt.assembler', 'ai.providers', 'phone.scheduler', 'tavern.api'],
    },
    factory: () => createServiceModule('ai.scheduler', services),
  });
});
