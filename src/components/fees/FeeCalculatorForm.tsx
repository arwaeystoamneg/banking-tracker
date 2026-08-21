import { Input } from "@/components/ui/Input";
import type { Game } from "@/lib/validation/schemas";

interface FeeCalculatorFormProps {
  games: Game[];
  gameId: string;
  onGameChange: (id: string) => void;
  optionLabels: string[];
  optionLabel: string;
  onOptionChange: (label: string) => void;
  tta: string;
  onTtaChange: (value: string) => void;
}

export function FeeCalculatorForm({
  games,
  gameId,
  onGameChange,
  optionLabels,
  optionLabel,
  onOptionChange,
  tta,
  onTtaChange,
}: FeeCalculatorFormProps) {
  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Game</span>
        <select
          value={gameId}
          onChange={(e) => onGameChange(e.target.value)}
          className="h-12 w-full rounded-xl border border-border bg-surface px-3 text-base text-foreground outline-none focus:border-neutral-500"
        >
          {games.map((g) => (
            <option key={g.game_id} value={g.game_id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>

      {optionLabels.length > 1 ? (
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Fee schedule option</span>
          <select
            value={optionLabel}
            onChange={(e) => onOptionChange(e.target.value)}
            className="h-12 w-full rounded-xl border border-border bg-surface px-3 text-base text-foreground outline-none focus:border-neutral-500"
          >
            {optionLabels.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">TTA (total table action)</span>
        <Input
          value={tta}
          onChange={(e) => onTtaChange(e.target.value)}
          inputMode="decimal"
          placeholder="0"
          className="text-2xl font-semibold"
        />
      </label>
    </div>
  );
}
