# hallucinate-check

Heuristic hallucination detection for Node.js. Analyzes LLM-generated text for common hallucination signals without requiring external API calls.

## Install

```bash
npm install hallucinate-check
```

## Quick Start

```typescript
import { check, createChecker } from 'hallucinate-check'

// One-shot check
const report = check('The Eiffel Tower was built in 1889 and stands 330 metres tall.')
console.log(report.pass)       // true
console.log(report.composite)  // 0.0–1.0 (higher = more reliable)

// Reusable checker with default config
const checker = createChecker({ passThreshold: 0.8 })
const r = checker.check('Definitely, without question, the Earth is 100% flat.')
console.log(r.pass)  // false — overconfidence phrases detected
```

## Detection Methods

| Method | Description | Default Weight |
|---|---|---|
| `confidence-language` | Detects hedging (uncertain) and overconfidence phrases | 0.15 |
| `fabricated-entities` | Flags placeholder/example domain URLs and suspicious citations | 0.20 |
| `internal-consistency` | Finds antonym-based contradictions across claims | 0.15 |
| `source-grounding` | Checks entity presence in provided source documents | 0.30 |
| `numerical-plausibility` | Validates numerical claims for plausibility | 0.10 |

By default only `confidence-language`, `fabricated-entities`, and `internal-consistency` are enabled.

## API

### `check(text, options?): HallucinationReport`

Analyze a text string for hallucination signals.

### `createChecker(config?): Checker`

Create a reusable checker instance with default configuration.

### `extractClaims(text): Claim[]`

Extract individual factual claims from a text string.

## Options

```typescript
interface CheckOptions {
  sources?: SourceDocument[]        // Source documents for grounding checks
  passThreshold?: number            // Score threshold for pass/fail (default: 0.7)
  methods?: DetectionMethod[]       // Which detectors to run
  weights?: Partial<Record<DetectionMethod, number>>  // Override default weights
}
```

## Report Structure

```typescript
interface HallucinationReport {
  text: string
  composite: number          // Weighted composite score (0–1)
  passThreshold: number
  pass: boolean              // composite >= passThreshold
  claimAssessments: ClaimAssessment[]
  methodScores: Partial<Record<DetectionMethod, number>>
  durationMs: number
}
```

Each `ClaimAssessment` includes a `classification` of `'supported'`, `'uncertain'`, or `'likely-hallucinated'`.

## Source Grounding

Pass source documents to enable entity-level grounding checks:

```typescript
const report = check(responseText, {
  sources: [{ id: 'doc1', text: 'The Eiffel Tower is in Paris, France.' }],
  methods: ['fabricated-entities'],
})
```

## License

MIT
