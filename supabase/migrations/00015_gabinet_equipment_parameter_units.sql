-- Issue #1847: add parameter unit catalog to equipment
--
-- Each equipment can list the units it supports for treatment parameters
-- (e.g. {"J", "W", "ms"} for a laser). The appointment documentation tab
-- uses these to suggest a matching unit when adding custom parameters.

ALTER TABLE gabinet_equipment
  ADD COLUMN IF NOT EXISTS parameter_units TEXT[];
