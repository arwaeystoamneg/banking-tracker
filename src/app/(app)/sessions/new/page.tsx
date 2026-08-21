import { SessionForm } from "@/components/sessions/SessionForm";
import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/session";

export default async function NewSessionPage() {
  const user = await requireCurrentUser();
  if (user.role === "demo") redirect("/sessions");

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <h1 className="text-xl font-semibold text-foreground">Start a session</h1>
      <SessionForm />
    </main>
  );
}
