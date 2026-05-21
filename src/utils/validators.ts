import { z } from "zod";

export const username = z
  .string()
  .min(3)
  .max(32)
  .toLowerCase()
  .trim()
  .regex(
    /^[a-zA-Z0-9._-]+$/,
    "Username may only contain letters, numbers, and . _ - characters.",
  );
