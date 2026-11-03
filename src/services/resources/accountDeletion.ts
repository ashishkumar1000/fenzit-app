/**
 * services/resources/accountDeletion.ts
 * ───────────────────────────────
 * Account deletion — file the signed-in person's deletion request.
 *
 * An action endpoint, not CRUD (same shape as `authApi`): one function on
 * the shared `apiClient`. The JWT is the identity proof, so there is no OTP
 * round-trip in-app — the public web flow keeps its code check. Nothing
 * deletes here: the request lands in the platform-admin queue for review
 * (the same `account_deletion_requests` row the website files).
 *
 * Rejects with `ApiError` on failure (via apiClient's response interceptor).
 */
import { apiClient } from '../api/apiClient';

export interface RequestAccountDeletionResponse {
  /** Human confirmation — the same review message the web flow returns. */
  message: string;
}

/** `POST /account-deletion/requests/me` — requires the sign-in token. */
async function requestAccountDeletion(): Promise<RequestAccountDeletionResponse> {
  const res = await apiClient.post<RequestAccountDeletionResponse>(
    '/account-deletion/requests/me',
  );
  return res.data;
}

export const accountDeletionApi = { requestAccountDeletion };
