import type { ClientInboxAnalysis } from "../types/ui";
import { formatScoreText } from "../utils/formatters";
import { ClientInboxIcon } from "./ClientInboxIcon";

type AnalysisPanelProps = {
  analysis: ClientInboxAnalysis;
};

export function AnalysisPanel({ analysis }: AnalysisPanelProps) {
  return (
    <section className="client-ai-card" aria-label="Analyse Syrantis">
      <div className="client-card-header">
        <h2 className="client-card-title">
          <ClientInboxIcon className="violet" name="spark" />
          Analyse Syrantis
        </h2>
        <ClientInboxIcon className="small muted" name="chevronUp" />
      </div>
      <div className="client-card-body client-analysis-grid">
        <div className="client-analysis-row">
          <ClientInboxIcon className="small blue" name="tag" />
          <span className="client-analysis-label">Intention</span>
          <span>{analysis.intentText}</span>
        </div>
        <div className="client-analysis-row">
          <ClientInboxIcon className="small blue" name="clock" />
          <span className="client-analysis-label">Urgence</span>
          <span>{analysis.urgencyText}</span>
        </div>
        <div className="client-analysis-row">
          <ClientInboxIcon className="small blue" name="spark" />
          <span className="client-analysis-label">Action recommandée</span>
          <span>{analysis.recommendedAction}</span>
        </div>
        <div className="client-analysis-row">
          <ClientInboxIcon className="small blue" name="chart" />
          <span className="client-analysis-label">Score</span>
          <span>{formatScoreText(analysis.score, analysis.scoreBand)}</span>
        </div>
        <div className="client-analysis-row">
          <ClientInboxIcon className="small blue" name="check" />
          <span className="client-analysis-label">Confiance</span>
          <div className="client-confidence">
            <span>{analysis.confidence}%</span>
            <span className="client-confidence-bar">
              <span style={{ width: `${analysis.confidence}%` }} />
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
