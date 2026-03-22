# hallucinate-check

Heuristic hallucination detection for LLM-generated text in Node.js.

[![npm version](https://img.shields.io/npm/v/hallucinate-check.svg)](https://www.npmjs.com/package/hallucinate-check)
[![license](https://img.shields.io/npm/l/hallucinate-check.svg)](https://github.com/SiluPanda/hallucinate-check/blob/master/LICENSE)
[![node](https://img.shields.io/node/v/hallucinate-check.svg)](https://nodejs.org)

---

## Description

`hallucinate-check` analyzes LLM-generated text for common hallucination signals without requiring external API calls, model inference, or network access. It extracts individual claims from the text, runs each claim through multiple heuristic detection methods -- confidence language analysis, fabricated entity detection, and internal consistency checking -- and produces a structured hallucination report with a composite 0--1 score, per-claim assessments, per-method scores, and detailed findings with character-offset locations and severities.

The same input always produces the same output. There are no LLM calls, no embedding models, no external service dependencies. The package depends only on `fastest-levenshtein` for edit distance computation; all other algorithms use built-in JavaScript capabilities.

This library is designed as a fast, deterministic, zero-cost first-pass filter. It catches the structural, pattern-based hallucination indicators -- fabricated URLs, placeholder domains, overconfidence phrases, hedging density, internal contradictions -- in microseconds. Subtle factual errors that require deep semantic understanding are outside its scope; for those, combine this package's output with an LLM-as-judge or NLI-based verification pipeline.

---

## Installation

```bash
npm install hallucinate-check
```

Requires Node.js >= 18.

---

## Quick Start

```typescript
import { check, createChecker } from 'hallucinate-check';

// One-shot check
const report = check('The Eiffel Tower was built in 1889 and stands 330 metres tall.');
console.log(report.pass);       // true
console.log(report.composite);  // 0.0-1.0 (higher = more trustworthy)

// Reusable checker with custom threshold
const checker = createChecker({ passThreshold: 0.8 });
const r = checker.check('Definitely, without question, the Earth is 100% flat.');
console.log(r.pass);  // false -- overconfidence phrases detected
```

---

## Features

- **Claim-level granularity.** Text is decomposed into individual claims. Each claim receives its own hallucination score and classification (`supported`, `uncertain`, or `likely-hallucinated`), enabling surgical intervention on specific sentences.

- **Three detection methods.**
  - **Confidence language** -- detects hedging phrases ("I think", "probably", "as far as I know") and overconfidence phrases ("definitely", "without question", "all studies show").
  - **Fabricated entities** -- flags placeholder/example domain URLs (`example.com`, `test.com`), suspiciously deep URL paths, and implausible academic citation years. When source documents are provided, cross-references named entities against sources using Levenshtein similarity.
  - **Internal consistency** -- finds antonym-based contradictions across claims within the same text (e.g., "the population always increases" vs. "the population never increases"). Detects both direct contradictions (high textual similarity with opposing terms) and numerical contradictions (shared numbers with conflicting directional language).

- **Source grounding.** Pass source documents to verify that named entities in the response appear in the reference material. Entities not found in sources are flagged as potentially fabricated.

- **Weighted composite scoring.** Each detection method contributes to a single 0--1 composite score via configurable weights. The score and a configurable threshold determine a pass/fail verdict.

- **Detailed findings.** Every detected issue is reported as a `Finding` with the detection method, severity (`info`, `warning`, `critical`), human-readable description, and character-offset location in the original text.

- **Zero external dependencies at runtime** beyond `fastest-levenshtein`. No API keys, no network calls, no model inference.

- **Deterministic.** The same input always produces the same output.

---

## API Reference

### `check(text, options?)`

Analyze a text string for hallucination signals.

```typescript
function check(text: string, options?: CheckOptions): HallucinationReport;
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `text` | `string` | The LLM-generated text to analyze. |
| `options` | `CheckOptions` | Optional configuration for this check. |

**Returns:** `HallucinationReport`

```typescript
const report = check('Paris is the capital of France.', {
  passThreshold: 0.8,
  methods: ['confidence-language', 'fabricated-entities'],
});
```

---

### `createChecker(config?)`

Create a reusable checker instance with default configuration. Per-call options override the factory configuration.

```typescript
function createChecker(config?: CheckerConfig): Checker;
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `config` | `CheckerConfig` | Default configuration applied to every check. |

**Returns:** `Checker`

The `Checker` interface exposes two methods:

| Method | Signature | Description |
|--------|-----------|-------------|
| `check` | `(text: string, options?: CheckOptions) => HallucinationReport` | Run hallucination detection. Per-call options merge with and override factory defaults. |
| `extractClaims` | `(text: string) => Claim[]` | Extract claims from text without running detection. |

```typescript
const checker = createChecker({
  passThreshold: 0.8,
  methods: ['confidence-language', 'internal-consistency'],
  weights: { 'confidence-language': 0.4, 'internal-consistency': 0.6 },
});

const report = checker.check(responseText);
const claims = checker.extractClaims(responseText);
```

---

### `extractClaims(text)`

Extract individual claims from a text string. Each claim corresponds to a sentence, classified as factual or non-factual based on heuristic indicators.

```typescript
function extractClaims(text: string): Claim[];
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `text` | `string` | The text to decompose into claims. |

**Returns:** `Claim[]`

Non-factual content is still returned in the array (with `isFactual: false`) but is excluded from hallucination scoring. Sentences classified as non-factual include questions, short fragments (fewer than 5 words), hedging-only phrases, and disclaimer lines.

```typescript
import { extractClaims } from 'hallucinate-check';

const claims = extractClaims('The Eiffel Tower was built in 1889. What year was that?');
// claims[0].isFactual === true
// claims[1].isFactual === false
```

---

## Types

### `CheckOptions`

```typescript
interface CheckOptions {
  sources?: SourceDocument[];
  passThreshold?: number;
  methods?: DetectionMethod[];
  weights?: Partial<Record<DetectionMethod, number>>;
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `sources` | `SourceDocument[]` | `undefined` | Source documents for entity grounding checks. |
| `passThreshold` | `number` | `0.7` | Composite score threshold for pass/fail. |
| `methods` | `DetectionMethod[]` | `['confidence-language', 'fabricated-entities', 'internal-consistency']` | Which detection methods to run. |
| `weights` | `Partial<Record<DetectionMethod, number>>` | See below | Override default weights for specific methods. |

---

### `CheckerConfig`

Extends `CheckOptions`. Passed to `createChecker()` to set defaults for all subsequent checks on that instance.

```typescript
interface CheckerConfig extends CheckOptions {}
```

---

### `HallucinationReport`

```typescript
interface HallucinationReport {
  text: string;
  composite: number;
  passThreshold: number;
  pass: boolean;
  claimAssessments: ClaimAssessment[];
  methodScores: Partial<Record<DetectionMethod, number>>;
  durationMs: number;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `text` | `string` | The original input text. |
| `composite` | `number` | Weighted composite score in the range [0, 1]. Higher means more trustworthy. |
| `passThreshold` | `number` | The threshold used for the pass/fail determination. |
| `pass` | `boolean` | `true` if `composite >= passThreshold`. |
| `claimAssessments` | `ClaimAssessment[]` | Per-claim hallucination assessment. |
| `methodScores` | `Partial<Record<DetectionMethod, number>>` | Score produced by each enabled detection method. |
| `durationMs` | `number` | Wall-clock time for the check in milliseconds. |

---

### `ClaimAssessment`

```typescript
interface ClaimAssessment {
  claim: Claim;
  hallucScore: number;
  classification: ClaimClassification;
  findings: Finding[];
  methodScores: Partial<Record<DetectionMethod, number>>;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `claim` | `Claim` | The claim being assessed. |
| `hallucScore` | `number` | Per-claim score in [0, 1]. Higher means more trustworthy. |
| `classification` | `ClaimClassification` | `'supported'` (>= 0.7), `'uncertain'` (0.4--0.69), or `'likely-hallucinated'` (< 0.4). |
| `findings` | `Finding[]` | Findings specific to this claim. |
| `methodScores` | `Partial<Record<DetectionMethod, number>>` | Per-method scores for this claim. |

---

### `Claim`

```typescript
interface Claim {
  text: string;
  sentence: string;
  startOffset: number;
  endOffset: number;
  isFactual: boolean;
  index: number;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `text` | `string` | The claim text. |
| `sentence` | `string` | The source sentence. |
| `startOffset` | `number` | Character offset of the claim start in the original text. |
| `endOffset` | `number` | Character offset of the claim end in the original text. |
| `isFactual` | `boolean` | Whether heuristics classify this sentence as a factual assertion. |
| `index` | `number` | Sequential index of this claim in the extraction order. |

---

### `Finding`

```typescript
interface Finding {
  claimIndex: number;
  method: DetectionMethod;
  severity: Severity;
  description: string;
  location: { start: number; end: number };
}
```

| Field | Type | Description |
|-------|------|-------------|
| `claimIndex` | `number` | Index of the associated claim, or `-1` for text-level findings. |
| `method` | `DetectionMethod` | The detection method that produced this finding. |
| `severity` | `Severity` | `'info'`, `'warning'`, or `'critical'`. |
| `description` | `string` | Human-readable description of the issue. |
| `location` | `{ start: number; end: number }` | Character offsets in the original text. |

---

### `SourceDocument`

```typescript
interface SourceDocument {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique identifier for the source document. |
| `text` | `string` | The source document content. |
| `metadata` | `Record<string, unknown>` | Optional metadata. |

---

### `DetectionMethod`

```typescript
type DetectionMethod =
  | 'confidence-language'
  | 'fabricated-entities'
  | 'internal-consistency'
  | 'source-grounding'
  | 'numerical-plausibility';
```

---

### `ClaimClassification`

```typescript
type ClaimClassification = 'supported' | 'uncertain' | 'likely-hallucinated';
```

---

### `Severity`

```typescript
type Severity = 'info' | 'warning' | 'critical';
```

---

## Configuration

### Detection Methods

By default, three methods are enabled: `confidence-language`, `fabricated-entities`, and `internal-consistency`. Override with the `methods` option:

```typescript
const report = check(text, {
  methods: ['fabricated-entities', 'internal-consistency'],
});
```

### Default Weights

| Method | Default Weight |
|--------|---------------|
| `confidence-language` | 0.15 |
| `fabricated-entities` | 0.20 |
| `internal-consistency` | 0.15 |
| `source-grounding` | 0.30 |
| `numerical-plausibility` | 0.10 |

Weights are normalized across enabled methods. Override individual weights:

```typescript
const report = check(text, {
  weights: { 'confidence-language': 0.5, 'fabricated-entities': 0.5 },
});
```

### Pass Threshold

The default pass threshold is `0.7`. A composite score at or above the threshold results in `pass: true`.

```typescript
const report = check(text, { passThreshold: 0.9 });
```

---

## Error Handling

`hallucinate-check` is designed to avoid throwing exceptions during normal operation. Edge cases are handled gracefully:

- **Empty text** returns a valid report with `composite: 1.0` and zero claim assessments (no claims means nothing to hallucinate).
- **Text with no factual claims** returns a valid report. Non-factual sentences (questions, hedging, disclaimers) are extracted as claims with `isFactual: false` and do not penalize the score.
- **No sources provided** when `source-grounding` is not in the enabled methods list has no effect. If `source-grounding` were enabled without sources, entity cross-referencing in the `fabricated-entities` detector is skipped.
- **Invalid or unexpected input** such as non-string types should be guarded at the call site. The library assumes `text` is a string.

---

## Advanced Usage

### Source Document Grounding

Pass source documents to enable entity-level grounding checks within the `fabricated-entities` detector. Named entities (capitalized multi-word phrases) in the response are cross-referenced against source text using Levenshtein similarity. Entities with similarity below 0.5 to any source passage are flagged.

```typescript
import { check } from 'hallucinate-check';

const report = check(
  'Dr. James Thornton of the Institute for Advanced Studies published findings in Nature.',
  {
    sources: [
      { id: 'doc1', text: 'The research team at MIT published their results in Science.' },
    ],
  },
);

// Entities "James Thornton", "Institute", "Advanced Studies" not found in sources
// report.methodScores['fabricated-entities'] will be < 1.0
```

### Selecting Detection Methods

Run only specific detectors to focus on particular hallucination signals:

```typescript
// Only check for fabricated entities
const report = check(text, {
  methods: ['fabricated-entities'],
});

// Only check internal consistency
const report2 = check(text, {
  methods: ['internal-consistency'],
});
```

### Inspecting Per-Claim Results

Each claim assessment includes a classification and the specific findings that contributed to its score:

```typescript
const report = check(longText);

for (const assessment of report.claimAssessments) {
  if (assessment.classification === 'likely-hallucinated') {
    console.log('Flagged claim:', assessment.claim.text);
    for (const finding of assessment.findings) {
      console.log(`  [${finding.severity}] ${finding.description}`);
    }
  }
}
```

### Reusable Checker with Overrides

Factory defaults apply to every check, but per-call options take precedence:

```typescript
import { createChecker } from 'hallucinate-check';

const checker = createChecker({
  passThreshold: 0.8,
  methods: ['confidence-language', 'fabricated-entities', 'internal-consistency'],
  weights: { 'confidence-language': 0.3, 'fabricated-entities': 0.4, 'internal-consistency': 0.3 },
});

// Uses factory defaults
const report1 = checker.check(text1);

// Overrides passThreshold for this call only
const report2 = checker.check(text2, { passThreshold: 0.95 });

// Extract claims without running detection
const claims = checker.extractClaims(text3);
```

### Interpreting the Composite Score

The composite score is a weighted average of the enabled method scores, where each method score is in [0, 1]:

| Score Range | Interpretation |
|-------------|----------------|
| 0.9 -- 1.0 | No significant hallucination indicators detected. |
| 0.7 -- 0.89 | Minor indicators present. Generally trustworthy. |
| 0.4 -- 0.69 | Moderate hallucination risk. Review recommended. |
| 0.0 -- 0.39 | High hallucination risk. Content should be verified. |

### Per-Claim Classification Thresholds

| `hallucScore` | Classification |
|---------------|----------------|
| >= 0.7 | `supported` |
| 0.4 -- 0.69 | `uncertain` |
| < 0.4 | `likely-hallucinated` |

Claim scores are derived from the number and severity of findings associated with that claim. Each `critical` finding deducts 0.3, each `warning` deducts 0.15, and each `info` deducts 0.05 from a starting score of 1.0 (clamped to 0.0 minimum).

---

## TypeScript

`hallucinate-check` is written in TypeScript and ships type declarations alongside the compiled JavaScript. All public types are exported from the package entry point:

```typescript
import type {
  DetectionMethod,
  ClaimClassification,
  Severity,
  SourceDocument,
  Claim,
  Finding,
  ClaimAssessment,
  HallucinationReport,
  CheckOptions,
  CheckerConfig,
  Checker,
} from 'hallucinate-check';
```

The package targets ES2022 and uses CommonJS module format. Declaration maps are included for editor go-to-definition support.

---

## License

MIT
