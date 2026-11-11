/**
 * services/resources/technicians.ts
 * ──────────────────────────────────
 * Technician API — reference example for wiring any resource to the
 * backend. Copy this pattern for a new resource:
 *
 *   1. `extends ApiService<T, TCreate>` for the base CRUD methods.
 *   2. Add only what plain CRUD doesn't cover (here: `invite`, an
 *      auth-namespaced action endpoint, not a create on this resource's own
 *      root path).
 *   3. Export a single instance — everything else imports that instance,
 *      never the class, so there's exactly one client per resource
 *      app-wide.
 *   4. Re-export it from `services/resources/index.ts` so it's reachable
 *      from the `@services` barrel alongside every other resource.
 *
 * ⚠️ Only `invite()` below is backed by a documented endpoint. The
 * inherited `.list()/.create()/.update()/.remove()` (→ bare `/technicians`)
 * come from extending `ApiService` but aren't in the API reference this was
 * built against — don't call them until a real `/technicians` CRUD surface
 * is confirmed with the backend.
 *
 * This file only defines *how* to call the backend. It intentionally does
 * NOT touch `useTechnicians` (the MMKV-backed local store in
 * `features/technicians/`) — wiring the hook to this service is a
 * separate, deliberate change since it affects loading/error state in
 * the UI.
 */
import { ApiService } from '../api/ApiService';
import type {
  InviteTechnicianRequest,
  InviteTechnicianResponse,
  NewTechnicianInput,
  Technician,
} from '../../features/technicians/types';

class TechnicianService extends ApiService<Technician, NewTechnicianInput> {
  /**
   * POST `/auth/invite` — creates the invite and returns `invite_id` plus
   * `sms_status` (`sent` | `failed` | `not_configured` | `refused_cap`). The
   * invite is saved even when the SMS is not sent: the caller reads
   * `smsStatus` to show whether the text went out. The backend does NOT echo
   * back name/phone/skills, so `useTechnicians.add` builds the local record
   * from what it already has plus these fields.
   *
   * ⚠️ This is under `/auth`, not `{this.path}` (`/technicians`) — an
   * auth-namespaced action endpoint per the API reference, not a resource
   * create at this service's own root path. Hence a literal path here
   * instead of `${this.path}/invite`.
   */
  async invite(input: InviteTechnicianRequest): Promise<InviteTechnicianResponse> {
    const res = await this.client.post<{ invite_id: string; sms_status?: string | null }>(
      '/auth/invite',
      input,
    );
    return { inviteId: res.data.invite_id, smsStatus: res.data.sms_status ?? null };
  }

  /**
   * POST `/auth/invite/:membershipUserId/resend-sms` — company admin only.
   * Returns the new `sms_status`. Errors reject with `ApiError`; the branch
   * is on `code` (the backend's `error_code`), never on `message`.
   */
  async resendInviteSms(membershipUserId: string): Promise<string | null> {
    const res = await this.client.post<{ sms_status?: string | null }>(
      `/auth/invite/${encodeURIComponent(membershipUserId)}/resend-sms`,
    );
    return res.data.sms_status ?? null;
  }
}

/** Singleton client for the `technicians` resource — import this, not the class. */
export const technicianService = new TechnicianService('technicians');
