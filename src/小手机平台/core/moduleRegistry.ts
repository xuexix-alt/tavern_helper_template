import type { PhoneModule, PhoneModuleContext, PhoneModuleRegistration } from './types';

export class ModuleRegistry {
  private readonly registrations = new Map<string, PhoneModuleRegistration>();
  private readonly instances = new Map<string, PhoneModule>();
  private initializedOrder: string[] = [];

  register(registration: PhoneModuleRegistration): void {
    const { id, version } = registration.manifest;
    if (!id.trim() || !version.trim()) throw new Error('Phone module id and version are required');

    const existing = this.registrations.get(id);
    if (existing?.manifest.version === version) return;
    if (existing) {
      throw new Error(
        `Phone module ${id} version ${existing.manifest.version} is already registered; hot replace is unsupported`,
      );
    }
    this.registrations.set(id, registration);
  }

  list(): PhoneModuleRegistration[] {
    return [...this.registrations.values()];
  }

  assertRequired(requiredIds: readonly string[]): void {
    const missing = requiredIds.filter(id => !this.registrations.has(id));
    if (missing.length > 0) throw new Error(`Missing required phone modules: ${missing.join(', ')}`);
  }

  resolveOrder(): string[] {
    const resolved: string[] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const visit = (id: string): void => {
      if (visited.has(id)) return;
      if (visiting.has(id)) throw new Error(`Phone module dependency cycle detected at ${id}`);

      const registration = this.registrations.get(id);
      if (!registration) throw new Error(`Missing phone module dependency: ${id}`);
      visiting.add(id);
      registration.manifest.dependsOn.forEach(dependencyId => visit(dependencyId));
      visiting.delete(id);
      visited.add(id);
      resolved.push(id);
    };

    this.registrations.forEach((_registration, id) => visit(id));
    return resolved;
  }

  async initialize(context: PhoneModuleContext, requiredIds: readonly string[] = []): Promise<void> {
    if (this.initializedOrder.length > 0) throw new Error('Phone modules are already initialized');
    this.assertRequired(requiredIds);

    for (const id of this.resolveOrder()) {
      const registration = this.registrations.get(id)!;
      const instance = registration.factory();
      await instance.init(context);
      this.instances.set(id, instance);
      this.initializedOrder.push(id);
    }
  }

  async dispose(reason: string): Promise<void> {
    const errors: unknown[] = [];
    for (const id of [...this.initializedOrder].reverse()) {
      try {
        await this.instances.get(id)?.dispose(reason);
      } catch (error) {
        errors.push(error);
      }
    }
    this.instances.clear();
    this.initializedOrder = [];
    if (errors.length > 0) throw new AggregateError(errors, 'Failed to dispose one or more phone modules');
  }
}
