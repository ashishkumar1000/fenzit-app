/**
 * useBusinessTypeOptions — the picker's options from `GET /business-types`,
 * with explicit loading, error and retry states. The list lives on the
 * backend, so the app never ships its own copy.
 */
import { useCallback, useEffect, useState } from 'react';
import { companyApi } from '../../services';
import type { BusinessType } from '../../services';

export type BusinessTypeOptionsState =
  | { status: 'loading'; options: [] }
  | { status: 'ready'; options: BusinessType[] }
  | { status: 'error'; options: [] };

export function useBusinessTypeOptions(): BusinessTypeOptionsState & { retry: () => void } {
  const [state, setState] = useState<BusinessTypeOptionsState>({ status: 'loading', options: [] });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading', options: [] });
    companyApi
      .listBusinessTypes(controller.signal)
      .then((options) => {
        if (!controller.signal.aborted) setState({ status: 'ready', options });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error', options: [] });
      });
    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}
