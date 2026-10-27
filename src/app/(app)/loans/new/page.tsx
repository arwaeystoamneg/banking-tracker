"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LoanForm } from "@/components/loans/LoanForm";
import { useCurrentUser } from "@/components/providers/AuthProvider";
import { canRecordLoans } from "@/lib/auth/permissions";

export default function NewLoanPage() {
  return (
    <Suspense fallback={<p className="px-4 pt-4 text-sm text-muted">Loading…</p>}>
      <NewLoanInner />
    </Suspense>
  );
}

function NewLoanInner() {
  const user = useCurrentUser();
  const params = useSearchParams();
  if (!canRecordLoans(user)) return <p className="px-4 pt-4 text-sm text-muted">This account cannot record loans.</p>;

  // "Repay" on the Loans page prefills who pays whom and the outstanding amount.
  const person = (side: "from" | "to") => {
    const name = params.get(`${side}_name`) ?? "";
    return name ? { id: params.get(`${side}_id`) ?? "", name } : undefined;
  };
  const kind = params.get("kind") === "repayment" ? "repayment" : "loan";

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <h1 className="text-xl font-semibold text-foreground">{kind === "repayment" ? "Record a repayment" : "Record a loan"}</h1>
      <LoanForm prefill={{ kind, from: person("from"), to: person("to"), amount: params.get("amount") ?? undefined }} />
    </main>
  );
}
