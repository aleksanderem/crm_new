-- Add index on package_id alone to gabinet_package_usage so that queries
-- filtering by package (e.g. counting sold usages per package) don't full-scan.
-- Mirrors the new by_package Convex index added in convex/schema/gabinet.ts.
CREATE INDEX gabinet_package_usage_package_idx ON gabinet_package_usage (package_id);
