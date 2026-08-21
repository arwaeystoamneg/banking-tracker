import { Badge } from "@/components/ui/Badge";

/**
 * Never render an unverified number as if it were solved (CLAUDE.md conventions). Every screen that
 * shows an edge_pct/paytable value pairs it with this badge so the estimate status is always visible.
 */
export function VerifiedBadge({ verified }: { verified: boolean }) {
  return verified ? <Badge tone="accent">Verified</Badge> : <Badge tone="warning">Unverified — estimate</Badge>;
}
