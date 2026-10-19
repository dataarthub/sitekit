import { consentContent } from './consent-content.js';
/** Persisted visitor choice granting or denying optional analytics; effective browser consent can also be unknown before a choice or after expiry. */
export type AnalyticsConsent = 'analytics' | 'denied';
export function parseConsentChoice(value: unknown): { value: AnalyticsConsent; expires: number } | null {
  if (!value || typeof value !== 'object') return null;
  const choice = value as Record<string, unknown>;
  return (choice.value === 'analytics' || choice.value === 'denied') && typeof choice.expires === 'number' && Number.isFinite(choice.expires)
    ? { value: choice.value, expires: choice.expires } : null;
}
/** Non-modal banner: browsing remains available, including when analytics is declined. */
export function showConsentPanel(options: { locale?: string; privacyPolicyUrl?: string; blocked: boolean; preferences: boolean; choose: (value: AnalyticsConsent) => void; closed: () => void }): HTMLElement {
  const copy = consentContent[(options.locale ?? document.documentElement.lang).toLowerCase().startsWith('en') ? 'en' : 'ja'];
  const previous = document.activeElement;
  const panel = document.createElement('section'); panel.className = 'eaos-consent';
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', copy.title); panel.tabIndex = -1;
  const heading = document.createElement('h2'); heading.textContent = copy.title; panel.append(heading);
  for (const text of [copy.description, copy.necessary, ...(options.blocked ? [copy.blocked] : [])]) { const p = document.createElement('p'); p.textContent = text; panel.append(p); }
  if (options.privacyPolicyUrl) {
    const url = new URL(options.privacyPolicyUrl, location.href);
    if (url.protocol === 'https:' || url.protocol === 'http:') { const link = document.createElement('a'); link.href = url.href; link.textContent = copy.policy; panel.append(link); }
  }
  const close = () => { panel.remove(); options.closed(); if (options.preferences && previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  const actions = document.createElement('div'); actions.className = 'eaos-consent-actions';
  for (const [label, value] of [[copy.deny, 'denied'], [copy.allow, 'analytics']] as const) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.dataset.consent = value;
    button.disabled = options.blocked && value === 'analytics'; button.onclick = () => { options.choose(value); close(); }; actions.append(button);
  }
  if (options.preferences) { const button = document.createElement('button'); button.type = 'button'; button.textContent = copy.close; button.onclick = close; actions.append(button); panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); close(); } }); }
  panel.append(actions); document.body.append(panel); if (options.preferences) panel.focus(); return panel;
}
