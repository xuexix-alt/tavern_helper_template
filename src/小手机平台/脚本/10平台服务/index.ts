import { createServiceModule } from '../../core/serviceModule';
import { registerPhoneModule } from '../../core/register';
import { createTopHostGateway } from '../../platform/hostGateway';
import { createSettingsStore } from '../../platform/settingsStore';
import { extractRecentCompletedStory, extractCurrentStory } from '../../platform/storyExtractor';

const services = Object.freeze({
  'host.gateway': Object.freeze({ createTopHostGateway }),
  'settings.store': Object.freeze({ createSettingsStore }),
  'story.extractor': Object.freeze({ extractRecentCompletedStory, extractCurrentStory }),
});

$(() => {
  registerPhoneModule({
    manifest: {
      id: 'platform.services',
      version: '1.0.1',
      required: true,
      dependsOn: [],
      capabilities: ['host.gateway', 'settings.store', 'story.extractor'],
    },
    factory: () => createServiceModule('platform.services', services),
  });
});
