import type { PhoneModuleRegistration, TavernPhonePublicApi } from './types';

export const PENDING_KEY = '__TAVERN_PHONE_PENDING_MODULES__';
export const RUNTIME_KEY = 'TavernPhone';

export interface PhoneTopWindow {
  TavernPhone?: TavernPhonePublicApi;
  __TAVERN_PHONE_PENDING_MODULES__?: PhoneModuleRegistration[];
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
