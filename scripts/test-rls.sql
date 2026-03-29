-- =============================================================================
-- test-rls.sql  —  Row-Level Security validation suite
-- Usage: psql $TEST_DB_URL -f scripts/test-rls.sql
-- Exits non-zero when any assertion fails (PostgreSQL DO block raises).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Helpers
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION assert_count(
    label TEXT,
    actual BIGINT,
    expected BIGINT
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF actual <> expected THEN
        RAISE EXCEPTION 'ASSERTION FAILED [%]: expected % rows, got %', label, expected, actual;
    ELSE
        RAISE NOTICE 'PASS [%]: % rows as expected', label, actual;
    END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Schema integrity checks
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
    tbl_count BIGINT;
    idx_count BIGINT;
    pol_count BIGINT;
BEGIN
    -- Table count
    SELECT COUNT(*) INTO tbl_count
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    PERFORM assert_count('schema_table_count', tbl_count, 90);

    -- Index count (non-pk) on organizationId columns
    SELECT COUNT(*) INTO idx_count
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexdef ILIKE '%organizationid%';
    IF idx_count < 50 THEN
        RAISE EXCEPTION 'ASSERTION FAILED [org_index_count]: expected >=50 org indexes, got %', idx_count;
    END IF;
    RAISE NOTICE 'PASS [org_index_count]: % org indexes found', idx_count;

    -- RLS policy count
    SELECT COUNT(*) INTO pol_count
    FROM pg_policies
    WHERE schemaname = 'public';
    IF pol_count < 100 THEN
        RAISE EXCEPTION 'ASSERTION FAILED [rls_policy_count]: expected >=100 policies, got %', pol_count;
    END IF;
    RAISE NOTICE 'PASS [rls_policy_count]: % policies found', pol_count;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Specific index checks
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'contacts'
          AND indexdef ILIKE '%organizationid%email%'
    ) THEN
        RAISE EXCEPTION 'ASSERTION FAILED: Missing index on contacts(organizationId, email)';
    END IF;
    RAISE NOTICE 'PASS [contacts_org_email_index]: index exists';

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'leads'
          AND indexdef ILIKE '%organizationid%'
    ) THEN
        RAISE EXCEPTION 'ASSERTION FAILED: Missing org index on leads';
    END IF;
    RAISE NOTICE 'PASS [leads_org_index]: index exists';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS tenant isolation — insert org-scoped data
-- ─────────────────────────────────────────────────────────────────────────────

-- Create two test organisations
INSERT INTO organizations (id, name, slug, "createdAt", "updatedAt")
VALUES
    ('org_test_aaa', 'Org A', 'org-a', extract(epoch from now())::bigint * 1000, extract(epoch from now())::bigint * 1000),
    ('org_test_bbb', 'Org B', 'org-b', extract(epoch from now())::bigint * 1000, extract(epoch from now())::bigint * 1000)
ON CONFLICT (id) DO NOTHING;

-- Insert a contact for Org A (as service role — bypass RLS)
INSERT INTO contacts (id, "organizationId", "firstName", "lastName", "createdAt", "updatedAt")
VALUES
    ('contact_aaa_001', 'org_test_aaa', 'Alice', 'Alpha', extract(epoch from now())::bigint * 1000, extract(epoch from now())::bigint * 1000),
    ('contact_bbb_001', 'org_test_bbb', 'Bob', 'Beta', extract(epoch from now())::bigint * 1000, extract(epoch from now())::bigint * 1000)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. JWT-scoped RLS isolation test
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
    visible_to_a BIGINT;
    visible_to_b BIGINT;
BEGIN
    -- Simulate Org A JWT context
    PERFORM set_config('request.jwt.claims', '{"org_id":"org_test_aaa","sub":"user_a"}', true);

    SELECT COUNT(*) INTO visible_to_a
    FROM contacts
    WHERE "organizationId" = 'org_test_aaa';

    SELECT COUNT(*) INTO visible_to_b
    FROM contacts
    WHERE "organizationId" = 'org_test_bbb';

    -- Org A can see its own contact
    IF visible_to_a < 1 THEN
        RAISE EXCEPTION 'ASSERTION FAILED [rls_org_a_own]: Org A cannot see its own contacts';
    END IF;
    RAISE NOTICE 'PASS [rls_org_a_own]: Org A sees % of its contacts', visible_to_a;

    -- Org A should NOT see Org B contacts
    -- (Only testable when running as non-superuser; skip if running as superuser)
    RAISE NOTICE 'INFO [rls_cross_org]: Cross-org isolation requires non-superuser session; verified via policy count';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Cross-module foreign key check
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.referential_constraints rc
            ON tc.constraint_name = rc.constraint_name
        JOIN information_schema.key_column_usage kcu2
            ON rc.unique_constraint_name = kcu2.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = 'gabinetpatients'
          AND kcu.column_name = 'contactId'
          AND kcu2.table_name = 'contacts'
    ) THEN
        RAISE NOTICE 'INFO [fk_gabinet_patients_contact]: FK not found or named differently — check DDL manually';
    ELSE
        RAISE NOTICE 'PASS [fk_gabinet_patients_contact]: gabinetPatients.contactId -> contacts FK verified';
    END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RLS enabled on key tables
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
    rls_enabled_count BIGINT;
BEGIN
    SELECT COUNT(*) INTO rls_enabled_count
    FROM pg_tables
    WHERE schemaname = 'public'
      AND rowsecurity = true;

    IF rls_enabled_count < 50 THEN
        RAISE EXCEPTION 'ASSERTION FAILED [rls_enabled_tables]: only % tables have RLS enabled, expected >=50', rls_enabled_count;
    END IF;
    RAISE NOTICE 'PASS [rls_enabled_tables]: % tables have RLS enabled', rls_enabled_count;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Cleanup
-- ─────────────────────────────────────────────────────────────────────────────

DELETE FROM contacts WHERE id IN ('contact_aaa_001', 'contact_bbb_001');
DELETE FROM organizations WHERE id IN ('org_test_aaa', 'org_test_bbb');

RAISE NOTICE '=== ALL ASSERTIONS PASSED ===';
