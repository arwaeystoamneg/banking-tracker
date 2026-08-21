import { GameForm } from "@/components/games/GameForm";

export default function NewGamePage() {
  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pt-4 pb-8">
      <h1 className="text-xl font-semibold text-foreground">Add table game</h1>
      <GameForm />
    </main>
  );
}
