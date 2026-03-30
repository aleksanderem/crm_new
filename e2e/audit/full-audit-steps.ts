/**
 * Full Interactive UI Audit Steps
 * 
 * Generated: 2026-03-30
 * App: http://localhost:5173
 * User: amiesak@gmail.com / ABcdefg123!@#
 * 
 * Each entry: { page, action, selector/target, expected, actual, status }
 * Status: PASS | FAIL | NO_REACTION | PARTIAL | CRASH
 */

export interface AuditStep {
  page: string;
  action: string;
  target: string;
  expected: string;
  actual: string;
  status: 'PASS' | 'FAIL' | 'NO_REACTION' | 'PARTIAL' | 'CRASH';
  severity?: 'P0' | 'P1' | 'P2' | 'P3';
}

export const auditResults: AuditStep[] = [];
