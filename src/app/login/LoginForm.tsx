"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { login } from "@/app/login/actions";

const initialState: { error?: string } = {};

export function LoginForm() {
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "/";
  const [state, formAction, pending] = useActionState(async (_prev: typeof initialState, formData: FormData) => {
    return login(formData);
  }, initialState);

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-lg font-semibold tracking-tight text-neutral-100">Cardroom Banking Tool</h1>
        <p className="text-sm text-neutral-400">Sign in to the shared tracker, or explore the public demo.</p>
      </div>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="from" value={from} />
        <input
          type="text"
          name="username"
          autoFocus
          autoComplete="username"
          placeholder="Username, admin, or demo"
          className="h-14 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 text-base text-neutral-100 outline-none focus:border-neutral-500"
        />
        <input
          type="password"
          name="passphrase"
          autoComplete="current-password"
          placeholder="Password"
          className="h-14 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 text-base text-neutral-100 outline-none focus:border-neutral-500"
        />
        {state.error ? <p className="text-sm text-red-400">{state.error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="h-14 w-full rounded-xl bg-emerald-600 text-base font-medium text-white transition active:bg-emerald-700 disabled:opacity-60"
        >
          {pending ? "Checking…" : "Sign in"}
        </button>
        <button
          type="submit"
          name="mode"
          value="demo"
          disabled={pending}
          className="h-14 w-full rounded-xl border border-neutral-700 bg-neutral-900 text-base font-medium text-neutral-200 transition active:bg-neutral-800 disabled:opacity-60"
        >
          View public demo
        </button>
      </form>
    </div>
  );
}
