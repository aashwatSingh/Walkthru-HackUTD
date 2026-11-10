// THE contract (spec Section 6). Every screen imports from here and never from supabase directly.
// No VITE_SUPABASE_URL → mock mode (localStorage); otherwise live Supabase. Same signatures, same rules.
// Every function returns data or throws an Error with a human-readable message (show it in a toast).
import { isMock } from './supabaseClient.js';
import * as mock from './mockDb.js';
import * as live from './supabaseDb.js';

const impl = isMock ? mock : live;

export const isMockMode = isMock;

export const restoreSession = (...a) => impl.restoreSession(...a);
export const signIn = (...a) => impl.signIn(...a);
export const signOut = (...a) => impl.signOut(...a);
export const resetDemo = (...a) => impl.resetDemo(...a);

// Second factor after the password: { kind: 'none' | 'demo' | 'totp' | 'enroll' }.
export const getSecondFactor = (...a) => impl.getSecondFactor(...a);
export const startTotpEnrollment = (...a) => impl.startTotpEnrollment(...a);
export const verifySecondFactor = (...a) => impl.verifySecondFactor(...a);
export const skipSecondFactor = (...a) => impl.skipSecondFactor(...a);

export const getMyUnits = (...a) => impl.getMyUnits(...a);
export const getUnitByCode = (...a) => impl.getUnitByCode(...a);
export const getInspectionItems = (...a) => impl.getInspectionItems(...a);
// Admin dashboard, aggregated and paged in the database:
export const getDashboardSummary = (...a) => impl.getDashboardSummary(...a); // totals, chart data, filter options
export const getDashboardPage = (...a) => impl.getDashboardPage(...a);       // ({ filters, search, sort, page, pageSize }) → { rows, total }
export const getUnitsPage = (...a) => impl.getUnitsPage(...a);               // ({ search, page, pageSize }) → { units, total }
export const getSetupChecks = (...a) => impl.getSetupChecks(...a);           // → { checks: [{ level, text }], storage }
export const getAuditHead = (...a) => impl.getAuditHead(...a);               // (unitId) → { ok, entries, head } | null

export const uploadStudentMedia = (...a) => impl.uploadStudentMedia(...a);
// (itemId, phase, path): the server fingerprints the uploaded file and puts it on the item. uploadStudentMedia calls it.
export const registerEvidence = (...a) => impl.registerEvidence(...a);
export const removeStudentMedia = (...a) => impl.removeStudentMedia(...a);
export const updateNotes = (...a) => impl.updateNotes(...a);
export const lockInspection = (...a) => impl.lockInspection(...a);
export const submitDispute = (...a) => impl.submitDispute(...a);

export const openMoveOut = (...a) => impl.openMoveOut(...a);
export const updateAdminAssessment = (...a) => impl.updateAdminAssessment(...a);
export const createUnit = (...a) => impl.createUnit(...a);

export const getMediaUrl = (...a) => impl.getMediaUrl(...a);
export const verifyMedia = (...a) => impl.verifyMedia(...a);

export const runPhotoCheck = (...a) => impl.runPhotoCheck(...a);
export const runAiReview = (...a) => impl.runAiReview(...a);
export const getAiReviews = (...a) => impl.getAiReviews(...a);
export const getLatestUnitReport = (...a) => impl.getLatestUnitReport(...a);

// Demo helpers: the switcher and quick-login buttons work in mock mode, or live when VITE_DEMO_PASSWORD is set.
export const DEMO_PASSWORD = isMock ? 'demo1234' : import.meta.env.VITE_DEMO_PASSWORD || '';
export const demoEnabled = isMock || !!import.meta.env.VITE_DEMO_PASSWORD;
// The housing admin never uses the bundled demo password on real Supabase: it has its own password that is not
// in the website's code, typed at login (then the 2FA code). Students stay one-click for judges. In mock mode
// there is nothing to protect, so Admin stays one-click (VITE_ADMIN_NEEDS_PASSWORD=true forces the prompt, for tests).
export const ADMIN_NEEDS_PASSWORD = !isMock || import.meta.env.VITE_ADMIN_NEEDS_PASSWORD === 'true';
export const DEMO_USERS = [
  { key: 'admin', label: 'Admin', note: ADMIN_NEEDS_PASSWORD ? 'password required' : 'desktop dashboard', email: 'housing.admin@university.edu', unit: null, needsPassword: ADMIN_NEEDS_PASSWORD },
  { key: 'alex', label: 'Alex', note: 'completed + dispute', email: 'alex.rivera@university.edu', unit: 'FH-304B' },
  { key: 'jordan', label: 'Jordan', note: 'live move-in', email: 'jordan.lee@university.edu', unit: 'FH-210A' },
  { key: 'sam', label: 'Sam', note: 'live move-out', email: 'sam.patel@university.edu', unit: 'BB-112' },
];
