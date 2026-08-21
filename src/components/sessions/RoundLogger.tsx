"use client";

import { useMemo, useState } from "react";
import { useRounds } from "@/hooks/useRounds";
import { useFeeSchedules } from "@/hooks/useFeeSchedules";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { CliffWarning } from "@/components/fees/CliffWarning";
import { describeCliff, findTierForAction, isNearCliff, type FeeTier } from "@/lib/fees/cliff";
import { formatMoney } from "@/lib/decimal";
import type { Session } from "@/lib/validation/schemas";
import { normalizeCasinoKey } from "@/lib/names";

export function RoundLogger({ session }: { session: Session }) {
  const { rounds, create } = useRounds(session.session_id);
  const { feeSchedules } = useFeeSchedules(session.game_id);

  const [tta, setTta] = useState("");
  const [booked, setBooked] = useState("");
  const [bonusAction, setBonusAction] = useState("");
  const [result, setResult] = useState("");
  const [feePaidOverride, setFeePaidOverride] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const tiers: FeeTier[] = useMemo(
    () =>
      feeSchedules
        .filter(
          (f) =>
            (f.option_label || "(unlabeled)") === (session.schedule_option || "(unlabeled)") &&
            (!f.casino || normalizeCasinoKey(f.casino) === normalizeCasinoKey(session.casino)),
        )
        .map((f) => ({ scheduleId: f.schedule_id, basis: f.basis, tierMin: f.tier_min, tierMax: f.tier_max, pdFee: f.pd_fee })),
    [feeSchedules, session.casino, session.schedule_option],
  );

  const ttaNum = Number(tta);
  const validTta = tta !== "" && Number.isFinite(ttaNum) && ttaNum >= 0;
  const autoTier = validTta ? findTierForAction(tiers, ttaNum) : null;
  const computedFee = autoTier ? autoTier.pdFee : null;
  const cliff = validTta && tiers.length > 0 ? describeCliff(ttaNum, tiers) : null;
  const nearCliff = validTta && tiers.length > 0 ? isNearCliff(ttaNum, tiers) : false;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (tta === "" || booked === "" || result === "") return;

    const ttaAmount = Number(tta);
    const bookedAmount = Number(booked);
    const bonusAmount = bonusAction === "" ? null : Number(bonusAction);
    const resultAmount = Number(result);
    const feePaid = computedFee ? computedFee.toNumber() : feePaidOverride === "" ? 0 : Number(feePaidOverride);
    if (
      !Number.isFinite(ttaAmount) ||
      ttaAmount < 0 ||
      !Number.isFinite(bookedAmount) ||
      bookedAmount < 0 ||
      bookedAmount > ttaAmount ||
      (bonusAmount !== null && (!Number.isFinite(bonusAmount) || bonusAmount < 0)) ||
      !Number.isFinite(resultAmount) ||
      !Number.isFinite(feePaid) ||
      feePaid < 0
    ) {
      setError("Use finite nonnegative amounts, keep booked action at or below TTA, and enter a valid result.");
      return;
    }
    setError("");

    await create({
      session_id: session.session_id,
      seq: rounds.length + 1,
      tta: ttaAmount,
      booked: bookedAmount,
      bonus_action: bonusAmount,
      fee_tier: autoTier ? `$${autoTier.tierMin.toFixed(0)}${autoTier.tierMax ? `-${autoTier.tierMax.toFixed(0)}` : "+"}` : "",
      fee_paid: feePaid,
      result: resultAmount,
      note,
    });

    setTta("");
    setBooked("");
    setBonusAction("");
    setResult("");
    setFeePaidOverride("");
    setNote("");
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-2 rounded-2xl border border-border bg-surface p-4">
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs text-muted">
            TTA offered
            <Input value={tta} onChange={(e) => setTta(e.target.value)} inputMode="decimal" required />
          </label>
          <label className="space-y-1 text-xs text-muted">
            Booked (covered)
            <Input value={booked} onChange={(e) => setBooked(e.target.value)} inputMode="decimal" required />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs text-muted">
            Bonus action (opt.)
            <Input value={bonusAction} onChange={(e) => setBonusAction(e.target.value)} inputMode="decimal" />
          </label>
          <label className="space-y-1 text-xs text-muted">
            Round result (±)
            <Input value={result} onChange={(e) => setResult(e.target.value)} inputMode="decimal" required />
          </label>
        </div>

        {validTta && tiers.length > 0 ? <CliffWarning cliff={cliff} isNear={nearCliff} /> : null}

        <div className="flex items-center justify-between rounded-lg bg-background px-3 py-2 text-sm">
          <span className="text-muted">Fee this round</span>
          {computedFee ? (
            <span className="font-medium text-foreground">{formatMoney(computedFee)} (auto)</span>
          ) : (
            <Input
              value={feePaidOverride}
              onChange={(e) => setFeePaidOverride(e.target.value)}
              inputMode="decimal"
              placeholder="0.00 (no schedule — enter manually)"
              className="h-8 w-40 text-right"
            />
          )}
        </div>

        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
        {error ? <p className="text-xs text-red-400">{error}</p> : null}

        <Button type="submit" className="w-full">
          Log round #{rounds.length + 1}
        </Button>
      </form>

      <div className="space-y-1">
        {[...rounds]
          .sort((a, b) => b.seq - a.seq)
          .map((r) => (
            <div key={r.round_id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
              <span className="text-muted">
                #{r.seq} · TTA {formatMoney(r.tta)}
              </span>
              <span className={r.result >= 0 ? "text-emerald-400" : "text-red-400"}>{formatMoney(r.result)}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
