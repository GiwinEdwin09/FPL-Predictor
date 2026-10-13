import { describeConfidence, outcomeLabel, type Confidence } from "@/lib/confidence";
import type { FixtureProbabilities } from "@/lib/dashboard";

const CONFIDENCE_CLASS: Record<Confidence["level"], string> = {
  "strong-favorite": "conf-strong-favorite",
  favorite: "conf-favorite",
  "slight-edge": "conf-slight-edge",
  "too-close": "conf-too-close",
};

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <span className={`conf-badge ${CONFIDENCE_CLASS[confidence.level]}`}>
      {confidence.label}
    </span>
  );
}

/**
 * The model's call for a fixture, stated once: the pick plus how strongly it
 * leans ("ARS win · Slight edge"), or just "Too close to call".
 */
export function ModelVerdict({
  probabilities,
  homeShort,
  awayShort,
}: {
  probabilities: FixtureProbabilities;
  homeShort: string;
  awayShort: string;
}) {
  const confidence = describeConfidence(probabilities);
  return (
    <span className="model-verdict">
      {confidence.pick !== null ? (
        <span className="model-verdict-pick">{outcomeLabel(confidence.pick, homeShort, awayShort)}</span>
      ) : null}
      <ConfidenceBadge confidence={confidence} />
    </span>
  );
}

type VerdictState = "correct" | "incorrect" | "upset";

const VERDICT_META: Record<VerdictState, { className: string; icon: string; label: string }> = {
  correct: { className: "verdict-correct", icon: "✓", label: "Correct prediction" },
  incorrect: { className: "verdict-incorrect", icon: "✕", label: "Incorrect prediction" },
  upset: { className: "verdict-upset", icon: "⚡", label: "Upset — model missed" },
};

export function ResultBadge({
  state,
  label,
}: {
  state: VerdictState;
  label?: string;
}) {
  const meta = VERDICT_META[state];
  return (
    <span className={`verdict-badge ${meta.className}`} role="status">
      <span aria-hidden="true">{meta.icon}</span>
      {label ?? meta.label}
    </span>
  );
}
