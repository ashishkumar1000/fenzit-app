# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

## Users

Field employees (user-facing copy: "Employee") of small Indian service businesses, working from mid-range Android phones on job sites where indoor GPS is unreliable; and the business owner, who also runs the team day to day from the app.

## Product Purpose

Fenzit is attendance + job management for small field-workforce businesses. This app is the field half: location-verified check-in/out, the guided job flow (photos, signature, step advances), leave requests, and today-focused screens. Success: an employee marks attendance and completes a job unaided, even indoors, and the owner trusts the record.

## Operating Context

- Android-first; indoor/poor-GPS conditions are the norm, not the exception — capture flows degrade gracefully (indoor-first two-attempt geolocation, no hard failures).
- User-facing copy says **"Employee"**, never "Technician" (workspace terminology rule; the DB role value stays `technician`).
- Indian English; no Hindi words in copy. Hindi localization explicitly deferred by the owner (2026-10-03) — do not plan or start it.
- Three-repo product with `fenzit-web` (owner web console) and `fenzit-be` (backend); backend deploys first on shared changes.

## Capabilities and Constraints

- Confirmed: SMS-OTP login, punch in/out with geofence + rate limiting, job flow with photo/signature/location steps, leave apply/list, reports viewing, forced-update gate, server-driven config.
- React Native; design-system tokens and atomic components are mandatory; tests run via `bun run test` (bare `bun test` breaks on RN Flow types); bun only.
- Release APKs are built by the owner — ask before building.

## Brand Commitments

- Name: Fenzit.

## Evidence on Hand

No store listing copy or screenshots are tracked in-repo; do not fabricate store claims.

## Product Principles

1. One honest record — what the screen shows must match what the backend stored; no optimistic lies.
2. Indoor-first — every location-dependent flow assumes the fix may be weak, stale, or refused.
3. Copy is a feature — every screen ships in owner-approved plain English.
