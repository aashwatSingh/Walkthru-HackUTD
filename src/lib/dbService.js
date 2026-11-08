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

export const getMyUnits = (...a) => impl.getMyUnits(...a);
export const getUnitByCode = (...a) => impl.getUnitByCode(...a);
export const getInspectionItems = (...a) => impl.getInspectionItems(...a);
export const getDashboardRows = (...a) => impl.getDashboardRows(...a);

export const uploadStudentMedia = (...a) => impl.uploadStudentMedia(...a);
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
export const DEMO_USERS = [
  { key: 'admin', label: 'Admin', note: 'desktop dashboard', email: 'housing.admin@university.edu', unit: null },
  { key: 'alex', label: 'Alex', note: 'completed + dispute', email: 'alex.rivera@university.edu', unit: 'FH-304B' },
  { key: 'jordan', label: 'Jordan', note: 'live move-in', email: 'jordan.lee@university.edu', unit: 'FH-210A' },
  { key: 'sam', label: 'Sam', note: 'live move-out', email: 'sam.patel@university.edu', unit: 'BB-112' },
];
