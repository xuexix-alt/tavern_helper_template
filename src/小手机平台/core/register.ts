import type { PhoneModuleRegistration, TavernPhonePublicApi } from './types';

export const PENDING_KEY = '__TAVERN_PHONE_PENDING_MODULES__';
export const RUNTIME_KEY = 'TavernPhone';
export const PHONE_RUNTIME_INSTALLED_EVENT = 'tavern-phone:runtime-installed';

export interface PhoneTopWindow {
  TavernPhone?: TavernPhonePublicApi;
  __TAVERN_PHONE_PENDING_MODULES__?: PhoneModuleRegistration[];
  dispatchEvent?: (event: Event) => boolean;
}

export function dispatchPhoneRuntimeInstalled(topWindow: PhoneTopWindow): void {
  if (typeof topWindow.dispatchEvent !== 'function') return;
  try {
    topWindow.dispatchEvent(new Event(PHONE_RUNTIME_INSTALLED_EVENT));
  } catch {
    // Runtime publication must remain usable when host event delivery is unavailable.
  }
}

export function getPhoneTopWindow(): PhoneTopWindow {
  try {
    if (typeof window === 'undefined' || !window.top) throw new Error('window.top is unavailable');
    void window.top.location.href;
    return window.top as unknown as PhoneTopWindow;
  } catch (error) {
    throw new Error('TavernPhone requires access to window.top; iframe-local fallback is forbidden', { cause: error });
  }
}

export function registerPhoneModule(registration: PhoneModuleRegistration): void {
  const topWindow = getPhoneTopWindow();
  if (topWindow.TavernPhone) {
    topWindow.TavernPhone.registerModule(registration);
    return;
  }

  const pending = topWindow.__TAVERN_PHONE_PENDING_MODULES__ ?? [];
  pending.push(registration);
  topWindow.__TAVERN_PHONE_PENDING_MODULES__ = pending;
}
