/**
 * Migration config: Convex `plans` → PostgreSQL `plans`
 *
 * No FK dependencies — standalone global lookup table.
 */

import {
  idField,
  field,
  jsonbField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const plansConfig: TableMigrationConfig = {
  sourceTable: "plans",
  targetTable: "plans",
  fields: [
    idField(),
    field("key", "key"),
    field("stripeId", "stripe_id"),
    field("name", "name"),
    field("description", "description"),
    field("seatLimit", "seat_limit"),
    jsonbField("prices", "prices"),
  ],
};

registerTable(plansConfig);

export default plansConfig;
