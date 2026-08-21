import type { z } from "zod";
import type {
  feeScheduleCreateSchema,
  feeSchedulePatchSchema,
  gameCreateSchema,
  gamePatchSchema,
  paytableCreateSchema,
  paytablePatchSchema,
  roundCreateSchema,
  roundPatchSchema,
  sessionCreateSchema,
  sessionPatchSchema,
  sidebetCreateSchema,
  sidebetPatchSchema,
} from "@/lib/validation/schemas";

export type GameCreate = z.infer<typeof gameCreateSchema>;
export type GamePatch = z.infer<typeof gamePatchSchema>;
export type SidebetCreate = z.infer<typeof sidebetCreateSchema>;
export type SidebetPatch = z.infer<typeof sidebetPatchSchema>;
export type PaytableCreate = z.infer<typeof paytableCreateSchema>;
export type PaytablePatch = z.infer<typeof paytablePatchSchema>;
export type FeeScheduleCreate = z.infer<typeof feeScheduleCreateSchema>;
export type FeeSchedulePatch = z.infer<typeof feeSchedulePatchSchema>;
export type SessionCreate = z.infer<typeof sessionCreateSchema>;
export type SessionPatch = z.infer<typeof sessionPatchSchema>;
export type RoundCreate = z.infer<typeof roundCreateSchema>;
export type RoundPatch = z.infer<typeof roundPatchSchema>;
