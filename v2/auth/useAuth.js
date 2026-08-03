/**
 * React binding for authSessionStore (T-AUTH-01).
 */

import { useEffect, useSyncExternalStore } from 'react';
import {
  getAuthState,
  startAuthController,
  subscribeAuth,
} from './authSessionStore.js';

const serverSnapshot = Object.freeze({
  status: 'loading',
  session: null,
  user: null,
  profile: null,
  profileStatus: 'idle',
  errorMessage: null,
  configured: false,
  signedIn: false,
  authActionBusy: false,
  cloudSyncStatus: 'not_implemented',
});

/**
 * Subscribe to auth state. Starts the controller once on mount.
 */
export function useAuth() {
  useEffect(() => {
    void startAuthController();
  }, []);

  return useSyncExternalStore(subscribeAuth, getAuthState, () => serverSnapshot);
}
