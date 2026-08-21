"use client";

import { useMemo, useState } from "react";
import { useGames } from "@/hooks/useGames";
import { useFeeSchedules } from "@/hooks/useFeeSchedules";
import { FeeCalculatorForm } from "@/components/fees/FeeCalculatorForm";
import { CliffWarning } from "@/components/fees/CliffWarning";
import { MarginalRakeDisplay } from "@/components/fees/MarginalRakeDisplay";
import { describeCliff, findTierForAction, isNearCliff, type FeeTier } from "@/lib/fees/cliff";
import { d } from "@/lib/decimal";

export default function FeesPage() {
  const { games, isLoading: gamesLoading } = useGames();
  const [gameId, setGameId] = useState("");
  const [optionLabel, setOptionLabel] = useState("");
  const [tta, setTta] = useState("");

  const selectedGameId = games.some((game) => game.game_id === gameId)
    ? gameId
    : (games[0]?.game_id ?? "");

  const { feeSchedules, isLoading: schedulesLoading } = useFeeSchedules(selectedGameId);

  const optionLabels = useMemo(() => {
    const set = new Set(feeSchedules.map((f) => f.option_label || "(unlabeled)"));
    return Array.from(set);
  }, [feeSchedules]);

  const selectedOptionLabel = optionLabels.includes(optionLabel)
    ? optionLabel
    : (optionLabels[0] ?? "");

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

  return (
    <main className="mx-auto max-w-lg space-y-5 px-4 pt-4 pb-8">
      <h1 className="text-xl font-semibold text-foreground">Fee calculator</h1>

      {gamesLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : games.length === 0 ? (
        <p className="text-sm text-muted">No games yet — add one on the Games tab first.</p>
      ) : (
        <>
          <FeeCalculatorForm
            games={games}
            gameId={selectedGameId}
            onGameChange={(id) => {
              setGameId(id);
              setOptionLabel("");
            }}
            optionLabels={optionLabels}
            optionLabel={selectedOptionLabel}
            onOptionChange={setOptionLabel}
            tta={tta}
            onTtaChange={setTta}
          />

          {schedulesLoading ? (
            <p className="text-sm text-muted">Loading fee schedule…</p>
          ) : tiers.length === 0 ? (
            <p className="rounded-xl border border-border bg-surface p-3 text-sm text-muted">
              No fee schedule entered yet for this game. Add tiers on the game&apos;s detail page.
            </p>
          ) : !validTta ? (
            <p className="text-sm text-muted">Enter a TTA to see the fee tier and any cliff warning.</p>
          ) : (
            <div className="space-y-3">
              <MarginalRakeDisplay tierFee={currentTier ? d(currentTier.pdFee) : null} rake={cliff?.marginalRake ?? null} />
              <CliffWarning cliff={cliff} isNear={near} />
            </div>
          )}
        </>
      )}
    </main>
  );
}
