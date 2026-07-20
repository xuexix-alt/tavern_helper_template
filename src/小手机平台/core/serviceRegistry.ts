import type { PhoneServiceRegistry } from './types';

interface ServiceRegistration {
  ownerId: string;
  service: unknown;
}

export class InternalPhoneServiceRegistry implements PhoneServiceRegistry {
  private readonly registrations = new Map<string, ServiceRegistration>();

  publish(ownerId: string, capability: string, service: unknown): () => void {
    if (!ownerId.trim() || !capability.trim()) throw new Error('Phone service owner and capability are required');
    if (service === undefined) throw new Error(`Phone service ${capability} cannot be undefined`);
    if (this.registrations.has(capability))
      throw new Error(`Phone service capability is already provided: ${capability}`);

    const registration = { ownerId, service };
    this.registrations.set(capability, registration);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      if (this.registrations.get(capability) === registration) this.registrations.delete(capability);
    };
  }

  get<T = unknown>(capability: string): T | undefined {
    return this.registrations.get(capability)?.service as T | undefined;
  }

  require<T = unknown>(capability: string): T {
    const service = this.get<T>(capability);
    if (service === undefined) throw new Error(`Required phone service is unavailable: ${capability}`);
    return service;
  }
}
