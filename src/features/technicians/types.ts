/**
 * Technician domain types.
 *
 * `status` mirrors the Badge vocabulary used elsewhere: a freshly invited
 * technician is `offline` until they install the app and come online.
 */
export type TechnicianStatus = 'active' | 'offline';

export interface Technician {
  id: string;
  /**
   * Per-tenant human reference (`'EMP-004'`). Optional: a freshly invited
   * row is fabricated locally without one — the real value arrives on the
   * next roster hydration from `GET /users/me`. Render fail-hidden.
   */
  employeeCode?: string;
  name: string;
  /**
   * Dial code with `+`, e.g. `+91`. Optional because rows persisted before
   * hydration existed don't carry it — display still assumes the app-wide
   * `DIAL_CODE`; this field exists so a future multi-dial-code roster renders
   * correctly without another store migration.
   */
  countryCode?: string;
  /** Phone number used for the SMS invite. Stored as the user typed it. */
  phone: string;
  status: TechnicianStatus;
  /** ISO timestamp of when the invite was created. */
  invitedAt: string;
  /** Skill ids assigned at invite time (from `GET /skills`). */
  skillIds: string[];
  /**
   * Photo link from the last roster hydration (short-lived; the next profile
   * load refreshes it). Null or absent shows initials.
   */
  avatarUrl?: string | null;
  /**
   * What happened to the invite SMS, from the invite response. Set only on a
   * row created by this session's invite; roster rows never carry it.
   */
  smsStatus?: InviteSmsStatus | null;
}

/**
 * Outcome of the invite SMS, from `sms_status`. `refused_cap` means the
 * per-phone limit (5 an hour) stopped the text; the invite is kept.
 */
export type InviteSmsStatus = 'sent' | 'failed' | 'not_configured' | 'refused_cap';

/** Shape captured by the "Add employee" form. */
export interface NewTechnicianInput {
  name: string;
  /** Digits only, no dial code — see `DIAL_CODE` in this feature's constants. */
  phone: string;
  /** 1–20 skill ids, must belong to the owner's tenant (from `GET /skills`). */
  skillIds: string[];
}

/** Payload sent to `POST /auth/invite`. */
export interface InviteTechnicianRequest {
  /** Dial code with `+`, e.g. `+91`. */
  countryCode: string;
  /** 6–15 digits, no country code. */
  phoneNumber: string;
  name: string;
  /** 1–20 UUIDs, unique, must belong to the owner's tenant. */
  skillIds: string[];
}

/**
 * Response from `POST /auth/invite`: the invite id and the raw `sms_status`.
 * The raw value is not narrowed here; `parseInviteSmsStatus` (inviteSms.ts)
 * turns it into `InviteSmsStatus`, or `null` for a value the app does not know.
 * Optional because a backend that predates the field omits it.
 */
export interface InviteTechnicianResponse {
  inviteId: string;
  smsStatus?: string | null;
}
