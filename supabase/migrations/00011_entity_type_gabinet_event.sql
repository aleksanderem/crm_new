-- Add 'gabinetEvent' to entity_type_enum (issue #1555).
--
-- Lets organisations categorize non-patient calendar entries ("zdarzenia"
-- such as meetings or training) the same way they categorize patients,
-- appointments, etc. The picker on the new Event dialog reuses
-- category_definitions filtered by entity_type='gabinetEvent'.

ALTER TYPE entity_type_enum ADD VALUE IF NOT EXISTS 'gabinetEvent';
