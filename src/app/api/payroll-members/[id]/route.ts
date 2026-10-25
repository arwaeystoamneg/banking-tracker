import { makeItemRoutes } from "@/lib/api/crudRoute";
import { payrollMemberPatchSchema, type PayrollMember } from "@/lib/validation/schemas";
import type { PayrollMemberCreate, PayrollMemberPatch } from "@/lib/repositories/inferred";

export const { GET, PATCH, DELETE } = makeItemRoutes<PayrollMember, PayrollMemberCreate, PayrollMemberPatch>(
  "payrollMembers",
  payrollMemberPatchSchema,
);
