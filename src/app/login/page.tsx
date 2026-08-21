import { Suspense } from "react";
import { LoginForm } from "@/app/login/LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-neutral-950 px-6 text-neutral-100">
      <Suspense fallback={<p className="text-sm text-neutral-400">Loading…</p>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
