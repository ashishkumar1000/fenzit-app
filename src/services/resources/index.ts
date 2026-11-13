/**
 * services/resources/index.ts
 * ────────────────────────────
 * Every resource's API service, in one place. When you add a new resource:
 *
 *   1. Create `services/resources/<resource>.ts` (copy `technicians.ts` as
 *      a template).
 *   2. Add one line here: `export { fooService } from './foo';`
 *
 * Features never import a resource file directly — they go through the
 * top-level `@services` barrel, which re-exports everything from here.
 */
export { attachmentService } from './attachments';
export type {
  AttachmentPresignBody,
  ConfirmResponse,
  PresignResponse,
} from './attachments';
export { technicianService } from './technicians';
export { placesService } from './places';
export type { PlaceSuggestion, ResolvedPlace, ReverseGeocodedAddress } from './places';
export { officesService } from './offices';
export type {
  CreateOfficeRequest,
  Office,
  OfficeArchiveBlocker,
  OfficeDetail,
  OfficeRule,
  PickedOfficeLocation,
  UpdateOfficeRequest,
} from './offices';
export { weeklyOffsService } from './weeklyOffs';
export type {
  IsoWeekday,
  SetWeeklyOffRequest,
  WeeklyOffDefaultResponse,
  WeeklyOffOverrideResponse,
  WeeklyOffView,
} from './weeklyOffs';
export { holidaysService } from './holidays';
export type {
  CreateHolidayRequest,
  Holiday,
  HolidayImpactResponse,
  UpdateHolidayRequest,
} from './holidays';
export { attendanceSetupService } from './attendanceSetup';
export type { SetupState, SetupStep } from './attendanceSetup';
export { attendanceMeService } from './attendanceMe';
export type {
  AttendanceAccess,
  AttendanceAccessState,
  AttendanceSummary,
} from './attendanceMe';
export { attendanceCheckInService } from './attendanceCheckIn';
export type {
  CheckInResponse,
  CheckOutResponse,
  DayContextFlags,
} from './attendanceCheckIn';
export { enrolmentsService } from './enrolments';
export type { EnrolmentOverview, EnrolmentWriteState } from './enrolments';
export { attendanceLeaveService } from './attendanceLeave';
export type {
  ApplyLeaveBody,
  LeavePart,
  LeavePreview,
  LeavePreviewErrorCode,
  LeaveRequestView,
} from './attendanceLeave';
export { fetchDayStatuses, fetchMyDayStatuses, monthRange } from './attendanceDayStatus';
export type {
  AttendanceSource,
  CorrectionValue,
  DayMarker,
  DayStatusKey,
  DayStatusRow,
  DayStatusesResponse,
  LatestCorrectionView,
  MeDayStatusesResponse,
} from './attendanceDayStatus';
export { fetchCorrections, formatCorrectionValue } from './attendanceCorrections';
export type {
  CorrectionEntry,
  CorrectionsQuery,
} from './attendanceCorrections';
export { fetchDashboard } from './attendanceDashboard';
export type {
  AttendanceDashboardCounts,
  AttendanceDashboardData,
  DashboardEmployeeStat,
  DashboardEmployeeStatus,
  CheckoutMissingRow,
  DashboardOfficeStat,
  FakeLocationRow,
} from './attendanceDashboard';
export { fetchMonthly, fetchMyMonthly, normalizeSummary } from './attendanceMonthly';
export type {
  AttendanceMonthlyData,
  EmployeeMonthlyRow,
  MeMonthlyData,
  MonthlyEmployeeSummary,
} from './attendanceMonthly';
export { customerService } from './customers';
export type {
  ApiCustomer,
  CreateCustomerRequest,
  CreatedCustomer,
  CustomerDetail,
  JobHistoryItem,
  UpdateCustomerRequest,
} from './customers';
export { jobService } from './jobs';
export type {
  ActivityLogEntry,
  ApiJob,
  CreateJobRequest,
  JobAttachment,
  JobDetail,
  JobDetailCustomer,
  JobDetailTechnician,
  JobPriority,
  JobScope,
  JobServiceType,
  NewCustomerPayload,
  JobStatusApi,
  ListJobsQuery,
  PendingDecision,
  UpdateJobEditFields,
  UpdateJobRequest,
  WorkflowTemplate,
  WorkflowTemplateStep,
} from './jobs';
export { skillService } from './skills';
export type { Skill, NewSkillInput } from './skills';
export { notificationService } from './notifications';
export type { ApiNotification, ListNotificationsQuery } from './notifications';
export { reportService, TECHNICIAN_JOB_ACTIVITY_TYPE } from './reports';
export type {
  CreateReportRequest,
  CreateReportResponse,
  ReportListItem,
  ReportRequestStatus,
  ReportStatusResponse,
} from './reports';
export { approvalQueueService } from './approvalQueue';
export type { ApprovalQueueItem } from './approvalQueue';
export { membersService } from './members';
export type {
  CompanyMember,
  MemberJobSettings,
  MemberJobSettingsResponse,
  MemberRole,
} from './members';
export { jobReportService } from './jobReports';
export type {
  EmployeeReportOutcomes,
  EmployeeReportRejection,
  EmployeeReportResponse,
  OwnerReportHeadline,
  OwnerReportSummary,
} from './jobReports';
export { deviceTokenService } from './deviceTokens';
export type { DeviceTokenPlatform, RegisterDeviceTokenBody } from './deviceTokens';
export { authApi } from './authApi';
export { accountDeletionApi } from './accountDeletion';
export type { RequestAccountDeletionResponse } from './accountDeletion';
export { usersApi } from './users';
export type { AvatarUploadTicket } from './users';
export { companyApi } from './company';
export type { BusinessType, CompanyDetails, UpdateCompanyBody } from './company';
export type {
  MyProfile,
  ProfileTenant,
  ProfileTechnician,
  ProfileTechnicianSummary,
  ProfileCustomerSummary,
  ProfileJob,
  JobCounts,
  UserStatus,
} from './users';
export type {
  SendOtpRequest,
  SendOtpResponse,
  VerifyOtpRequest,
  VerifyOtpResponse,
  VerifiedUser,
  UserRole,
  LoginRole,
  SetupCompanyRequest,
  SetupCompanyResponse,
  Tenant,
} from './authApi';

