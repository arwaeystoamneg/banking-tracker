import { SessionForm } from "@/components/sessions/SessionForm";

export default function NewSessionPage() {
  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <h1 className="text-xl font-semibold text-foreground">Start a session</h1>
      <SessionForm />
    </main>
  );
}
