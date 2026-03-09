export type DevRole = 'admin' | 'technician' | 'readonly';

const ROLE_KEY = 'dev-user-role';
const USER_KEY = 'dev-user-id';

export const DEFAULT_DEV_ROLE: DevRole = 'technician';
export const DEFAULT_DEV_USER_ID = 'dev-user';

export function getDevRole(): DevRole {
  if (typeof window === 'undefined') return DEFAULT_DEV_ROLE;
  const value = window.localStorage.getItem(ROLE_KEY);
  if (value === 'admin' || value === 'technician' || value === 'readonly') return value;
  return DEFAULT_DEV_ROLE;
}

export function setDevRole(role: DevRole) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ROLE_KEY, role);
}

export function getDevUserId() {
  if (typeof window === 'undefined') return DEFAULT_DEV_USER_ID;
  return window.localStorage.getItem(USER_KEY)?.trim() || DEFAULT_DEV_USER_ID;
}
