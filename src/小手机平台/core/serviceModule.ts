import type { PhoneModule, PhoneModuleContext, PhoneModuleStatus } from './types';

export function createServiceModule(moduleId: string, services: Readonly<Record<string, unknown>>): PhoneModule {
  let status: PhoneModuleStatus = 'REGISTERED';
  let releases: (() => void)[] = [];

  return {
    init(context: PhoneModuleContext) {
      if (status !== 'REGISTERED') throw new Error(`Phone service module ${moduleId} cannot initialize from ${status}`);
      status = 'INITIALIZING';
      try {
        releases = Object.entries(services).map(([capability, service]) =>
          context.services.publish(moduleId, capability, service),
        );
        status = 'READY';
      } catch (error) {
        releases.reverse().forEach(release => release());
        releases = [];
        status = 'ERROR';
        throw error;
      }
    },
    dispose() {
      releases.reverse().forEach(release => release());
      releases = [];
      status = 'DISPOSED';
    },
    getStatus: () => status,
  };
}
