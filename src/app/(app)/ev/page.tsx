"use client";

import { useMemo, useState } from "react";
import { useGames } from "@/hooks/useGames";
import { useSidebets } from "@/hooks/useSidebets";
import { usePaytables } from "@/hooks/usePaytables";
import { Metric } from "@/components/ui/Metric";
import { Button } from "@/components/ui/Button";
import { computeBankingEV } from "@/lib/math/evCalc";
import { simulateSessions, type SimResult } from "@/lib/math/evSim";
import {
  BAD_BEAT_PAYOUTS,
  BAD_BEAT_PROBABILITIES,
  TRIPS_PAYOUTS_BY_BADBEAT,
  badBeatHitMultipleAfterTrips,
  badBeatPayoutsFromRows,
  badBeatSigmaAfterTrips,
  realizedBadBeatEdge,
  realizedBadBeatEdgeAfterTrips,
  tripsPayoutsFromRows,
} from "@/lib/math/uthBadBeat";
import {
  BACCARAT_BET_PAYOUTS,
  baccaratBetPayoutFromRows,
  matchBaccaratSidebet,
  type BaccaratBetKind,
} from "@/lib/math/baccaratBets";
import {
  baccaratBankingMoments,
  simulateBaccaratSessions,
  type BaccaratBets,
} from "@/lib/math/baccaratSim";
import {
  HPC_FROG_PAYOUTS_STANDARD,
  HPC_FROG_STANDARD_EDGE,
  hpcFrogCap,
  hpcFrogPayoutFromRows,
  hpcFrogSigma,
  matchHpcFrogSidebet,
  realizedHpcFrogEdge,
} from "@/lib/math/baccaratHpc";
import {
  PAIR_PLUS_PAYOUTS_CA,
  SIX_CARD_PAYOUTS_TCP6B4,
  matchThreeCardSidebet,
  pairPlusCap,
  pairPlusPayoutsFromRows,
  realizedPairPlusEdge,
  realizedSixCardEdge,
  sixCardPayoutsFromRows,
} from "@/lib/math/threeCardPoker";
import {
  FORTUNE_PAI_GOW_PAYOUTS,
  TWO_WAY_BONUS_HANDS,
  TWO_WAY_BONUS_LABELS,
  TWO_WAY_WINNER,
  matchFortuneBonus,
  matchTwoWayWinnerBonus,
  realizedTwoWayWinnerBonusEdge,
  twoWayWinnerBonusCap,
  twoWayWinnerBonusLinesFromRows,
  twoWayWinnerBonusPayoutsFromRows,
  twoWayWinnerBonusSigma,
  twoWayWinnerBonusTop,
} from "@/lib/math/twoWayWinner";
import { maxPayoutMultiple } from "@/lib/payout";
import {
  TRIPS_HANDS,
  TRIPS_LABELS,
  realizedUthTripsEdge,
  uthTripsPayoutsFromRows,
  uthTripsSigma,
  uthTripsTop,
  type TripsHand,
} from "@/lib/math/uthTrips";
import { formatMoney, type Decimal } from "@/lib/decimal";
import { Chip } from "@/components/ui/Chip";
import {
  ANTE_BONUS,
  antePlayExact,
  antePlayExposure,
  simulateThreeCardSessions,
  threeCardTableMoments,
  type AnteBonusTable,
  type PlayerStyle,
  type ThreeCardRules,
  type ThreeCardTable,
} from "@/lib/math/threeCardSim";
import { calculatorOptions, detectGameFamily, isHighValueSidebet } from "@/lib/gameFamily";

const SIM_SESSIONS = 4000;

function num(s: string, fallback = 0): number {
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

const BACCARAT_BET_LABEL: Record<keyof BaccaratBets, string> = {
  player: "Player line",
  banker: "Banker line",
  tie: "Tie",
  dragon: "Dragon 7",
  pandaKoi: "Panda 8",
};

/** One player's bets. Every input on the page edits the selected player; the math uses all of them. */
interface PlayerBets {
  main: string;
  /** Two Way Winner Play. */
  play: string;
  /** Three Card Poker: how this player plays. */
  style: PlayerStyle;
  bacPlayer: string;
  bacBanker: string;
  bacTie: string;
  sides: Record<string, string>;
}

const FIRST_PLAYER: PlayerBets = { main: "100", play: "", style: "optimal", bacPlayer: "250", bacBanker: "250", bacTie: "", sides: {} };
const MAX_PLAYERS = 7;

/** The dealt-card table moments, recomputed only when the table (as a JSON key) or bank changes. */
function useThreeCardTableMoments(key: string): { mean: number; variance: number } | null {
  return useMemo(() => {
    if (!key) return null;
    const { bank, table } = JSON.parse(key) as { bank: number; table: ThreeCardTable };
    return table.seats.some((seat) => seat.ante + seat.pairPlus + seat.sixCard > 0) ? threeCardTableMoments(bank, table) : null;
  }, [key]);
}

export default function EvCalculatorPage() {
  const { games } = useGames();
  const { sidebets } = useSidebets();
  const { paytables } = usePaytables();

  const [calcId, setCalcId] = useState("");
  const [bank, setBank] = useState("8000");
  const [players, setPlayers] = useState<PlayerBets[]>([FIRST_PLAYER]);
  const [activePlayer, setActivePlayer] = useState(0);
  const active = Math.min(activePlayer, players.length - 1);
  const current = players[active];
  const editPlayer = (change: (player: PlayerBets) => PlayerBets) =>
    setPlayers((prev) => prev.map((player, i) => (i === active ? change(player) : player)));
  // The inputs below read and write the selected player.
  const mainSize = current.main;
  const setMainSize = (v: string) => editPlayer((player) => ({ ...player, main: v }));
  const baccaratPlayerAction = current.bacPlayer;
  const setBaccaratPlayerAction = (v: string) => editPlayer((player) => ({ ...player, bacPlayer: v }));
  const baccaratBankerAction = current.bacBanker;
  const setBaccaratBankerAction = (v: string) => editPlayer((player) => ({ ...player, bacBanker: v }));
  const baccaratTieAction = current.bacTie;
  const setBaccaratTieAction = (v: string) => editPlayer((player) => ({ ...player, bacTie: v }));
  const twoWayPlay = current.play;
  const setTwoWayPlay = (v: string) => editPlayer((player) => ({ ...player, play: v }));
  const sideSizes = current.sides;
  const setSideSizes = (change: (prev: Record<string, string>) => Record<string, string>) =>
    editPlayer((player) => ({ ...player, sides: change(player.sides) }));
  function addPlayer() {
    if (players.length >= MAX_PLAYERS) return;
    // A new player starts with the last player's bets: the usual case is "another one like that".
    setPlayers((prev) => [...prev, { ...prev[prev.length - 1], sides: { ...prev[prev.length - 1].sides } }]);
    setActivePlayer(players.length);
  }
  function removePlayer(index: number) {
    if (players.length <= 1) return;
    setPlayers((prev) => prev.filter((_, i) => i !== index));
    setActivePlayer((i) => Math.max(0, i >= index ? i - 1 : i));
  }
  const [collectionFee, setCollectionFee] = useState("");
  const [mainSigma, setMainSigma] = useState("1.0");
  const [sideSigma, setSideSigma] = useState("5");
  const [rho, setRho] = useState("0.5");
  const [roundsPerSession, setRoundsPerSession] = useState("50");
  const [sim, setSim] = useState<{ key: string; result: SimResult } | null>(null);
  const [showAssumptions, setShowAssumptions] = useState(false);
  // 3CP: which rules are on the felt and how the players play. Face-up matches the Games tab's gm_3cp.
  const [tcpRules, setTcpRules] = useState<ThreeCardRules>("faceUp");
  const [tcpBonus, setTcpBonus] = useState<AnteBonusTable>("5/4/1");
  const tcpStyle = current.style;
  const setTcpStyle = (v: PlayerStyle) => editPlayer((player) => ({ ...player, style: v }));
  const tcpExact = antePlayExact(tcpRules, tcpBonus, tcpStyle);
  const tcpExposure = antePlayExposure(tcpRules, tcpBonus);

  const calcOptions = useMemo(() => calculatorOptions(games, sidebets), [games, sidebets]);
  const selectedCalc = calcOptions.find((option) => option.id === calcId) ?? null;
  const game = games.find((g) => g.game_id === selectedCalc?.canonicalGameId) ?? null;
  const detectedFamily = detectGameFamily(game?.name ?? "");
  const isBaccaratHpc = selectedCalc?.family === "baccaratHpc" || detectedFamily === "baccaratHpc";
  const isBaccarat =
    selectedCalc?.family === "baccarat" ||
    selectedCalc?.family === "baccaratHpc" ||
    detectedFamily === "baccarat" ||
    detectedFamily === "baccaratHpc";
  const isThreeCard = selectedCalc?.family === "3cp" || detectGameFamily(game?.name ?? "") === "3cp";
  const isTwoWay = selectedCalc?.family === "2ww" || detectGameFamily(game?.name ?? "") === "2ww";
  const isPaiGow = selectedCalc?.family === "paigow" || detectGameFamily(game?.name ?? "") === "paigow";
  const isUth = selectedCalc?.family === "uth" || detectedFamily === "uth";
  const gameId = selectedCalc?.canonicalGameId ?? "";
  const gameSidebets = useMemo(
    () =>
      sidebets.filter(
        (sidebet) =>
          sidebet.game_id === gameId &&
          !(isBaccarat && /^main\s*\(banker\/player\/tie\)$/i.test(sidebet.name)) &&
          // CA Face-Up Three Card has no Ante Bonus; an old catalog row for one isn't a bet here.
          !(isThreeCard && /ante\s*bonus/i.test(sidebet.name)),
      ),
    [sidebets, gameId, isBaccarat, isThreeCard],
  );

  const sideExposure = useMemo(() => {
    const byId = new Map<string, number>();
    for (const sb of gameSidebets) {
      const rows = paytables.filter((p) => p.sidebet_id === sb.sidebet_id).map((p) => p.payout);
      // `|| 1` (not `?? 1`) also guards a paytable whose max parses to 0 (e.g. all "0:1"/non-numeric).
      byId.set(sb.sidebet_id, maxPayoutMultiple(rows) || 1);
    }
    return byId;
  }, [gameSidebets, paytables]);

  // ρ below 0 isn't a valid cross-seat covariance here and would NaN the SD (√ of a negative). Clamp it.
  const rhoVal = Math.min(1, Math.max(0, num(rho, 0.5)));
  const bankAmount = Math.max(0, num(bank));
  const amount = (value: string | undefined) => Math.max(0, num(value ?? ""));
  const seats = players.map((player) => ({
    main: amount(player.main),
    play: amount(player.play),
    style: player.style,
    side: (sidebetId: string) => amount(player.sides[sidebetId]),
  }));
  type Seat = (typeof seats)[number];
  const sumSeats = (f: (seat: Seat) => number) => seats.reduce((total, seat) => total + f(seat), 0);
  const totalMain = sumSeats((seat) => seat.main);
  const mainSigmaValue = Math.max(0, num(mainSigma));
  const sideSigmaValue = Math.max(0, num(sideSigma, 5));
  // Baccarat players all bet on the same coup, so the table is exactly the sum of their bets.
  const baccaratPlayerAmount = players.reduce((total, player) => total + amount(player.bacPlayer), 0);
  const baccaratBankerAmount = players.reduce((total, player) => total + amount(player.bacBanker), 0);
  const baccaratTieAmount = players.reduce((total, player) => total + amount(player.bacTie), 0);
  const twoWayPlayAmount = sumSeats((seat) => seat.play);
  /** A seat's base action: two Antes + Play at Two Way Winner, else the main bet. */
  const seatBase = (seat: Seat) => (isTwoWay ? 2 * seat.main + seat.play : seat.main);
  const baseAction = isBaccarat ? baccaratPlayerAmount + baccaratBankerAmount : sumSeats(seatBase);

  const sideActionOf = (sidebetId: string) => sumSeats((seat) => seat.side(sidebetId));
  /**
   * A side bet across players: each player's edge and SD use their own payout cap (a big hit is paid from the
   * bank left after the main bets, so a bigger bet is capped at a lower multiple). Edge is action-weighted.
   */
  function perSeat(
    sidebetId: string | undefined,
    edgeAt: (seat: Seat, size: number) => number,
    sigmaAt: (seat: Seat, size: number) => number,
  ) {
    const rows = sidebetId
      ? seats
          .map((seat) => ({ seat, size: seat.side(sidebetId) }))
          .filter((row) => row.size > 0)
          .map((row) => ({ ...row, edge: edgeAt(row.seat, row.size), sigma: sigmaAt(row.seat, row.size) }))
      : [];
    const total = rows.reduce((t, row) => t + row.size, 0);
    const largest = rows.reduce<(typeof rows)[number] | null>((best, row) => (!best || row.size > best.size ? row : best), null);
    return {
      total,
      edge: total > 0 ? rows.reduce((t, row) => t + row.size * row.edge, 0) / total : null,
      seats: rows.map((row) => ({ offered: row.size, sigma: row.sigma })),
      /** The biggest bet's size and seat: it's capped hardest, so the panels quote it. */
      largestSize: largest?.size ?? 0,
      largestSeat: largest?.seat ?? null,
    };
  }
  // In felt order, so listed paytables read top line first.
  const paytableRowsOf = (sidebetId: string) =>
    paytables
      .filter((p) => p.sidebet_id === sidebetId)
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((p) => ({ outcome: p.outcome, payout: p.payout }));

  // The UTH Bad Beat Jackpot doesn't fit the exposure-multiple model: the bank collects every wager and
  // caps payouts by coverage. Its edge isn't a stored constant — it's computed from the validated
  // uthBadBeat Monte Carlo as a function of how much bank is left to pay a hit (i.e. the bet sizes).
  const bbjSidebet = gameSidebets.find((sb) => sb.sidebet_id === "sb_uth_progressive" || /bad\s*beat/i.test(sb.name));
  const bbjPayouts = bbjSidebet
    ? (badBeatPayoutsFromRows(paytableRowsOf(bbjSidebet.sidebet_id)) ?? BAD_BEAT_PAYOUTS)
    : BAD_BEAT_PAYOUTS;
  // UTH Trips is priced exactly from seven-card hand counts and the room's own paytable.
  const uthTripsSidebet = isUth ? gameSidebets.find((sb) => sb !== bbjSidebet && /trips/i.test(sb.name)) : undefined;

  const baccaratCappedSidebets = isBaccarat
    ? gameSidebets
        .filter((sb) => sb !== bbjSidebet)
        .map((sb) => {
          const kind = matchBaccaratSidebet(sb.name);
          if (!kind) return null;
          return {
            id: sb.sidebet_id,
            name: sb.name,
            kind,
            actionOffered: sideActionOf(sb.sidebet_id),
            payout: baccaratBetPayoutFromRows(kind, paytableRowsOf(sb.sidebet_id)) ?? BACCARAT_BET_PAYOUTS[kind],
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null)
    : [];
  const tieFromSidebet = baccaratCappedSidebets.some((row) => row.kind === "tie");

  /** Side bets the calculator prices from their own probabilities rather than a stored edge. */
  const isModeledSidebet = (sb: (typeof gameSidebets)[number]) =>
    sb === bbjSidebet ||
    sb === uthTripsSidebet ||
    (isBaccarat && matchBaccaratSidebet(sb.name) !== null) ||
    (isBaccaratHpc && matchHpcFrogSidebet(sb.name) !== null) ||
    (isThreeCard && (matchThreeCardSidebet(sb.name) === "pairPlus" || matchThreeCardSidebet(sb.name) === "sixCard")) ||
    (isTwoWay && matchTwoWayWinnerBonus(sb.name)) ||
    (isPaiGow && matchFortuneBonus(sb.name));
  // A side bet with no model and no recorded edge has an unknown edge. Counting it would add swing with no
  // expected value, so it's left out of the totals (and says so) rather than treated as a 0% bet.
  const unknownEdgeSidebet = (sb: (typeof gameSidebets)[number]) => !isModeledSidebet(sb) && !sb.edge_pct;

  const otherSideLayers = gameSidebets
    .filter(
      (sb) =>
        !unknownEdgeSidebet(sb) &&
        sb !== uthTripsSidebet &&
        sb !== bbjSidebet &&
        !(isBaccarat && matchBaccaratSidebet(sb.name)) &&
        !(isBaccaratHpc && matchHpcFrogSidebet(sb.name)) &&
        !(isThreeCard && (matchThreeCardSidebet(sb.name) === "pairPlus" || matchThreeCardSidebet(sb.name) === "sixCard")) &&
        !(isTwoWay && matchTwoWayWinnerBonus(sb.name)) &&
        !(isPaiGow && matchFortuneBonus(sb.name)),
    )
    .map((sb) => ({
      id: sb.sidebet_id,
      name: sb.name,
      actionOffered: sideActionOf(sb.sidebet_id),
      edge: sb.edge_pct,
      exposureMult: sideExposure.get(sb.sidebet_id) ?? 1,
      sigma: sideSigmaValue,
      seats: seats.map((seat) => ({ offered: seat.side(sb.sidebet_id), sigma: sideSigmaValue })).filter((row) => row.offered > 0),
    }))
    .filter((l) => l.actionOffered > 0);

  const baccaratBets: BaccaratBets = {
    player: baccaratPlayerAmount,
    banker: baccaratBankerAmount,
    tie:
      baccaratTieAmount +
      baccaratCappedSidebets.filter((row) => row.kind === "tie").reduce((sum, row) => sum + row.actionOffered, 0),
    dragon: baccaratCappedSidebets.filter((row) => row.kind === "dragon").reduce((sum, row) => sum + row.actionOffered, 0),
    pandaKoi: baccaratCappedSidebets.filter((row) => row.kind === "pandaKoi").reduce((sum, row) => sum + row.actionOffered, 0),
  };
  const baccaratPayouts: Record<BaccaratBetKind, number> = { ...BACCARAT_BET_PAYOUTS };
  for (const row of baccaratCappedSidebets) baccaratPayouts[row.kind] = row.payout;
  if (isBaccarat && !tieFromSidebet) {
    const mainPaytable = gameSidebets.find((sb) => /main/i.test(sb.name));
    const tiePayout =
      (mainPaytable ? baccaratBetPayoutFromRows("tie", paytableRowsOf(mainPaytable.sidebet_id)) : null) ??
      BACCARAT_BET_PAYOUTS.tie;
    baccaratPayouts.tie = tiePayout;
  }

  const baccaratMomentsSettled = isBaccarat ? baccaratBankingMoments(bankAmount, baccaratBets, undefined, baccaratPayouts) : null;
  const baccaratMomentsFull = isBaccarat ? baccaratBankingMoments(1e12, baccaratBets, undefined, baccaratPayouts) : null;
  const baccaratCoverageRows = isBaccarat
    ? (["player", "banker", "tie", "pandaKoi", "dragon"] as const)
        .filter((bet) => baccaratBets[bet] > 0)
        .map((bet) => ({
          id: bet,
          name: BACCARAT_BET_LABEL[bet],
          action: baccaratBets[bet],
          payout: baccaratPayouts[bet],
          hitMultiple: baccaratMomentsSettled!.hitMultiple[bet],
          edge: baccaratMomentsSettled!.edges[bet],
          baseEdge: baccaratMomentsFull!.edges[bet],
        }))
    : [];
  const leftoverAfterEvenMoney = Math.max(
    0,
    bankAmount - Math.max(baccaratPlayerAmount, baccaratBankerAmount),
  );
  const leftoverEightSix = Math.max(
    0,
    leftoverAfterEvenMoney - baccaratBets.pandaKoi * baccaratPayouts.pandaKoi,
  );
  const hpcFrogRows = isBaccaratHpc
    ? gameSidebets
        .map((sb) => {
          const kind = matchHpcFrogSidebet(sb.name);
          if (!kind) return null;
          const action = sideActionOf(sb.sidebet_id);
          const payout = hpcFrogPayoutFromRows(kind, paytableRowsOf(sb.sidebet_id));
          const leftover = kind === "eightSix" ? leftoverEightSix : leftoverAfterEvenMoney;
          const cap = hpcFrogCap(leftover, action);
          const hitMultiple = Number.isFinite(cap) ? Math.min(payout, Math.max(0, cap)) : payout;
          return {
            id: sb.sidebet_id,
            name: sb.name,
            kind,
            action,
            payout,
            hitMultiple,
            edge: realizedHpcFrogEdge(kind, payout, cap),
            baseEdge: realizedHpcFrogEdge(kind, payout, Infinity),
            standardEdge: HPC_FROG_STANDARD_EDGE[kind],
            standardPayout: HPC_FROG_PAYOUTS_STANDARD[kind],
            sigma: hpcFrogSigma(kind, payout, cap),
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null)
    : [];
  const hpcFrogLayers = hpcFrogRows
    .filter((row) => row.action > 0)
    .map((row) => ({
      actionOffered: row.action,
      edge: row.edge,
      exposureMult: 1,
      sigma: row.sigma,
    }));
  const baccaratUnderbanked =
    baccaratCoverageRows.some((row) => row.hitMultiple + 0.01 < row.payout) ||
    hpcFrogRows.some((row) => row.action > 0 && row.hitMultiple + 0.01 < row.payout);

  const tripsSidebet = gameSidebets.find((sb) => sb !== bbjSidebet && /trips/i.test(sb.name));
  const tripsOf = (seat: Seat) => (tripsSidebet ? seat.side(tripsSidebet.sidebet_id) : 0);
  const tripsPayouts = tripsSidebet
    ? (tripsPayoutsFromRows(paytableRowsOf(tripsSidebet.sidebet_id)) ?? TRIPS_PAYOUTS_BY_BADBEAT)
    : TRIPS_PAYOUTS_BY_BADBEAT;

  const uthTripsPayouts: Record<TripsHand, number> = (uthTripsSidebet
    ? uthTripsPayoutsFromRows(paytableRowsOf(uthTripsSidebet.sidebet_id))
    : null) ?? { royal: TRIPS_PAYOUTS_BY_BADBEAT.straightFlush, ...TRIPS_PAYOUTS_BY_BADBEAT };
  // Ante/Blind/Play settle first; Trips is paid from what the main bets leave in the tray.
  const uthMainBooked = isUth ? Math.min(baseAction, bankAmount / (game?.exposure_mult || 1)) : 0;
  const uthTripsLeft = Math.max(0, bankAmount - uthMainBooked * (game?.exposure_mult || 1));
  const uthTripsBySeat = perSeat(
    uthTripsSidebet?.sidebet_id,
    (_, size) => realizedUthTripsEdge(uthTripsPayouts, uthTripsLeft / size),
    (_, size) => uthTripsSigma(uthTripsPayouts, uthTripsLeft / size),
  );
  const uthTripsAction = uthTripsBySeat.total;
  const uthTripsCap = uthTripsBySeat.largestSize > 0 ? uthTripsLeft / uthTripsBySeat.largestSize : Infinity;
  const uthTripsEdge = uthTripsBySeat.edge;
  const uthTripsBaseEdge = realizedUthTripsEdge(uthTripsPayouts);
  const uthTripsTopPayout = uthTripsTop(uthTripsPayouts);

  const bbjBySeat = perSeat(
    bbjSidebet?.sidebet_id,
    (seat, size) => realizedBadBeatEdgeAfterTrips(bankAmount, tripsOf(seat), size, bbjPayouts, tripsPayouts),
    (seat, size) => badBeatSigmaAfterTrips(bankAmount, tripsOf(seat), size, bbjPayouts, tripsPayouts),
  );
  // The panel quotes the biggest Bad Beat bettor (capped hardest) with their own Trips bet.
  const bbjSize = bbjBySeat.largestSize;
  const tripsSize = bbjBySeat.largestSeat ? tripsOf(bbjBySeat.largestSeat) : 0;
  const bbjAction = bbjBySeat.total;
  const bbjSfCap = bbjSize > 0 ? badBeatHitMultipleAfterTrips(bankAmount, tripsSize, bbjSize, "straightFlush", tripsPayouts) : Infinity;
  const bbjBaseEdge = realizedBadBeatEdge(BAD_BEAT_PROBABILITIES, Infinity, bbjPayouts);
  const bbjEdge = bbjSidebet && bbjAction > 0 ? bbjBySeat.edge : null;

  const pairPlusSidebet = isThreeCard
    ? gameSidebets.find((sb) => matchThreeCardSidebet(sb.name) === "pairPlus")
    : undefined;
  const sixCardSidebet = isThreeCard
    ? gameSidebets.find((sb) => matchThreeCardSidebet(sb.name) === "sixCard")
    : undefined;
  const pairPlusPayouts = pairPlusSidebet
    ? (pairPlusPayoutsFromRows(paytableRowsOf(pairPlusSidebet.sidebet_id)) ?? PAIR_PLUS_PAYOUTS_CA)
    : PAIR_PLUS_PAYOUTS_CA;
  const sixCardPayouts = sixCardSidebet
    ? (sixCardPayoutsFromRows(paytableRowsOf(sixCardSidebet.sidebet_id)) ?? SIX_CARD_PAYOUTS_TCP6B4)
    : SIX_CARD_PAYOUTS_TCP6B4;
  const anteAction = isThreeCard ? totalMain : 0;
  const anteBooked = isThreeCard ? Math.min(anteAction, bankAmount / tcpExposure) : 0;
  const remainingAfterAnte = Math.max(0, bankAmount - anteBooked * tcpExposure);
  // Each side bet can pay up to what's left after the Antes' worst case, capped per player by their own bet.
  // A big Pair Plus hit and a big 6 Card hit on the same hand are rare; the dealt-card table settles that exactly.
  const pairPlusBySeat = perSeat(
    pairPlusSidebet?.sidebet_id,
    (_, size) => realizedPairPlusEdge(pairPlusPayouts, pairPlusCap(remainingAfterAnte, size)),
    () => 0,
  );
  const sixCardBySeat = perSeat(
    sixCardSidebet?.sidebet_id,
    (_, size) => realizedSixCardEdge(sixCardPayouts, pairPlusCap(remainingAfterAnte, size)),
    () => 0,
  );
  const pairPlusSize = pairPlusBySeat.largestSize;
  const sixCardSize = sixCardBySeat.largestSize;
  const pairPlusAction = pairPlusBySeat.total;
  const sixCardAction = sixCardBySeat.total;
  const pairPlusHitCap = pairPlusSize > 0 ? pairPlusCap(remainingAfterAnte, pairPlusSize) : Infinity;
  const pairPlusTop = Math.max(
    pairPlusPayouts.miniRoyal,
    pairPlusPayouts.straightFlush,
    pairPlusPayouts.trips,
    pairPlusPayouts.straight,
    pairPlusPayouts.flush,
    pairPlusPayouts.pair,
  );
  // (Reserving Pair Plus's worst case before the 6 Card Bonus once left it nothing to pay with: a ~92% "edge".)
  const sixCardHitCap = sixCardSize > 0 ? pairPlusCap(remainingAfterAnte, sixCardSize) : Infinity;
  const pairPlusEdge = pairPlusAction > 0 ? pairPlusBySeat.edge : null;
  const pairPlusBaseEdge = realizedPairPlusEdge(pairPlusPayouts);
  const sixCardEdge = sixCardAction > 0 ? sixCardBySeat.edge : null;
  const sixCardBaseEdge = realizedSixCardEdge(sixCardPayouts);
  const sixCardTop = Math.max(
    sixCardPayouts.royal,
    sixCardPayouts.straightFlush,
    sixCardPayouts.quads,
    sixCardPayouts.fullHouse,
    sixCardPayouts.flush,
    sixCardPayouts.straight,
    sixCardPayouts.trips,
  );

  const twoWayBonusSidebet = isTwoWay ? gameSidebets.find((sb) => matchTwoWayWinnerBonus(sb.name)) : undefined;
  const twoWayBonusRows = twoWayBonusSidebet ? paytableRowsOf(twoWayBonusSidebet.sidebet_id) : [];
  const twoWayBonusLines = twoWayWinnerBonusLinesFromRows(twoWayBonusRows);
  const twoWayBonusPayouts = twoWayWinnerBonusPayoutsFromRows(twoWayBonusRows);
  const twoWayBaseBooked = isTwoWay
    ? Math.min(baseAction, bankAmount / TWO_WAY_WINNER.exposureMult)
    : 0;
  const remainingAfterTwoWayBase = Math.max(
    0,
    bankAmount - twoWayBaseBooked * TWO_WAY_WINNER.exposureMult,
  );
  const twoWayBonusBySeat = perSeat(
    twoWayBonusSidebet?.sidebet_id,
    (_, size) => realizedTwoWayWinnerBonusEdge(twoWayBonusPayouts, twoWayWinnerBonusCap(remainingAfterTwoWayBase, size)),
    (_, size) => twoWayWinnerBonusSigma(twoWayBonusPayouts, twoWayWinnerBonusCap(remainingAfterTwoWayBase, size)),
  );
  const twoWayBonusSize = twoWayBonusBySeat.largestSize;
  const twoWayBonusHitCap =
    twoWayBonusSize > 0 ? twoWayWinnerBonusCap(remainingAfterTwoWayBase, twoWayBonusSize) : Infinity;
  const twoWayBonusTop = twoWayWinnerBonusTop(twoWayBonusPayouts);
  const twoWayBonusEdge = twoWayBonusSize > 0 ? twoWayBonusBySeat.edge : null;
  const twoWayBonusBaseEdge = realizedTwoWayWinnerBonusEdge(twoWayBonusPayouts);
  const twoWayBonusSigmaValue =
    twoWayBonusSize > 0 ? twoWayWinnerBonusSigma(twoWayBonusPayouts, twoWayBonusHitCap) : null;

  const fortuneSidebet = isPaiGow ? gameSidebets.find((sb) => matchFortuneBonus(sb.name)) : undefined;
  const fortuneRows = fortuneSidebet ? paytableRowsOf(fortuneSidebet.sidebet_id) : [];
  const fortuneLines = twoWayWinnerBonusLinesFromRows(fortuneRows);
  const fortunePayouts = twoWayWinnerBonusPayoutsFromRows(fortuneRows, FORTUNE_PAI_GOW_PAYOUTS);
  const paiGowBaseBooked = isPaiGow ? Math.min(baseAction, bankAmount / (game?.exposure_mult || 1)) : 0;
  const remainingAfterPaiGowBase = Math.max(
    0,
    bankAmount - paiGowBaseBooked * (game?.exposure_mult || 1),
  );
  const fortuneBySeat = perSeat(
    fortuneSidebet?.sidebet_id,
    (_, size) => realizedTwoWayWinnerBonusEdge(fortunePayouts, twoWayWinnerBonusCap(remainingAfterPaiGowBase, size)),
    (_, size) => twoWayWinnerBonusSigma(fortunePayouts, twoWayWinnerBonusCap(remainingAfterPaiGowBase, size)),
  );
  const fortuneSize = fortuneBySeat.largestSize;
  const fortuneHitCap = fortuneSize > 0 ? twoWayWinnerBonusCap(remainingAfterPaiGowBase, fortuneSize) : Infinity;
  const fortuneTop = twoWayWinnerBonusTop(fortunePayouts);
  const fortuneEdge = fortuneSize > 0 ? fortuneBySeat.edge : null;
  const fortuneBaseEdge = realizedTwoWayWinnerBonusEdge(fortunePayouts);
  const fortuneSigmaValue = fortuneSize > 0 ? twoWayWinnerBonusSigma(fortunePayouts, fortuneHitCap) : null;

  const sideLayers = [
    ...otherSideLayers,
    ...(uthTripsSidebet && uthTripsAction > 0 && uthTripsEdge !== null
      ? [
          {
            id: uthTripsSidebet.sidebet_id,
            name: uthTripsSidebet.name,
            actionOffered: uthTripsAction,
            edge: uthTripsEdge,
            exposureMult: 1,
            sigma: uthTripsSigma(uthTripsPayouts, uthTripsCap),
            seats: uthTripsBySeat.seats,
          },
        ]
      : []),
    ...(bbjSidebet && bbjAction > 0 && bbjEdge !== null
      ? [
          {
            id: bbjSidebet.sidebet_id,
            name: bbjSidebet.name,
            actionOffered: bbjAction,
            edge: bbjEdge,
            exposureMult: 1,
            sigma: badBeatSigmaAfterTrips(bankAmount, tripsSize, bbjSize, bbjPayouts, tripsPayouts),
            seats: bbjBySeat.seats,
          },
        ]
      : []),
    ...(pairPlusSidebet && pairPlusAction > 0 && pairPlusEdge !== null
      ? [
          {
            id: pairPlusSidebet.sidebet_id,
            name: pairPlusSidebet.name,
            actionOffered: pairPlusAction,
            edge: pairPlusEdge,
            exposureMult: 1,
            // Its swing is part of the dealt-card table SD on the Ante layer.
            sigma: 0,
          },
        ]
      : []),
    ...(sixCardSidebet && sixCardAction > 0 && sixCardEdge !== null
      ? [
          {
            id: sixCardSidebet.sidebet_id,
            name: sixCardSidebet.name,
            actionOffered: sixCardAction,
            edge: sixCardEdge,
            exposureMult: 1,
            sigma: 0,
          },
        ]
      : []),
    ...(twoWayBonusSidebet && twoWayBonusSize > 0 && twoWayBonusEdge !== null && twoWayBonusSigmaValue !== null
      ? [
          {
            id: twoWayBonusSidebet.sidebet_id,
            name: twoWayBonusSidebet.name,
            actionOffered: twoWayBonusBySeat.total,
            edge: twoWayBonusEdge,
            exposureMult: 1,
            sigma: twoWayBonusSigmaValue,
            seats: twoWayBonusBySeat.seats,
          },
        ]
      : []),
    ...(fortuneSidebet && fortuneSize > 0 && fortuneEdge !== null && fortuneSigmaValue !== null
      ? [
          {
            id: fortuneSidebet.sidebet_id,
            name: fortuneSidebet.name,
            actionOffered: fortuneBySeat.total,
            edge: fortuneEdge,
            exposureMult: 1,
            sigma: fortuneSigmaValue,
            seats: fortuneBySeat.seats,
          },
        ]
      : []),
  ];

  // Collection is typed in — it does not scale with coverage, and rooms' schedules are too incomplete
  // (and too casino-specific) to drive a per-game-type calculator.
  const feeBasisTta = isBaccarat
    ? baseAction + baccaratBets.tie + hpcFrogRows.reduce((sum, row) => sum + row.action, 0)
    : isThreeCard
      ? sumSeats((seat) => seat.main * (1 + antePlayExact(tcpRules, tcpBonus, seat.style).raiseRate))
      : baseAction;
  const collection = Math.max(0, num(collectionFee));

  // Three Card: every player's real hand against one dealer hand. EV is exact per player; the table's SD comes
  // from 100,000 dealt rounds settled from the bank (seats share the dealer, side bets ride on the same cards).
  const tcpTable: ThreeCardTable = {
    rules: tcpRules,
    bonus: tcpBonus,
    seats: seats.map((seat) => ({
      ante: seat.main,
      pairPlus: pairPlusSidebet ? seat.side(pairPlusSidebet.sidebet_id) : 0,
      sixCard: sixCardSidebet ? seat.side(sixCardSidebet.sidebet_id) : 0,
      style: seat.style,
    })),
    pairPlusPayouts,
    sixCardPayouts,
  };
  const tcpTableKey = isThreeCard ? JSON.stringify({ bank: bankAmount, table: tcpTable }) : "";
  const tcpTableMoments = useThreeCardTableMoments(tcpTableKey);
  const anteEv = isThreeCard ? sumSeats((seat) => seat.main * antePlayExact(tcpRules, tcpBonus, seat.style).edge) : 0;
  const anteCoverage = anteAction > 0 ? anteBooked / anteAction : 1;
  const threeCardMoments =
    isThreeCard && tcpTableMoments
      ? { ev: anteEv * anteCoverage, variance: tcpTableMoments.variance, ignoreCoverage: true }
      : undefined;

  const result = game
    ? computeBankingEV({
        bank: bankAmount,
        collection,
        base: {
          actionOffered: isBaccarat
            ? baccaratBets.player + baccaratBets.banker + baccaratBets.tie + baccaratBets.dragon + baccaratBets.pandaKoi
            : isThreeCard
              ? anteAction
              : baseAction,
          edge: isThreeCard ? (anteAction > 0 ? anteEv / anteAction : tcpExact.edge) : isTwoWay ? TWO_WAY_WINNER.edge : game.edge_pct,
          exposureMult: isThreeCard ? tcpExposure : game.exposure_mult || 1,
          sigma: isThreeCard ? Math.sqrt(tcpExact.variance) : mainSigmaValue,
          seats:
            isBaccarat || isThreeCard
              ? undefined
              : seats.map((seat) => ({ offered: seatBase(seat), sigma: mainSigmaValue })).filter((row) => row.offered > 0),
          exactMoments: baccaratMomentsSettled
            ? { ev: baccaratMomentsSettled.ev, variance: baccaratMomentsSettled.variance, ignoreCoverage: true }
            : threeCardMoments,
        },
        sides: isBaccarat
          ? hpcFrogLayers
          : sideLayers.map((l) => ({
              actionOffered: l.actionOffered,
              edge: l.edge,
              exposureMult: l.exposureMult,
              sigma: l.sigma,
              seats: "seats" in l ? l.seats : undefined,
            })),
        spots: 1,
        rho: rhoVal,
      })
    : null;

  // A finished simulation is only valid for the inputs it ran on. Key it to those inputs and only show
  // it while the key still matches, so the panel never displays ruin/drawdown that predates an edit.
  const simKey = `${calcId}|${gameId}|${bank}|${JSON.stringify(players)}|${collectionFee}|${mainSigma}|${sideSigma}|${rho}|${roundsPerSession}|${tcpRules}|${tcpBonus}`;
  const simResult = sim && sim.key === simKey ? sim.result : null;

  function runSim() {
    if (!result) return;
    if (isBaccarat) {
      setSim({
        key: simKey,
        result: simulateBaccaratSessions({
          bank: bankAmount,
          collection,
          bets: baccaratBets,
          sessions: SIM_SESSIONS,
          roundsPerSession: Math.max(1, Math.round(num(roundsPerSession, 50))),
          seed: 0x9e3779b1,
          payouts: baccaratPayouts,
        }),
      });
      return;
    }
    if (isThreeCard) {
      // Every round is dealt: the player's real Play/Fold, Pair Plus and 6 Card on the same cards, paid from the
      // running bank in settlement order (Ante/Play, Pair Plus, 6 Card).
      setSim({
        key: simKey,
        result: simulateThreeCardSessions({
          bank: bankAmount,
          collection,
          table: tcpTable,
          sessions: SIM_SESSIONS,
          roundsPerSession: Math.max(1, Math.round(num(roundsPerSession, 50))),
          seed: 0x9e3779b1,
        }),
      });
      return;
    }
    // Each layer's SD already combines every player (their own bets, correlation ρ), so the sim draws one
    // spot per layer with that SD.
    const perDollarSd = (layer: { booked: Decimal; sd: Decimal }) =>
      layer.booked.greaterThan(0) ? layer.sd.dividedBy(layer.booked).toNumber() : 0;
    const layers = [
      { booked: result.base.booked.toNumber(), edge: isTwoWay ? TWO_WAY_WINNER.edge : game!.edge_pct, sigma: perDollarSd(result.base) },
      ...result.sides.map((s, i) => ({ booked: s.booked.toNumber(), edge: sideLayers[i].edge, sigma: perDollarSd(s) })),
    ];
    setSim({
      key: simKey,
      result: simulateSessions({
        bank: bankAmount,
        collection,
        layers,
        spots: 1,
        rho: rhoVal,
        sessions: SIM_SESSIONS,
        roundsPerSession: Math.max(1, Math.round(num(roundsPerSession, 50))),
        seed: 0x9e3779b1,
      }),
    });
  }

  return (
    <main className="mx-auto max-w-lg space-y-5 px-4 pt-4 pb-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">EV &amp; SD calculator</h1>
        <p className="text-sm text-muted">
          One calculator per game, not per casino
          {calcOptions.length ? ` — ${calcOptions.map((option) => option.label).join(", ")}` : ""}. Bet math is the
          same everywhere; type the collection the room is charging this round.
        </p>
      </div>

      <Field label="Game">
        <select
          value={calcId}
          onChange={(e) => {
            setCalcId(e.target.value);
            setPlayers((prev) => prev.map((player) => ({ ...player, sides: {} })));
            setSim(null);
          }}
          className="h-12 w-full rounded-xl border border-border bg-surface-inset px-3 text-base text-foreground outline-none focus:border-emerald-500/70"
        >
          <option value="" disabled>
            Select a game…
          </option>
          {calcOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>

      {!game ? (
        <p className="rounded-2xl border border-dashed border-border bg-surface/50 p-4 text-sm text-muted">
          Choose a game to load its edge, exposure, and side bets. Rooms that spread the same game
          share this calculator.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Buy-in / bank ($)">
              <NumInput value={bank} onChange={setBank} />
            </Field>
            <Field label="Collection / round ($)">
              <NumInput value={collectionFee} onChange={setCollectionFee} />
            </Field>
          </div>
          <p className="-mt-2 text-xs text-muted">
            PD fee this round, not a % of action. Table action{" "}
            <span className="num text-muted-strong">{formatMoney(feeBasisTta)}</span>
            {collectionFee.trim() === "" ? " · blank = $0" : null}.
          </p>

          <section className="space-y-2 rounded-2xl border border-border bg-surface p-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold text-foreground">Players at the table</h2>
              <span className="text-xs text-muted">
                {players.length} · editing Player {active + 1}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {players.map((_, i) => (
                <Chip key={i} active={i === active} onClick={() => setActivePlayer(i)}>
                  Player {i + 1}
                </Chip>
              ))}
              {players.length < MAX_PLAYERS ? (
                <button
                  type="button"
                  onClick={addPlayer}
                  className="min-h-11 rounded-full border border-dashed border-border-strong px-4 text-sm font-medium text-foreground active:bg-surface-raised"
                >
                  + Add player
                </button>
              ) : null}
            </div>
            {players.length > 1 ? (
              <button type="button" onClick={() => removePlayer(active)} className="min-h-9 text-xs text-muted underline active:text-foreground">
                Remove Player {active + 1}
              </button>
            ) : null}
            <p className="text-xs text-muted">
              {isBaccarat
                ? "Everyone bets on the same coup, so the table is exactly the sum of all players' bets."
                : isThreeCard
                  ? "Each player gets their own three cards against the same dealer hand; the table's SD comes from 100,000 dealt rounds."
                  : "Each player plays their own hand. EV adds up; swings combine using the correlation ρ (volatility assumptions), weighted by each player's bet, and each player's side-bet cap uses their own bet."}{" "}
              New players copy the last player&apos;s bets.
            </p>
          </section>

          <Panel
            title={players.length > 1 ? `Main bet · Player ${active + 1}` : "Main bet"}
            subtitle={
              isBaccaratHpc
                ? `HPC cloth · 9/7 30:1 · 9/1 100:1 · exposure ×${game.exposure_mult}`
                : isBaccarat
                ? `8-deck deal · settle each hand · exposure ×${game.exposure_mult}`
                : isThreeCard
                  ? `${tcpRules === "faceUp" ? "CA Face-Up" : `Standard · Ante Bonus ${tcpBonus}`} · ${(tcpExact.edge * 100).toFixed(2)}% of Ante (${((tcpExact.edge / (1 + tcpExact.raiseRate)) * 100).toFixed(2)}% per $ bet) · exposure ×${tcpExposure}`
                  : isTwoWay
                    ? `~${(TWO_WAY_WINNER.edge * 100).toFixed(0)}% skill-leak estimate · two Antes + Play`
                    : isUth
                      ? `edge ${(game.edge_pct * 100).toFixed(3)}% of Ante · exposure ×${game.exposure_mult}`
                      : `edge ${(game.edge_pct * 100).toFixed(3)}% · exposure ×${game.exposure_mult}`
            }
          >
            {isBaccarat ? (
              <>
                <BetRow label="Player line ($)" value={baccaratPlayerAction} onChange={setBaccaratPlayerAction} />
                <BetRow label="Banker line ($)" value={baccaratBankerAction} onChange={setBaccaratBankerAction} />
                {!tieFromSidebet ? (
                  <BetRow label="Tie ($)" value={baccaratTieAction} onChange={setBaccaratTieAction} />
                ) : null}
                {isBaccaratHpc
                  ? gameSidebets
                      .filter((sb) => {
                        const kind = matchHpcFrogSidebet(sb.name);
                        return kind === "nineSeven" || kind === "nineOne";
                      })
                      .map((sb) => {
                        const kind = matchHpcFrogSidebet(sb.name)!;
                        const standard = HPC_FROG_PAYOUTS_STANDARD[kind];
                        const felt = hpcFrogPayoutFromRows(kind, paytableRowsOf(sb.sidebet_id));
                        return (
                          <BetRow
                            key={sb.sidebet_id}
                            label={`${sb.name} ($)`}
                            hint={
                              felt < standard
                                ? `${felt}:1 HPC · standard ${standard}:1`
                                : `${felt}:1`
                            }
                            highlight
                            value={sideSizes[sb.sidebet_id] ?? ""}
                            onChange={(v) => setSideSizes((prev) => ({ ...prev, [sb.sidebet_id]: v }))}
                          />
                        );
                      })
                  : null}
                <p className="text-xs text-muted">
                  Total Player/Banker action = <span className="num text-muted-strong">{formatMoney(baseAction)}</span>
                  {baccaratTieAmount > 0 ? (
                    <>
                      ; Tie = <span className="num text-muted-strong">{formatMoney(baccaratTieAmount)}</span>
                    </>
                  ) : null}
                  {isBaccaratHpc ? (
                    <>
                      . HPC short-pays 9/7 at 30:1 (
                      <span className="text-amber-400">44.1% house</span> vs 8.1% at 50:1) and 9/1 at 100:1 (42.4% vs
                      13.9% at 150:1). Those hits also pay the winning Player/Banker line 1:1 first.
                    </>
                  ) : (
                    <>
                      . Each hand is dealt and paid in filing order (Player, Banker, Tie, Panda/Koi, Dragon) from the
                      buy-in. Dragon 7 does not pay Banker, and collecting Player does not fund the 40:1.
                    </>
                  )}
                </p>
              </>
            ) : isThreeCard ? (
              <>
                <BetRow label="Ante ($)" value={mainSize} onChange={setMainSize} />
                <Choice
                  label="Rules"
                  value={tcpRules}
                  onChange={(v) => setTcpRules(v as ThreeCardRules)}
                  options={[
                    ["faceUp", "Face-Up (1 dealer card up)"],
                    ["standard", "Standard (dealer all down)"],
                  ]}
                />
                {tcpRules === "standard" ? (
                  <Choice
                    label="Ante Bonus (SF / trips / straight)"
                    value={tcpBonus}
                    onChange={(v) => setTcpBonus(v as AnteBonusTable)}
                    options={(Object.keys(ANTE_BONUS) as AnteBonusTable[]).map((key) => [key, key === "none" ? "None" : key])}
                  />
                ) : null}
                <Choice
                  label={`How Player ${active + 1} plays`}
                  value={tcpStyle}
                  onChange={(v) => setTcpStyle(v as PlayerStyle)}
                  options={[
                    ["optimal", "Optimal"],
                    ["mimic", "Copy the dealer (Q-high+)"],
                    ["raiseAll", "Always play"],
                  ]}
                />
                <p className="text-xs text-muted">
                  Ante action = <span className="num text-muted-strong">{formatMoney(anteAction)}</span>. Expected TTA ≈{" "}
                  <span className="num text-muted-strong">
                    {formatMoney(feeBasisTta)}
                  </span>{" "}
                  across the table. Player {active + 1}: {(tcpExact.raiseRate * 100).toFixed(1)}% play rate, edge{" "}
                  {(tcpExact.edge * 100).toFixed(2)}% of Ante ={" "}
                  {((tcpExact.edge / (1 + tcpExact.raiseRate)) * 100).toFixed(2)}% per dollar bet (Ante + Play), exact from
                  every deal.{" "}
                  {tcpRules === "faceUp"
                    ? "One dealer card is up; a non-qualifying dealer pushes the Play and the player must still beat it to win the Ante; no Ante Bonus."
                    : "Dealer cards all down; a non-qualifying dealer pays the Ante; Ante Bonus paid on any played straight or better."}
                </p>
              </>
            ) : isTwoWay ? (
              <>
                <BetRow label="Ante, each of two ($)" value={mainSize} onChange={setMainSize} />
                <BetRow label="Play ($)" value={twoWayPlay} onChange={setTwoWayPlay} />
                <p className="text-xs text-muted">
                  Two Antes posted = <span className="num text-muted-strong">{formatMoney(2 * totalMain)}</span>
                  {twoWayPlayAmount > 0 ? (
                    <>
                      ; Play = <span className="num text-muted-strong">{formatMoney(twoWayPlayAmount)}</span>
                    </>
                  ) : null}
                  . Blackjack Play is 1× Ante; poker Play is 1× or 2×. Base edge is a{" "}
                  <span className="text-amber-400">~5% skill-leak estimate</span> of booked Antes+Play — not solved.
                  Bonus is separate (~10% from the 7-card joker chart).
                </p>
              </>
            ) : isUth ? (
              <>
                <BetRow label="Ante ($)" value={mainSize} onChange={setMainSize} />
                <p className="text-xs text-muted">
                  Ante action = <span className="num text-muted-strong">{formatMoney(baseAction)}</span>. Blind matches the
                  Ante and Play is 1–4×, so the edge and exposure are per $1 of Ante, not of TTA.
                </p>
              </>
            ) : (
              <>
                <BetRow label="Main bet ($)" value={mainSize} onChange={setMainSize} />
                <p className="text-xs text-muted">
                  Base action = <span className="num text-muted-strong">{formatMoney(baseAction)}</span>
                </p>
              </>
            )}
          </Panel>

          <Panel
            title={players.length > 1 ? `Side bets · Player ${active + 1}` : "Side bets"}
            subtitle={isBaccarat ? "TTA · settle last" : "settle last"}
          >
            {gameSidebets.filter((sb) => {
              const frog = matchHpcFrogSidebet(sb.name);
              return frog !== "nineSeven" && frog !== "nineOne";
            }).length === 0 ? (
              <p className="text-xs text-muted">This game has no side bets recorded.</p>
            ) : (
              <div className="space-y-3">
                {gameSidebets
                  .filter((sb) => {
                    const frog = matchHpcFrogSidebet(sb.name);
                    return frog !== "nineSeven" && frog !== "nineOne";
                  })
                  .map((sb) => (
                  <div key={sb.sidebet_id}>
                    <BetRow
                      label={sb.name}
                      hint={
                        unknownEdgeSidebet(sb)
                          ? "edge unknown · not counted"
                          : sb === uthTripsSidebet
                            ? "edge from 7-card counts"
                            : sb === bbjSidebet
                          ? "edge from Monte Carlo"
                          : isBaccarat && matchBaccaratSidebet(sb.name)
                            ? "edge from hand settlement"
                            : matchHpcFrogSidebet(sb.name) === "eightSix"
                              ? "25:1 · any 8 over 6 · 21.8% house"
                              : sb === pairPlusSidebet
                                ? "edge from 22,100-hand combinatorics"
                                : sb === sixCardSidebet
                                  ? "edge from C(52,6)"
                                  : isTwoWay && matchTwoWayWinnerBonus(sb.name)
                                    ? "9.90% to-1 · 7-card joker"
                                    : isPaiGow && matchFortuneBonus(sb.name)
                                      ? "7.77% to-1 · no Envy"
                                      : `edge ${(sb.edge_pct * 100).toFixed(2)}%`
                      }
                      highlight={isHighValueSidebet(sb.name)}
                      value={sideSizes[sb.sidebet_id] ?? ""}
                      onChange={(v) => setSideSizes((prev) => ({ ...prev, [sb.sidebet_id]: v }))}
                    />
                  </div>
                ))}
                <p className="text-xs text-muted">
                  {isBaccarat
                    ? isBaccaratHpc
                      ? "This player's bets; the table is everyone's added up. Dragon, Panda 8, and 8/6 settle after Player/Banker/Tie. 9/7 and 9/1 are on the main panel. Blank = not offered."
                      : "This player's bets; the table is everyone's added up. Dragon and Panda/Koi are paid from the bank left on the hand they actually hit. Blank size = not offered."
                    : isTwoWay || isPaiGow || isThreeCard
                      ? "Computed side bets use coverage, not the stored edge_pct. Blank size = not offered."
                      : "Side bets without their own math use the edge recorded on the game page; a bet with no recorded edge isn't counted. Blank size = not offered."}
                </p>
              </div>
            )}
          </Panel>

          {isBaccarat && (baccaratCoverageRows.length > 0 || isBaccaratHpc) ? (
            <Panel title="Baccarat coverage edges" subtitle={isBaccaratHpc ? "HPC cloth · Wizard p" : "settled per hand"}>
              <div className="space-y-3">
                {baccaratCoverageRows.map((row) => {
                  const raised = row.edge > row.baseEdge + 0.002;
                  const full = row.hitMultiple + 0.01 >= row.payout;
                  return (
                    <div key={row.id} className="space-y-2 rounded-xl border border-border bg-surface-inset px-3 py-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-medium text-foreground">{row.name}</span>
                        <span className="num text-[11px] text-muted">
                          {full
                            ? `pays full ${row.payout}:1 on a hit`
                            : `pays ×${row.hitMultiple.toFixed(1)} of ${row.payout}:1 on a hit`}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <Metric
                          label="Full-coverage edge"
                          value={`${(row.baseEdge * 100).toFixed(row.baseEdge < 0.03 ? 3 : 1)}%`}
                          base="fully banked"
                        />
                        <Metric
                          label="Realized edge (this setup)"
                          value={`${(row.edge * 100).toFixed(row.edge < 0.03 ? 3 : 1)}%`}
                          base={raised ? "raised by underbanking" : "≈ fully banked"}
                          tone={raised ? "warning" : "positive"}
                        />
                      </div>
                    </div>
                  );
                })}
                {hpcFrogRows.filter((row) => row.action > 0).map((row) => {
                    const raised = row.edge > row.baseEdge + 0.002;
                    const shortPay = row.payout < row.standardPayout;
                    const full = row.hitMultiple + 0.01 >= row.payout;
                    return (
                      <div key={row.id} className="space-y-2 rounded-xl border border-border bg-surface-inset px-3 py-3">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-xs font-medium text-foreground">{row.name}</span>
                          <span className="num text-[11px] text-muted">
                            {full
                              ? `pays full ${row.payout}:1 on a hit`
                              : `pays ×${row.hitMultiple.toFixed(1)} of ${row.payout}:1 on a hit`}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <Metric
                            label={shortPay ? `HPC ${row.payout}:1 edge` : "Full-coverage edge"}
                            value={`${(row.baseEdge * 100).toFixed(1)}%`}
                            base={
                              shortPay
                                ? `vs ${(row.standardEdge * 100).toFixed(1)}% at ${row.standardPayout}:1`
                                : "fully banked"
                            }
                            tone={shortPay ? "warning" : undefined}
                          />
                          <Metric
                            label="Realized edge (this setup)"
                            value={`${(row.edge * 100).toFixed(1)}%`}
                            base={raised ? "raised by underbanking" : "≈ fully banked"}
                            tone={raised || shortPay ? "warning" : "positive"}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
              <p className="text-xs text-muted">
                Winners are paid from the buy-in (gross). Collecting losers on the same hand does not increase what
                you can pay — $17k cannot cover a $20k Dragon. Panda 8 pays Player first, then Koi from what is left
                of the tray. Those hits never share a round, so main is not reserved against a Dragon.
              </p>
            </Panel>
          ) : null}

          {uthTripsSidebet && uthTripsAction > 0 && uthTripsEdge !== null ? (
            <Panel title="Trips edge" subtitle="exact · 7-card counts · settles before BBJ">
              <div className="space-y-2 rounded-xl border border-border bg-surface-inset px-3 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-foreground">{uthTripsSidebet.name}</span>
                  <span className="num text-[11px] text-muted">
                    {uthTripsCap + 0.01 >= uthTripsTopPayout
                      ? `pays full ${uthTripsTopPayout}:1 on a hit`
                      : `pays ×${uthTripsCap.toFixed(1)} of ${uthTripsTopPayout}:1 on a hit`}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Metric label="Full-coverage edge" value={`${(uthTripsBaseEdge * 100).toFixed(2)}%`} base="of Trips, fully banked" />
                  <Metric
                    label="Realized edge (this setup)"
                    value={`${(uthTripsEdge * 100).toFixed(2)}%`}
                    base={uthTripsEdge > uthTripsBaseEdge + 0.002 ? "raised by underbanking" : "≈ fully banked"}
                    tone={uthTripsEdge > uthTripsBaseEdge + 0.002 ? "warning" : "positive"}
                  />
                </div>
              </div>
              <ul className="mt-3 space-y-1 text-xs text-foreground">
                {TRIPS_HANDS.filter((hand) => uthTripsPayouts[hand] > 0).map((hand) => (
                  <li key={hand} className="flex justify-between gap-2">
                    <span>{TRIPS_LABELS[hand]}</span>
                    <span className="num text-muted">{uthTripsPayouts[hand]}:1</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">
                Pays on the player&apos;s best five of seven, win or lose. Probabilities are exact counts over all
                133,784,560 seven-card hands; the standard 50-40-30-8-6-5-3 table is 1.90%. Paid from what the
                Ante/Blind/Play leave in the tray.
              </p>
            </Panel>
          ) : null}

          {/* Bad Beat Jackpot — Monte-Carlo edge, computed from coverage rather than a stored constant */}
          {bbjSidebet && bbjAction > 0 && bbjEdge !== null ? (
            <Panel title="Bad Beat Jackpot edge" subtitle="Monte Carlo · Trips then BBJ from the tray">
              <div className="grid grid-cols-2 gap-4">
                <Metric label="Full-coverage edge" value={`${(bbjBaseEdge * 100).toFixed(1)}%`} base="fully banked" />
                <Metric
                  label="Realized edge (this setup)"
                  value={`${(bbjEdge * 100).toFixed(1)}%`}
                  base={bbjEdge > bbjBaseEdge + 0.002 ? "raised by underbanking" : "≈ fully banked"}
                  tone={bbjEdge > bbjBaseEdge + 0.002 ? "warning" : "positive"}
                />
              </div>
              <p className="text-xs text-muted">
                Underbanking is Trips then BBJ from the buy-in — main is not reserved. On a straight-flush hit,
                Trips {tripsSize > 0 ? `(${formatMoney(tripsSize)} × ${tripsPayouts.straightFlush}:1)` : "off"} is paid
                first; the tray then covers{" "}
                <span className="num text-muted-strong">
                  ×{Number.isFinite(bbjSfCap) ? Math.floor(bbjSfCap).toLocaleString() : "∞"}
                </span>{" "}
                of 7,500:1. Validated ~14.8% fully banked; edge rises when a line cannot be paid in full.
              </p>
            </Panel>
          ) : null}

          {isThreeCard && (pairPlusAction > 0 || sixCardAction > 0) ? (
            <Panel title="Three Card coverage edges" subtitle="combinatorics · settle last">
              <div className="space-y-3">
                {pairPlusAction > 0 && pairPlusEdge !== null ? (
                  <div className="space-y-2 rounded-xl border border-border bg-surface-inset px-3 py-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-medium text-foreground">Pair Plus</span>
                      <span className="num text-[11px] text-muted">
                        {pairPlusHitCap + 0.01 >= pairPlusTop
                          ? `pays full ${pairPlusTop}:1 on a hit`
                          : `pays ×${pairPlusHitCap.toFixed(1)} of ${pairPlusTop}:1 on a hit`}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Metric
                        label="Full-coverage edge"
                        value={`${(pairPlusBaseEdge * 100).toFixed(2)}%`}
                        base="fully banked"
                      />
                      <Metric
                        label="Realized edge (this setup)"
                        value={`${(pairPlusEdge * 100).toFixed(2)}%`}
                        base={pairPlusEdge > pairPlusBaseEdge + 0.002 ? "raised by underbanking" : "≈ fully banked"}
                        tone={pairPlusEdge > pairPlusBaseEdge + 0.002 ? "warning" : "positive"}
                      />
                    </div>
                  </div>
                ) : null}
                {sixCardAction > 0 && sixCardEdge !== null ? (
                  <div className="space-y-2 rounded-xl border border-border bg-surface-inset px-3 py-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-medium text-foreground">6 Card Bonus</span>
                      <span className="num text-[11px] text-muted">
                        {sixCardHitCap + 0.01 >= sixCardTop
                          ? `pays full ${sixCardTop}:1 on a hit`
                          : `pays ×${sixCardHitCap.toFixed(1)} of ${sixCardTop}:1 on a hit`}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Metric
                        label="Full-coverage edge"
                        value={`${(sixCardBaseEdge * 100).toFixed(2)}%`}
                        base="fully banked"
                      />
                      <Metric
                        label="Realized edge (this setup)"
                        value={`${(sixCardEdge * 100).toFixed(2)}%`}
                        base={sixCardEdge > sixCardBaseEdge + 0.002 ? "raised by underbanking" : "≈ fully banked"}
                        tone={sixCardEdge > sixCardBaseEdge + 0.002 ? "warning" : "positive"}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
              <p className="text-xs text-muted">
                Pair Plus is the player&apos;s three cards (22,100 equally likely hands). 6 Card Bonus is the best
                five-card hand from the player&apos;s 3 + dealer 3 (C(52,6)). Ante/Play settle first; Pair Plus is paid
                next, then 6 Card from what is left of the tray. Default Pair Plus is the CA Mini Royal 200:1 table
                (~4.38%); 6 Card is BGC TCP-6B4 (~8.56%). Felt rows override. ρ ≈ 0.5 is an estimate (common dealer
                upcard).
              </p>
            </Panel>
          ) : null}

          {isTwoWay && twoWayBonusSize > 0 && twoWayBonusEdge !== null ? (
            <Panel title="Two Way Winner bonus" subtitle="7-card joker · settle last">
              <div className="space-y-2 rounded-xl border border-border bg-surface-inset px-3 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-foreground">Bonus</span>
                  <span className="num text-[11px] text-muted">
                    {twoWayBonusHitCap + 0.01 >= twoWayBonusTop
                      ? `pays full ${twoWayBonusTop.toLocaleString()}:1 on a hit`
                      : `pays ×${twoWayBonusHitCap.toFixed(1)} of ${twoWayBonusTop.toLocaleString()}:1 on a hit`}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Metric
                    label="Full-coverage edge"
                    value={`${(twoWayBonusBaseEdge * 100).toFixed(2)}%`}
                    base="fully banked"
                  />
                  <Metric
                    label="Realized edge (this setup)"
                    value={`${(twoWayBonusEdge * 100).toFixed(2)}%`}
                    base={twoWayBonusEdge > twoWayBonusBaseEdge + 0.002 ? "raised by underbanking" : "≈ fully banked"}
                    tone={twoWayBonusEdge > twoWayBonusBaseEdge + 0.002 ? "warning" : "positive"}
                  />
                </div>
              </div>
              <ul className="mt-3 space-y-1 text-xs text-foreground">
                {(twoWayBonusLines.length > 0
                  ? twoWayBonusLines
                  : TWO_WAY_BONUS_HANDS.filter((hand) => twoWayBonusPayouts[hand] > 0).map((hand) => ({
                      outcome: TWO_WAY_BONUS_LABELS[hand],
                      payout: twoWayBonusPayouts[hand],
                    }))
                ).map((line) => (
                  <li key={line.outcome} className="flex justify-between gap-2">
                    <span>{line.outcome}</span>
                    <span className="num text-muted">{line.payout}:1</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">
                7-card hand from a 53-card deck (2 hole + 5 community). Combination counts are Wizard Fortune Pai
                Gow. Felt is 5000/750/250/100/50/20/5/4/3/2, no Royal Match, three pair loses —{" "}
                <span className="text-muted-strong">9.90% to-1</span>. The same numbers booked for-1 would be 29.09%.
                Cloth prints to 1. Antes/Play settle first; Bonus is paid from what is left of the tray. The ~5%
                base is a skill-leak estimate and is not derived from this chart.
              </p>
            </Panel>
          ) : null}

          {isPaiGow && fortuneSize > 0 && fortuneEdge !== null ? (
            <Panel title="Fortune Bonus" subtitle="7-card joker · settle last · no Envy">
              <div className="space-y-2 rounded-xl border border-border bg-surface-inset px-3 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-foreground">Fortune</span>
                  <span className="num text-[11px] text-muted">
                    {fortuneHitCap + 0.01 >= fortuneTop
                      ? `pays full ${fortuneTop.toLocaleString()}:1 on a hit`
                      : `pays ×${fortuneHitCap.toFixed(1)} of ${fortuneTop.toLocaleString()}:1 on a hit`}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Metric
                    label="Full-coverage edge"
                    value={`${(fortuneBaseEdge * 100).toFixed(2)}%`}
                    base="fully banked"
                  />
                  <Metric
                    label="Realized edge (this setup)"
                    value={`${(fortuneEdge * 100).toFixed(2)}%`}
                    base={fortuneEdge > fortuneBaseEdge + 0.002 ? "raised by underbanking" : "≈ fully banked"}
                    tone={fortuneEdge > fortuneBaseEdge + 0.002 ? "warning" : "positive"}
                  />
                </div>
              </div>
              <ul className="mt-3 space-y-1 text-xs text-foreground">
                {(fortuneLines.length > 0
                  ? fortuneLines
                  : TWO_WAY_BONUS_HANDS.filter((hand) => fortunePayouts[hand] > 0).map((hand) => ({
                      outcome: TWO_WAY_BONUS_LABELS[hand],
                      payout: fortunePayouts[hand],
                    }))
                ).map((line) => (
                  <li key={line.outcome} className="flex justify-between gap-2">
                    <span>{line.outcome}</span>
                    <span className="num text-muted">{line.payout}:1</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">
                Same 7-card / 53-card counts as the 2WW bonus. Default is Wizard Fortune pay table 2 (8000 / Royal
                Match 2000 / 1000 / 400 / 150 / 50 / 25 / 5 / 4 / 3 / 2) — 7.77% to-1. Envy is not in this number;
                it is extra PD liability if other seats have Fortune posted. Send the envy schedule and seat count
                if you want it.
              </p>
            </Panel>
          ) : null}

          {/* Assumptions */}
          <button
            onClick={() => setShowAssumptions((v) => !v)}
            className="text-xs font-medium text-emerald-400"
          >
            {showAssumptions ? "− Hide" : "+ Show"} volatility assumptions
          </button>
          {showAssumptions ? (
            <Panel title="Assumptions (estimates)">
              <div className="grid grid-cols-3 gap-3">
                <BetRow label="Main σ / $1" value={mainSigma} onChange={setMainSigma} />
                <BetRow label="Side σ / $1" value={sideSigma} onChange={setSideSigma} />
                <BetRow label="Correlation ρ" value={rho} onChange={setRho} />
              </div>
              <p className="text-xs text-muted">
                σ is the per-$1 standard deviation of a wager outcome; ρ is the cross-seat correlation (an estimate,
                not solved). Side-bet variance uses a normal approximation and understates rare high-payout tails.
              </p>
            </Panel>
          ) : null}

          {/* Analytic results */}
          {result ? (
            <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
              <div className="grid grid-cols-2 gap-4">
                <Metric
                  label="EV / round"
                  value={formatMoney(result.ev)}
                  tone={result.ev.isZero() ? "neutral" : result.ev.isNegative() ? "negative" : "positive"}
                  size="lg"
                />
                <Metric label="SD / round" value={formatMoney(result.sd)} size="lg" />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border bg-surface-inset px-3 py-2">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Coverage</span>
                <span className={`num text-sm font-semibold ${(isBaccarat ? !baccaratUnderbanked : result.fullyBanked) ? "text-emerald-400" : "text-amber-400"}`}>
                  {isBaccarat
                    ? baccaratUnderbanked
                      ? "underbanked on a hit"
                      : "hits fully paid"
                    : `${result.coveragePct.times(100).toFixed(1)}%${result.fullyBanked ? "" : " · underbanked"}`}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Metric label="N₀ (rounds to 1 SD)" value={result.n0.isFinite() ? Math.round(result.n0.toNumber()).toLocaleString() : "∞"} />
                <Metric
                  label="Long-run risk of ruin"
                  value={`${result.riskOfRuin.times(100).toFixed(result.riskOfRuin.greaterThan(0.001) ? 1 : 3)}%`}
                  hint="exp(−2·EV·B/σ²), no time limit"
                  tone={result.riskOfRuin.greaterThan(0.1) ? "warning" : "neutral"}
                />
                <Metric label="Full-Kelly bank" value={result.kellyBank.isFinite() ? formatMoney(result.kellyBank) : "∞"} hint="σ²/EV" />
                <Metric
                  label="Breakeven action"
                  value={collection === 0 ? "—" : result.breakevenActionBase.isFinite() ? formatMoney(result.breakevenActionBase) : "∞"}
                  hint={collection === 0 ? "enter a collection" : "C/edge, base"}
                />
              </div>
              {!isBaccarat ? (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Where the EV comes from</p>
                  <div className="divide-y divide-border rounded-xl border border-border bg-surface-inset text-xs">
                    {[
                      { name: isThreeCard || isUth || isTwoWay ? "Ante / main" : "Main bet", layer: result.base },
                      ...result.sides.map((layer, i) => ({ name: sideLayers[i]?.name ?? "Side bet", layer })),
                    ].map(({ name, layer }) => (
                      <div key={name} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="min-w-0">
                          <span className="block truncate text-foreground">{name}</span>
                          <span className="num text-muted">
                            {formatMoney(layer.booked)} of {formatMoney(layer.offered)} booked
                          </span>
                        </span>
                        <span className={`num shrink-0 font-semibold ${layer.ev.isNegative() ? "text-red-400" : "text-foreground"}`}>
                          {formatMoney(layer.ev)}
                        </span>
                      </div>
                    ))}
                    {collection > 0 ? (
                      <div className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="text-foreground">Collection</span>
                        <span className="num font-semibold text-red-400">{formatMoney(-collection)}</span>
                      </div>
                    ) : null}
                  </div>
                  {!isThreeCard ? (
                    <p className="text-xs text-muted">
                      SD treats the main bet as σ {mainSigmaValue} per $1 — an estimate, not solved for this game. Change
                      it under volatility assumptions.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Monte Carlo</h2>
                <p className="text-xs text-muted">{SIM_SESSIONS.toLocaleString()} sessions</p>
              </div>
              <div className="flex items-end gap-2">
                <label className="block">
                  <span className="text-[11px] text-muted">Rounds / session</span>
                  <NumInput value={roundsPerSession} onChange={setRoundsPerSession} className="h-10 w-24" />
                </label>
                <Button className="h-10 px-4 text-sm" onClick={runSim} disabled={!result}>
                  Run
                </Button>
              </div>
            </div>

            {simResult ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <Metric label="EV / round (sim)" value={formatMoney(simResult.evPerRound)} tone={simResult.evPerRound < 0 ? "negative" : "positive"} />
                  <Metric label="SD / round (sim)" value={formatMoney(simResult.sdPerRound)} />
                  <Metric
                    label="Ruin within the session"
                    value={`${(simResult.riskOfRuin * 100).toFixed(1)}%`}
                    hint={`over ${Math.max(1, Math.round(num(roundsPerSession, 50)))} rounds`}
                    tone={simResult.riskOfRuin > 0.1 ? "warning" : "neutral"}
                  />
                  <Metric label="Median session P&L" value={formatMoney(simResult.medianSessionPnl)} tone={simResult.medianSessionPnl < 0 ? "negative" : "positive"} />
                  <Metric label="P5 – P95 session" value={`${formatMoney(simResult.p5SessionPnl)} … ${formatMoney(simResult.p95SessionPnl)}`} />
                  <Metric label="Median max drawdown" value={formatMoney(simResult.medianMaxDrawdown)} />
                </div>
                <p className="text-xs text-muted">
                  {isBaccarat
                    ? "Each round is a dealt hand settled from the running bank (Player, Banker, Tie, Panda/Koi, Dragon), minus collection. Ruin is the bank touching zero; coverage gets worse as the stack shrinks."
                    : isThreeCard
                    ? "Each round is dealt from a single deck: the player plays or folds by the chosen style, and Pair Plus and the 6 Card Bonus are judged on the same cards, so long-shot wins and their overlap with the Ante are real, not a normal curve. Paid from the running bank (Ante/Play, then Pair Plus, then 6 Card), minus collection; the sim EV can sit a little above the analytic one when the bank is too short to pay a big hit."
                    : "The simulated EV should match the analytic EV above (a consistency check); the value the sim adds is the distribution — ruin, drawdown, and the P5–P95 spread over a finite session. Normal-approximation caveat applies to side-bet tails."}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted">Run to estimate ruin, drawdown, and the session P&amp;L spread for this setup.</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function Choice({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-xl border border-border bg-surface-inset px-3 text-sm text-foreground outline-none focus:border-emerald-500/70"
      >
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </label>
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

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {subtitle ? <span className="num text-xs text-muted">{subtitle}</span> : null}
      </div>
      {children}
    </section>
  );
}

function NumInput({ value, onChange, className = "" }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      inputMode="decimal"
      className={`num h-12 w-full rounded-xl border border-border bg-surface-inset px-3 text-base text-foreground outline-none focus:border-emerald-500/70 ${className}`}
    />
  );
}

function BetRow({
  label,
  hint,
  value,
  onChange,
  highlight = false,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  highlight?: boolean;
}) {
  return (
    <label
      className={`block space-y-1 ${
        highlight ? "rounded-xl border border-lime-400/40 bg-lime-500/10 px-3 py-2" : ""
      }`}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className={`text-xs ${highlight ? "font-medium text-lime-300" : "text-foreground"}`}>{label}</span>
        {hint ? <span className="num text-[11px] text-muted">{hint}</span> : null}
      </span>
      <NumInput value={value} onChange={onChange} className="h-11" />
    </label>
  );
}
