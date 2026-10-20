/**
 * useLogOut — the same forced-logout flow as a 401 expiry (story 5.3): the
 * reset registry wipes every store, the token is cleared, and the session is
 * reset so the gate sends the person back to login. The registry owns the
 * store list — a hand-rolled copy would drift the first time a new store
 * registers.
 */
import { useCallback } from 'react';
import { runAllResets } from '../../services';
import { clearAuthToken } from '../../services/authToken';
import { useAuth } from './useAuth';

export function useLogOut(): () => void {
  const { reset } = useAuth();
  return useCallback(() => {
    clearAuthToken();
    runAllResets();
    reset();
  }, [reset]);
}
