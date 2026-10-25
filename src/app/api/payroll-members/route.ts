import { makeListRoutes } from "@/lib/api/crudRoute";
import { payrollMemberCreateSchema, type PayrollMember } from "@/lib/validation/schemas";
import type { PayrollMemberCreate, PayrollMemberPatch } from "@/lib/repositories/inferred";

export const { GET, POST } = makeListRoutes<PayrollMember, PayrollMemberCreate, PayrollMemberPatch>(
  "payrollMembers",
  payrollMemberCreateSchema,
);
