import type { ClientInboxScoreBand } from "../types/ui";
import { formatScoreText } from "../utils/formatters";

type ScoreBadgeProps = {
  score: number | null;
  scoreBand: ClientInboxScoreBand;
};

export function ScoreBadge({ score, scoreBand }: ScoreBadgeProps) {
  const tone = scoreBand === "ignored" ? "ignored" : scoreBand;

  return <span className={`client-badge ${tone}`}>{formatScoreText(score, scoreBand)}</span>;
}
