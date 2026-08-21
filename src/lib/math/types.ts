export interface CorrelationAssumption {
  rho: number;
  /** Always true here — these are estimates, not solved values (per CLAUDE.md). Surface this in the UI wherever rho is used. */
  isEstimate: true;
  note: string;
}

/** rho ~= 0.5 for blackjack and UTH (common dealer hand / common board). Estimate, not a solved value. */
export const BLACKJACK_UTH_CORRELATION: CorrelationAssumption = {
  rho: 0.5,
  isEstimate: true,
  note: "rho ~= 0.5 estimate for common dealer hand / common board games (blackjack, UTH). Not a solved value.",
};
