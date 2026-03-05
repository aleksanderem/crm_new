# PRD: Seat Limits Enforcement

Enforce subscription seat limits when inviting team members.

---

## Context

Organizations have a `seatLimit` from their subscription plan (default 5 for free tier, higher for paid plans). Currently `inviteMember` mutation does not check this limit, allowing unlimited team members.

**Goal:** Prevent new member invitations when seat limit reached.

---

## 1. Backend — Seat Limit Check

### 1.1 Helper Function

**File:** `convex/_helpers/seatLimits.ts` (new file)

```typescript
import { QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

export async function checkSeatLimit(
  ctx: QueryCtx,
  args: {
    organizationId: Id<"organizations">;
  }
): Promise<{
  currentSeats: number;
  seatLimit: number;
  canAddMore: boolean;
}> {
  // Count current team members
  const members = await ctx.db
    .query("teamMemberships")
    .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
    .collect();

  const currentSeats = members.length;

  // Get subscription seat limit
  const org = await ctx.db.get(args.organizationId);
  if (!org) throw new Error("Organization not found");

  // Find active subscription for org owner
  const subscription = await ctx.db
    .query("subscriptions")
    .withIndex("userId", (q) => q.eq("userId", org.ownerId))
    .filter((q) =>
      q.or(
        q.eq(q.field("status"), "active"),
        q.eq(q.field("status"), "trialing")
      )
    )
    .first();

  let seatLimit = 5; // Default free tier
  if (subscription) {
    const plan = await ctx.db.get(subscription.planId);
    if (plan) seatLimit = plan.seatLimit;
  }

  return {
    currentSeats,
    seatLimit,
    canAddMore: currentSeats < seatLimit,
  };
}
```

- [x] Create `convex/_helpers/seatLimits.ts`
- [x] Implement `checkSeatLimit` helper
- [x] Add unit tests for helper

### 1.2 Modify inviteMember Mutation

**File:** `convex/organizations.ts`

Add seat limit check before creating membership:

```typescript
export const inviteMember = mutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    role: orgRoleValidator,
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.organizationId);

    // Check seat limit
    const { canAddMore, currentSeats, seatLimit } = await checkSeatLimit(ctx, {
      organizationId: args.organizationId,
    });

    if (!canAddMore) {
      throw new Error(
        `Seat limit reached (${currentSeats}/${seatLimit}). Upgrade your plan to add more team members.`
      );
    }

    // Existing logic...
  },
});
```

- [x] Import `checkSeatLimit` in organizations.ts
- [x] Add seat limit check before membership creation
- [x] Throw descriptive error when limit reached
- [x] Test error message includes current/limit counts

---

## 2. Frontend — UI Integration

### 2.1 Team Members Page

**File:** `src/routes/_app/_auth/dashboard/_layout.settings.team.tsx` (or similar)

Requirements:
- Display seat usage: "5 of 10 seats used"
- Progress bar or visual indicator
- Warning when approaching limit (80%+)
- Disable "Invite Member" button when limit reached
- Show upgrade CTA when limit reached

- [x] Add seat usage display to team page
- [x] Add visual indicator (progress bar or count)
- [x] Add warning state at 80% capacity
- [x] Disable invite button when at limit
- [x] Add upgrade link/button when limit reached

### 2.2 Invite Dialog

**File:** Invite member SidePanel or dialog

Requirements:
- Show remaining seats count
- Disable submit when limit reached
- Show upgrade message when limit reached

- [x] Add remaining seats count to invite dialog
- [x] Disable submit button when at limit
- [x] Show upgrade message with link to billing

### 2.3 Seat Limit Query

**File:** `convex/organizations.ts` or `convex/productSubscriptions.ts`

Add query for frontend:

```typescript
export const getSeatUsage = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await checkSeatLimit(ctx, args);
  },
});
```

- [x] Add `getSeatUsage` query
- [x] Return currentSeats, seatLimit, canAddMore
- [x] Use in frontend components

---

## 3. Error Handling

### 3.1 User-Facing Messages

When seat limit reached, show:
- Clear message: "You've reached your team member limit (5/5)"
- Action: "Upgrade to add more members"
- Link to billing/subscription settings

- [x] Add i18n keys for seat limit errors
- [x] Add EN translations
- [x] Add PL translations
- [x] Ensure error toast shows upgrade link

### 3.2 Graceful Degradation

If subscription lookup fails:
- Log error
- Allow invitation (fail open, not closed)
- Show warning banner about billing issue

- [x] Add error handling for subscription lookup
- [x] Fail open if subscription data unavailable
- [x] Log warnings for billing issues

---

## 4. Edge Cases

### 4.1 Owner Counting

- [x] Verify owner is counted in seat usage
- [x] Verify owner can't remove themselves if only member

### 4.2 Pending Invitations

Decision: Do pending invitations count toward seat limit?

**Option A:** Count only active members (current implementation)
**Option B:** Count active + pending invitations

Recommendation: Option A (simpler, matches expected behavior)

- [x] Document decision in code comments
- [x] Verify only active memberships counted

### 4.3 Role Changes

- [x] Verify role changes don't trigger seat limit check
- [x] Verify member removal frees up seat immediately

### 4.4 Multiple Organizations

- [x] Verify seat limits are per-organization
- [x] User can be in multiple orgs without affecting individual org limits

---

## 5. Testing

### 5.1 Unit Tests

**File:** `convex/tests/seatLimits.test.ts`

- [x] Test `checkSeatLimit` with various member counts
- [x] Test with active subscription
- [x] Test with trialing subscription
- [x] Test with no subscription (free tier)
- [x] Test edge case: 0 members, 1 member, at limit, over limit

### 5.2 Integration Tests

- [x] Test `inviteMember` succeeds when under limit
- [x] Test `inviteMember` fails when at limit
- [x] Test error message content
- [x] Test member removal frees seat

### 5.3 E2E Tests

- [x] Test invite flow with seat limit
- [x] Test UI shows seat usage correctly
- [x] Test upgrade CTA appears when limit reached

---

## 6. Documentation

### 6.1 User Documentation

- [x] Document seat limits in help/docs
- [x] Explain free tier vs paid tier limits
- [x] Document how to upgrade

### 6.2 Developer Documentation

- [x] Add JSDoc to `checkSeatLimit` helper
- [x] Document seat limit flow in CLAUDE.md or README
- [x] Document fail-open behavior

---

## 7. Implementation Order

**Phase 1: Backend (Required)**
1. Create `checkSeatLimit` helper
2. Modify `inviteMember` to check limit
3. Add `getSeatUsage` query
4. Add unit tests

**Phase 2: Frontend (Important)**
1. Display seat usage on team page
2. Disable invite button at limit
3. Add upgrade CTA

**Phase 3: Polish (Nice to have)**
1. Progress bar visualization
2. Warning states at 80%
3. Detailed error messages

---

## Notes

**Current State:**
- Schema: `seatLimit` field exists in plans table ✅
- Subscriptions: `productSubscriptions.ts` has `getSubscription` ✅
- Invite: `organizations.ts` has `inviteMember` but no check ❌

**Estimated Effort:**
- Backend: ~2 hours
- Frontend: ~3 hours
- Testing: ~1 hour
- Total: ~6 hours

**Dependencies:**
- None (subscription system already in place)

**Success Criteria:**
- Cannot invite member when at seat limit
- Clear user-facing error message
- UI shows seat usage
- Upgrade path available
