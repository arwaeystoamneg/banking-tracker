import { makeItemRoutes } from "@/lib/api/crudRoute";
import { feeSchedulePatchSchema, type FeeSchedule } from "@/lib/validation/schemas";
import type { FeeScheduleCreate, FeeSchedulePatch } from "@/lib/repositories/inferred";

export const { GET, PATCH, DELETE } = makeItemRoutes<FeeSchedule, FeeScheduleCreate, FeeSchedulePatch>(
  "feeSchedules",
  feeSchedulePatchSchema,
);
