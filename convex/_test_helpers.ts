// Stub — real implementation in project root _test_helpers.ts.bak
// Uses import.meta.glob which is Vite-only and breaks Convex deploy.
// Tests run via Vitest which uses the .bak file directly.

/* eslint-disable @typescript-eslint/no-explicit-any */

export function createTestCtx(): any {
  throw new Error("Not available in Convex runtime");
}

export async function seedTestUser(_t: any): Promise<any> {
  throw new Error("Not available in Convex runtime");
}

export async function seedSecondUser(_t: any, _orgId: any): Promise<any> {
  throw new Error("Not available in Convex runtime");
}

export async function seedGabinetPrereqs(_t: any, _orgId: any, _userId: any): Promise<any> {
  throw new Error("Not available in Convex runtime");
}
