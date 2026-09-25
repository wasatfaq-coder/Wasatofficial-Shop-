import { AdminCredentials } from '../types';

const ADMIN_STORAGE_KEY = 'manstyle_admin_credentials';
const ADMIN_EVENT_KEY = 'manstyle_admin_credentials_changed';

const DEFAULT_ADMIN_CREDENTIALS: AdminCredentials = {
  username: 'Admin',
  password: '12345678',
  updatedAt: '2026-09-20T00:00:00.000Z',
  lastChangedBy: 'Система (по умолчанию)',
};

/**
 * Retrieves current admin credentials from localStorage or returns default.
 */
export function getAdminCredentials(): AdminCredentials {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_ADMIN_CREDENTIALS };
  }

  try {
    const raw = localStorage.getItem(ADMIN_STORAGE_KEY);
    if (!raw) {
      // First time initialization
      localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(DEFAULT_ADMIN_CREDENTIALS));
      return { ...DEFAULT_ADMIN_CREDENTIALS };
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.username === 'string' && typeof parsed.password === 'string') {
      return {
        username: parsed.username,
        password: parsed.password,
        updatedAt: parsed.updatedAt || new Date().toISOString(),
        lastChangedBy: parsed.lastChangedBy || 'Администратор',
      };
    }
    return { ...DEFAULT_ADMIN_CREDENTIALS };
  } catch (err) {
    console.error('Error reading admin credentials from storage:', err);
    return { ...DEFAULT_ADMIN_CREDENTIALS };
  }
}

/**
 * Saves updated credentials and dispatches a broadcast event across components and tabs.
 */
function saveAdminCredentials(creds: AdminCredentials): void {
  if (typeof window === 'undefined') return;

  try {
    const payload: AdminCredentials = {
      username: creds.username.trim(),
      password: creds.password,
      updatedAt: creds.updatedAt || new Date().toISOString(),
      lastChangedBy: creds.lastChangedBy || creds.username.trim(),
    };

    localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(payload));

    // Dispatch custom DOM event for current window
    window.dispatchEvent(
      new CustomEvent(ADMIN_EVENT_KEY, {
        detail: payload,
      })
    );
  } catch (err) {
    console.error('Error saving admin credentials to storage:', err);
  }
}

/**
 * Validates login attempt against current credentials.
 * Username comparison is case-insensitive, password is exact.
 */
export function validateAdminLogin(inputUsername: string, inputPassword: string): boolean {
  const current = getAdminCredentials();
  const isUserValid = inputUsername.trim().toLowerCase() === current.username.trim().toLowerCase();
  const isPassValid = inputPassword === current.password;
  return isUserValid && isPassValid;
}

/**
 * Updates credentials after verifying current password.
 */
export function updateAdminCredentials(
  currentPassword: string,
  newUsername: string,
  newPassword: string
): { success: boolean; error?: string; credentials?: AdminCredentials } {
  const current = getAdminCredentials();

  // Verify current password
  if (currentPassword !== current.password) {
    return {
      success: false,
      error: 'Текущий пароль указан неверно. Пожалуйста, проверьте ввод.',
    };
  }

  const cleanUser = newUsername.trim();
  if (!cleanUser || cleanUser.length < 3) {
    return {
      success: false,
      error: 'Новый логин должен содержать не менее 3 символов.',
    };
  }

  if (!newPassword || newPassword.length < 6) {
    return {
      success: false,
      error: 'Новый пароль должен быть не короче 6 символов.',
    };
  }

  const updated: AdminCredentials = {
    username: cleanUser,
    password: newPassword,
    updatedAt: new Date().toISOString(),
    lastChangedBy: cleanUser,
  };

  saveAdminCredentials(updated);

  return {
    success: true,
    credentials: updated,
  };
}

/**
 * Resets admin credentials to default values.
 */
export function resetAdminCredentials(): AdminCredentials {
  const defaultReset: AdminCredentials = {
    ...DEFAULT_ADMIN_CREDENTIALS,
    updatedAt: new Date().toISOString(),
    lastChangedBy: 'Сброс к заводским настройкам',
  };
  saveAdminCredentials(defaultReset);
  return defaultReset;
}

/**
 * Helper to subscribe to credentials updates across the application.
 */
export function subscribeToCredentialsChanges(callback: (creds: AdminCredentials) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleCustomEvent = (e: Event) => {
    const customEvent = e as CustomEvent<AdminCredentials>;
    if (customEvent.detail) {
      callback(customEvent.detail);
    } else {
      callback(getAdminCredentials());
    }
  };

  const handleStorageEvent = (e: StorageEvent) => {
    if (e.key === ADMIN_STORAGE_KEY) {
      callback(getAdminCredentials());
    }
  };

  window.addEventListener(ADMIN_EVENT_KEY, handleCustomEvent);
  window.addEventListener('storage', handleStorageEvent);

  return () => {
    window.removeEventListener(ADMIN_EVENT_KEY, handleCustomEvent);
    window.removeEventListener('storage', handleStorageEvent);
  };
}
