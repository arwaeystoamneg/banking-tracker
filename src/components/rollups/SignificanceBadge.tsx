import { Badge } from "@/components/ui/Badge";

export function SignificanceBadge({ isMeaningful, tStat }: { isMeaningful: boolean; tStat: number }) {
  if (!isMeaningful) {
    return <Badge tone="warning">Not yet meaningful (|t| = {Math.abs(tStat).toFixed(2)})</Badge>;
  }
  return <Badge tone="accent">Statistically meaningful (|t| = {Math.abs(tStat).toFixed(2)})</Badge>;
}
