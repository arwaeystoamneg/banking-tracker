import { makeListRoutes } from "@/lib/api/crudRoute";
import { feeScheduleCreateSchema, type FeeSchedule } from "@/lib/validation/schemas";
import type { FeeScheduleCreate, FeeSchedulePatch } from "@/lib/repositories/inferred";

export const { GET, POST } = makeListRoutes<FeeSchedule, FeeScheduleCreate, FeeSchedulePatch>(
  "feeSchedules",
  feeScheduleCreateSchema,
);
