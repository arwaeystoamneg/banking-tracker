"use client";

import { useMemo, useState } from "react";
import { useGames } from "@/hooks/useGames";
import { useFeeSchedules } from "@/hooks/useFeeSchedules";
import { CliffWarning } from "@/components/fees/CliffWarning";
import { FeeTierLadder } from "@/components/fees/FeeTierLadder";
import { Metric } from "@/components/ui/Metric";
import { describeCliff, findTierForAction, isNearCliff, type FeeTier } from "@/lib/fees/cliff";
import { formatMoney } from "@/lib/decimal";

export default function FeesPage() {
  const { games, isLoading: gamesLoading } = useGames();
  const [gameId, setGameId] = useState("");
  const [optionLabel, setOptionLabel] = useState("");
  const [tta, setTta] = useState("");

  const selectedGameId = games.some((game) => game.game_id === gameId) ? gameId : (games[0]?.game_id ?? "");
  const selectedGame = games.find((g) => g.game_id === selectedGameId);
  const { feeSchedules, isLoading: schedulesLoading } = useFeeSchedules(selectedGameId);

  const optionLabels = useMemo(() => {
    const set = new Set(feeSchedules.map((f) => f.option_label || "(unlabeled)"));
    return Array.from(set);
  }, [feeSchedules]);

  const selectedOptionLabel = optionLabels.includes(optionLabel) ? optionLabel : (optionLabels[0] ?? "");

  const tiers: FeeTier[] = useMemo(
    () =>
      feeSchedules
        .filter((f) => (f.option_label || "(unlabeled)") === selectedOptionLabel)
        .map((f) => ({ scheduleId: f.schedule_id, basis: f.basis, tierMin: f.tier_min, tierMax: f.tier_max, pdFee: f.pd_fee })),
    [feeSchedules, selectedOptionLabel],
  );

  const ttaValue = tta === "" ? null : Number(tta);
  const validTta = ttaValue !== null && !Number.isNaN(ttaValue) && ttaValue >= 0;

  const currentTier = validTta ? findTierForAction(tiers, ttaValue) : null;
  const cliff = validTta ? describeCliff(ttaValue, tiers) : null;
  const near = validTta ? isNearCliff(ttaValue, tiers) : false;

  const effectiveRake =
    currentTier && validTta && ttaValue! > 0 ? currentTier.pdFee.dividedBy(ttaValue!).times(100) : null;

  return (
    <main className="mx-auto max-w-lg space-y-5 px-4 pt-4 pb-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Fee calculator</h1>
        <p className="text-sm text-muted">The fee the player-dealer pays this round, and how close it sits to a cliff.</p>
      </div>

      {gamesLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : games.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-3 text-sm text-muted">
          No games yet — add one on the Games tab first.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Game">
              <Select value={selectedGameId} onChange={(v) => { setGameId(v); setOptionLabel(""); }}>
                {games.map((g) => (
                  <option key={g.game_id} value={g.game_id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </Field>
            {optionLabels.length > 1 ? (
              <Field label="Schedule option">
                <Select value={selectedOptionLabel} onChange={setOptionLabel}>
                  {optionLabels.map((label) => (
                    <option key={label} value={label}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field label="Exposure multiple">
                <div className="num flex h-12 items-center rounded-xl border border-border bg-surface-inset px-3.5 text-base text-muted-strong">
                  {selectedGame ? `×${selectedGame.exposure_mult}` : "—"}
                </div>
              </Field>
            )}
          </div>

          <Field label="TTA — total table action">
            <div className="flex items-center rounded-2xl border border-border bg-surface-inset px-4 focus-within:border-emerald-500/70 focus-within:ring-2 focus-within:ring-emerald-500/20">
              <span className="num text-3xl font-semibold text-muted">$</span>
              <input
                value={tta}
                onChange={(e) => setTta(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                className="num h-16 w-full bg-transparent pl-1 text-4xl font-semibold text-foreground outline-none placeholder:text-muted/40"
              />
            </div>
          </Field>

          {schedulesLoading ? (
            <p className="text-sm text-muted">Loading fee schedule…</p>
          ) : tiers.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-surface/50 p-4 text-sm text-muted">
              No fee schedule filed for this game yet. Add tiers on the game&apos;s detail page.
            </p>
          ) : (
            <div className="space-y-4">
              {validTta ? (
                <div className="grid grid-cols-3 gap-3 rounded-2xl border border-border bg-surface p-4">
                  <Metric
                    label="PD fee"
                    value={currentTier ? `$${currentTier.pdFee.toFixed(2)}` : "—"}
                    size="lg"
                  />
                  <Metric
                    label="Effective rake"
                    value={effectiveRake ? `${effectiveRake.toFixed(2)}%` : "—"}
                    base="of TTA"
                    size="lg"
                  />
                  <Metric
                    label="To next cliff"
                    value={cliff ? formatMoney(cliff.dollarsToCliff) : "—"}
                    base={cliff ? `${cliff.marginalRake.times(100).toFixed(0)}% marginal` : "top tier"}
                    tone={near ? "warning" : "neutral"}
                    size="lg"
                  />
                </div>
              ) : (
                <p className="text-sm text-muted">Enter a TTA to see the fee tier and any cliff warning.</p>
              )}

              {validTta ? <CliffWarning cliff={cliff} isNear={near} /> : null}

              <FeeTierLadder tiers={tiers} currentScheduleId={currentTier?.scheduleId ?? null} />
            </div>
          )}
        </>
      )}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-12 w-full truncate rounded-xl border border-border bg-surface-inset px-3 text-base text-foreground outline-none transition-colors focus:border-emerald-500/70 focus:ring-2 focus:ring-emerald-500/20"
    >
      {children}
    </select>
  );
}
