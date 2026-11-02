export const APP_UPDATE_STATE_EVENT = 'hounigo_app_update_state';

let updateAvailable = false;

export function isAppUpdateAvailable(): boolean {
  return updateAvailable;
}

export function setAppUpdateAvailable(available: boolean): void {
  updateAvailable = available;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(APP_UPDATE_STATE_EVENT, { detail: { available } }));
  }
}
