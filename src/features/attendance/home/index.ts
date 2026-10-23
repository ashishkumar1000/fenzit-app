/**
 * features/attendance/home — the owner's attendance surfaces.
 *
 * AttendanceHomeScreen is the setup-only hub behind the Account tab's
 * Attendance row (the 15-6 shim, gated by the 15-8 wizard). AttendanceTabHomeScreen
 * is the Attendance TAB page (2026-10 footer restructure): the "Every day"
 * tiles + the setup banner. The basenames deliberately differ —
 * `AttendanceTabScreen.tsx` is the technician's tab screen in
 * features/attendance/me/.
 */
export { default as AttendanceHomeScreen } from './AttendanceHomeScreen';
export { default as AttendanceTabHomeScreen } from './AttendanceTabHomeScreen';
