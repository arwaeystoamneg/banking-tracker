import { d } from "@/lib/decimal";

/** If TTA is within this much below a tier boundary, warn loudly (per CLAUDE.md feature 3). */
export const CLIFF_WARNING_THRESHOLD_DOLLARS = d(50);
