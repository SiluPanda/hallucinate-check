# hallucinate-check — Implementation Tasks

This file tracks all implementation tasks derived from the SPEC.md. Tasks are grouped by phase, matching the implementation roadmap (Section 19), with additional sections for testing, documentation, and publishing.

---

## Phase 1: Core Claims and Basic Detection (v0.1.0)

### 1.1 Project Scaffolding and Dependencies

- [x] **Install runtime dependency `fastest-levenshtein`** — Add `fastest-levenshtein` (^1.0.16) to `package.json` dependencies. Run `npm install`. | Status: done
- [x] **Install dev dependencies** — Add `typescript`, `vitest`, `eslint`, `@types/node` to devDependencies if not already present. Run `npm install`. | Status: done
- [ ] **Create directory structure** — Create all directories specified in Section 18: `src/claims/`, `src/methods/`, `src/match/`, `src/patterns/`, `src/utils/`, `src/__tests__/`, `src/__tests__/claims/`, `src/__tests__/methods/`, `src/__tests__/match/`, `src/__tests__/fixtures/texts/`, `src/__tests__/fixtures/sources/`. | Status: not_done

### 1.2 Type Definitions

- [ ] **Define all TypeScript interfaces in `src/types.ts`** — Implement all interfaces from Section 11: `SourceDocument`, `Claim`, `Finding`, `FindingLocation`, `ClaimAssessment`, `ClaimGrounding`, `SourceMatch`, `ClaimConsistency`, `FabricatedEntity`, `HallucinationReport`, `CheckMeta`, `GroundingReport`, `ConsistencyReport`, `EntityDetectionResult`, `CheckOptions`, `GroundingOptions`, `ConsistencyOptions`, `EntityDetectionOptions`, `CustomPatterns`, `CheckerConfig`, `Checker`. | Status: not_done

### 1.3 Default Configuration

- [ ] **Implement `src/defaults.ts`** — Define default detection method weights (source-grounding: 0.30, self-consistency: 0.25, confidence-language: 0.15, fabricated-entities: 0.20, numerical-plausibility: 0.10, internal-consistency: 0.15). Define default thresholds (passThreshold: 0.7, groundingThreshold: 0.4, fuzzyThreshold: 0.75, ngramThreshold: 0.3, tfidfThreshold: 0.3, embeddingThreshold: 0.8, maxSourcesPerClaim: 20). Define critical method floors (source-grounding floor 0.3/ceiling 0.3, internal-consistency floor 0.2/ceiling 0.25, fabricated-entities floor 0.2/ceiling 0.3). Define weight redistribution logic for when methods are excluded. | Status: not_done

### 1.4 Utility Functions

- [x] **Implement `src/utils/tokenizer.ts`** — Word tokenization function that splits text into word tokens, handling punctuation, whitespace, and special characters. | Status: done
- [x] **Implement `src/utils/text.ts`** — Text normalization utilities: lowercase, collapse whitespace, strip leading/trailing punctuation, remove common articles and prepositions for matching. Preserve original text for reporting. | Status: done
- [ ] **Implement `src/utils/url.ts`** — URL extraction using regex `https?://[^\s<>")\]]+`. URL fabrication analysis: example domain detection, overly specific long paths (5+ segments), domain-path format mismatch (arxiv `YYMM.NNNNN` format, DOI `10.NNNN/...` format), suspicious TLD detection, IP address URL detection. | Status: not_done
- [ ] **Implement `src/utils/date.ts`** — Date extraction in multiple formats: `YYYY-MM-DD`, `MM/DD/YYYY`, `DD/MM/YYYY`, `Month DD, YYYY`, `DD Month YYYY`, natural language date expressions ("in January 2025", "on March 15th"). Date validation: impossible dates (Feb 30, month > 12, day > 31, Feb 29 in non-leap years, Apr/Jun/Sep/Nov 31), future dates (> 2 years, configurable), implausible historical dates (< 1900 in modern context), conflicting dates for same event. | Status: not_done
- [ ] **Implement `src/utils/citation.ts`** — Citation pattern extraction: `Author (Year)`, `Author et al. (Year)`, `(Author, Year)`, `[N]` references, DOI references. Citation plausibility checks: year range (future > current+1 = critical, < 1800 = warning), author name plausibility (single-word common nouns), journal name plausibility (> 80 chars, description-like names), DOI format (`10.NNNN/...`), paper ID format (arxiv `YYMM.NNNNN(N)`, PubMed numeric, ISBN check digit). | Status: not_done
- [ ] **Implement `src/utils/entity.ts`** — Named entity extraction using pattern-based recognition: person names (capitalized multi-word with titles like Dr., Mr., Mrs., Prof.), organization names (capitalized sequences with keywords "University of...", "Institute for...", "Department of..."), publication names (text in italics/quotes after "published in", "in the journal"). | Status: not_done
- [ ] **Implement `src/utils/numbers.ts`** — Numerical extraction and context tagging: integers/decimals, percentages, currency amounts, ordinals, multipliers (thousand, million, billion, trillion), fractions. Tag each number with surrounding sentence, associated unit, and described entity. | Status: not_done
- [ ] **Implement `src/utils/cosine.ts`** — Cosine similarity computation for TF-IDF vectors. Takes two number arrays and returns 0-1 similarity score. | Status: not_done

### 1.5 Pattern Catalogs

- [ ] **Implement `src/patterns/hedging.ts`** — Hedging phrase catalog (case-insensitive) with categories: belief qualifiers ("I think", "I believe", "I'm not sure", etc.), possibility markers ("probably", "possibly", "perhaps", etc.), approximation markers ("approximately", "roughly", "around", etc.), uncertainty disclaimers ("I'm not 100% sure", "don't quote me on this", etc.), knowledge cutoff references ("as of my last update", "my training data goes up to", etc.). Export as compiled RegExp patterns. | Status: not_done
- [ ] **Implement `src/patterns/overconfidence.ts`** — Overconfidence phrase catalog: absolute certainty ("definitely", "certainly", "without a doubt", "100%", "guaranteed", etc.), universal quantifiers ("always", "never", "every single", etc.), false precision ("exactly", "precisely" before round numbers). Export as compiled RegExp patterns. | Status: not_done
- [ ] **Implement `src/patterns/weasel.ts`** — Weasel word catalog: "some experts say", "studies have shown", "research suggests", "it is widely believed", "many people think", "it is generally accepted", "according to some sources", "it has been reported". Export as compiled RegExp patterns. | Status: not_done
- [ ] **Implement `src/patterns/refusal.ts`** — Non-factual content patterns for filtering: questions, hedging-only sentences, meta-commentary ("As mentioned", "In summary"), transition phrases ("Moving on", "Next"), greetings/closings ("Sure!", "I hope this helps"), disclaimers ("I'm an AI", "Please verify"), opinions ("In my opinion", "I'd recommend"). Export as compiled RegExp patterns. | Status: not_done
- [ ] **Implement `src/patterns/antonyms.ts`** — Antonym pair list (~200 common pairs) for contradiction detection: simple/complex, large/small, fast/slow, increase/decrease, more/less, etc. Export as a data structure for O(1) lookup. | Status: not_done
- [ ] **Implement `src/patterns/stopwords.ts`** — English stopword list for text matching. Used in n-gram overlap, TF-IDF, and source pre-filtering. | Status: not_done

### 1.6 Claim Extraction

- [x] **Implement `src/claims/sentences.ts`** — Sentence segmentation with rule-based splitting: split on `.`, `!`, `?` followed by whitespace and capital letter or end of string. Handle abbreviations (Dr., Mr., Mrs., Ms., Prof., e.g., i.e., vs., etc., U.S., U.K., Inc., Ltd., Corp., Jr., Sr., St.) without splitting. Preserve decimal numbers (3.14, $1,200.50). Handle ellipses (`...`). Preserve URLs (no split on periods within). Split on double newlines. Treat list items (`- `, `* `, `1. `) as individual claims. | Status: done
- [x] **Implement `src/claims/filters.ts`** — Non-factual content filters: detect questions (ends with `?`, starts with question words), hedging-only sentences, meta-commentary, transition phrases, greetings/closings, disclaimers, opinions. Conservative filtering: only filter if high-confidence non-factual. Keep sentences with mixed factual and hedging content (e.g., "I believe Paris is the capital of France"). | Status: done
- [x] **Implement `src/claims/extract.ts`** — Main claim extraction pipeline: call sentence segmentation, apply non-factual content filtering, produce `Claim` objects with `text`, `sentence`, `startOffset`, `endOffset`, `isFactual`, `index` fields. Support `claimGranularity: 'sentence'` mode (clause mode deferred to Phase 4). | Status: done

### 1.7 Confidence Language Detection

- [x] **Implement `src/methods/confidence-language.ts`** — Hedging phrase detection: scan for all hedging catalog phrases, compute hedging density (`hedgingPhraseCount / sentenceCount`), score contribution `1.0 - min(1.0, hedgingDensity * 2.5)`. Overconfidence detection: scan for overconfidence catalog phrases, apply asymmetric scoring (deduct 0.05 per marker down to floor 0.5 only when combined with other warning signals, info-level when no other signals). Weasel word detection: scan for weasel catalog phrases, score contribution `1.0 - min(1.0, weaselPhraseCount * 0.08)`. Composite: weighted combination (hedging 0.60, overconfidence 0.25, weasel 0.15). Emit all specified findings with correct IDs, severities, and locations. | Status: done

### 1.8 Fabricated Entity Detection

- [x] **Implement `src/methods/fabricated-entities.ts` — URL fabrication sub-detector** — Extract URLs, check for: example domain usage (warning), overly specific long paths with 5+ segments (warning), domain-path format mismatch for arxiv/DOI (critical), suspicious TLD (info), IP address URLs (info). Score: `1.0 - min(1.0, suspiciousUrlCount * 0.25)`. | Status: done
- [x] **Implement `src/methods/fabricated-entities.ts` — Citation fabrication sub-detector** — Extract citation patterns, check for: future year citations (critical), pre-1800 year for scientific papers (warning), single-word common noun author names (warning), journal names > 80 chars or description-like (warning), invalid DOI format (warning), invalid arxiv/PubMed/ISBN format (warning). Score: `1.0 - min(1.0, implausibleCitationCount * 0.20)`. | Status: done
- [ ] **Implement `src/methods/fabricated-entities.ts` — Date fabrication sub-detector** — Extract dates, check for: impossible dates (critical), future dates > 2 years (warning), implausible historical dates < 1900 in modern context (info), conflicting dates for same event (critical). Score: `1.0 - min(1.0, fabricatedDateCount * 0.30)`. | Status: not_done
- [x] **Implement `src/methods/fabricated-entities.ts` — Entity-source cross-referencing sub-detector** — Extract named entities (person, org, publication), search for each in source documents (when provided). Entities not found flagged as potentially fabricated. Score: `1.0 - min(1.0, unfoundEntityCount * 0.15)`. Person/org severity: warning; generic: info. | Status: done
- [ ] **Implement `src/methods/fabricated-entities.ts` — Email fabrication sub-detector** — Extract email addresses, check for: example.com domain, clearly fake domain, LLM-pattern local parts (john.doe@company.com). Score: `1.0 - min(1.0, suspiciousEmailCount * 0.15)`. | Status: not_done
- [x] **Implement `src/methods/fabricated-entities.ts` — Composite scoring** — Combine all sub-detector scores using minimum (worst-case approach). Floor at 0.0. Emit all specified findings with correct IDs, severities, locations. | Status: done

### 1.9 Basic `check()` Function

- [x] **Implement `src/check.ts` — Pipeline orchestration** — Accept `text` and `CheckOptions`. Extract claims. Run applicable detection methods (in Phase 1: confidence-language and fabricated-entities). Compute composite score using weighted average with weight redistribution for excluded methods. Apply critical method floors. Determine pass/fail. Generate per-claim assessments with scores, classifications (supported >= 0.7, uncertain 0.4-0.69, likely-hallucinated < 0.4), per-method scores, and findings. | Status: done
- [ ] **Implement `src/check.ts` — Report generation** — Build `HallucinationReport` object: composite score, pass boolean, passThreshold, methodScores record, claims array, flagged/uncertain/supported arrays, all findings (ordered by severity then method then location), summary string (template-based per Section 12), and CheckMeta (durationMs, weights, applicableMethods, criticalFloorTriggered, claimCount, factualClaimCount, sourceCount, sampleCount, timestamp). | Status: not_done
- [ ] **Implement `src/check.ts` — Summary generation** — Template-based summary: score >= 0.9: "No significant hallucination indicators detected." Score 0.7-0.89: "{count} minor hallucination indicator(s) detected: {top findings}." Score 0.4-0.69: "Moderate hallucination risk. {count} indicator(s) detected: {top findings}. Review recommended." Score < 0.4: "High hallucination risk. {count} critical indicator(s) detected: {top findings}. Content should not be used without verification." | Status: not_done
- [ ] **Implement `src/check.ts` — Finding ordering** — Order findings by: (1) severity (critical first, warning, info), (2) method (source-grounding, fabricated-entities, internal-consistency, numerical-plausibility, confidence-language, self-consistency), (3) location (earlier first). | Status: not_done

### 1.10 Public API Exports (Phase 1)

- [ ] **Implement `src/index.ts` — Phase 1 exports** — Export `check`, `extractClaims`, `detectFabricatedEntities` functions. Export all type definitions from `types.ts`. | Status: not_done

### 1.11 Phase 1 Tests

- [ ] **Create test fixtures** — Create sample LLM output texts in `src/__tests__/fixtures/texts/` and sample source documents in `src/__tests__/fixtures/sources/` for use across test suites. | Status: not_done
- [ ] **Write `src/__tests__/claims/sentences.test.ts`** — Test sentence segmentation: simple sentences split correctly, abbreviations (Dr., U.S.) do not cause false splits, decimal numbers not split on period, URLs not split on periods, list items treated as individual claims, double newlines trigger splits. | Status: not_done
- [ ] **Write `src/__tests__/claims/filters.test.ts`** — Test non-factual content filters: questions filtered, hedging-only sentences filtered, meta-commentary filtered, greetings/closings filtered, mixed factual+non-factual content preserved. | Status: not_done
- [ ] **Write `src/__tests__/claims/extract.test.ts`** — Test full claim extraction pipeline: correct claim count, correct offsets, correct isFactual flags, correct indices. | Status: not_done
- [ ] **Write `src/__tests__/methods/confidence-language.test.ts`** — Test: text with no hedging scores 1.0, dense hedging text scores low, mixed hedging+factual intermediate score, overconfidence markers produce info findings, weasel words produce info findings, hedging density calculation correct. | Status: not_done
- [ ] **Write `src/__tests__/methods/fabricated-entities.test.ts`** — Test: URL with example.com flagged, URL with overly long descriptive path flagged, valid arxiv URL not flagged, invalid arxiv URL flagged, future citation flagged, valid year citation not flagged, impossible date (Feb 30) flagged, valid date not flagged, person name in sources not flagged, person name not in sources flagged, email with example.com flagged. | Status: not_done
- [ ] **Write `src/__tests__/check.test.ts` (Phase 1 subset)** — Integration test for `check()` with Phase 1 methods: clean text produces high score, text with fabricated entities produces low score, text with dense hedging produces low score, empty text handled correctly, text with no factual claims handled correctly, determinism test (same input twice = identical output). | Status: not_done

---

## Phase 2: Source Grounding (v0.2.0)

### 2.1 Matching Strategies

- [ ] **Implement `src/match/exact.ts`** — Exact substring matching: normalize claim and source, check if normalized claim text (or any contiguous 5+ word sequence from the claim) appears verbatim in any normalized source. Return confidence 1.0 and match type `exact` on match. | Status: not_done
- [ ] **Implement `src/match/fuzzy.ts`** — Fuzzy substring matching with sliding window: slide window of size `claim.length +/- 20%` across source. Pre-filter using character trigram overlap (at least 30% of claim's trigrams in window). Compute normalized Levenshtein similarity using `fastest-levenshtein`: `1 - (distance / max(claim.length, window.length))`. Return best similarity if exceeds fuzzyThreshold (default 0.75), match type `fuzzy`. | Status: not_done
- [ ] **Implement `src/match/ngram.ts`** — N-gram overlap matching: tokenize claim and source into words, remove stopwords, generate word n-grams for n=1,2,3. Compute weighted Jaccard similarity: `0.2 * jaccard_1 + 0.3 * jaccard_2 + 0.5 * jaccard_3`. Return score if exceeds ngramThreshold (default 0.3), match type `ngram`. | Status: not_done
- [ ] **Implement `src/match/tfidf.ts`** — TF-IDF cosine similarity: build vocabulary, compute IDF across all source documents, compute TF-IDF vectors for claim and each source, compute cosine similarity. Return score if exceeds tfidfThreshold (default 0.3), match type `tfidf`. Pre-compute IDF once and reuse. | Status: not_done
- [ ] **Implement `src/match/prefilter.ts`** — Source pre-filtering for large source sets (> 20 documents): compute shared unique non-stopword terms between claim and each source. Select top `maxSourcesPerClaim` (default 20) sources by shared term count. | Status: not_done
- [ ] **Implement `src/match/composite.ts`** — Composite match score computation: weighted combination of all active strategy scores using configurable weights (exact: 0.40, fuzzy: 0.25, ngram: 0.20, tfidf: 0.15 without embedder; exact: 0.30, fuzzy: 0.15, ngram: 0.15, tfidf: 0.10, embedding: 0.30 with embedder). | Status: not_done

### 2.2 Source Grounding Method

- [ ] **Implement `src/methods/source-grounding.ts` — Claim-source matching pipeline** — For each factual claim: apply pre-filter if > 20 sources, run all active matching strategies against candidate sources, compute composite score per claim-source pair, determine grounding classification (grounded >= 0.7, weakly-grounded 0.4-0.69, ungrounded < 0.4). Track best match and all matches above minimum threshold. | Status: not_done
- [ ] **Implement `src/methods/source-grounding.ts` — Contradiction detection** — For weakly-grounded or ungrounded claims, check if claim actively contradicts a source passage. Extract numerical values and key predicates. Flag if claim asserts different value for same entity/attribute. Classification: `contradicts-source`. | Status: not_done
- [ ] **Implement `src/methods/source-grounding.ts` — Source match evidence** — For each claim-source match, record: matching source document ID, confidence score, primary match type, specific matching substring in source, character offset of match evidence within source. | Status: not_done
- [ ] **Implement `src/methods/source-grounding.ts` — Method-level score** — Compute `groundedClaimCount / totalFactualClaimCount`. Per-claim grounding scores: 1.0 for grounded, 0.5 for weakly-grounded, 0.0 for ungrounded, -0.2 penalty for contradicts-source (clamped to 0.0 min). Emit findings: `claim-ungrounded` (warning), `claim-weakly-grounded` (info), `claim-contradicts-source` (critical). | Status: not_done

### 2.3 `checkGrounded()` Function

- [ ] **Implement `checkGrounded()` in `src/check.ts` or separate file** — Accept text, sources (string[] or SourceDocument[]), and GroundingOptions. Extract claims. Run source grounding pipeline. Return `GroundingReport` with groundingScore, per-claim grounding assessments (claim, grounded boolean, classification, bestMatch, matches, score), ungroundedClaims, contradictingClaims, findings, durationMs. Handle sources as strings by converting to `{ index, content }` format. | Status: not_done

### 2.4 Numerical Plausibility Method

- [ ] **Implement `src/methods/numerical-plausibility.ts` — Percentage consistency** — Extract percentages from text. If text lists components as percentages of a whole, check if they sum to ~100%. Deviations > 5% emit warning. Percentage > 100% in non-valid context emits critical (exception: "150% increase", "200% of target"). Score: `1.0 - min(1.0, percentageViolationCount * 0.30)`. | Status: not_done
- [ ] **Implement `src/methods/numerical-plausibility.ts` — Order of magnitude check** — When sources provided, extract numbers from both text and sources. Match by surrounding entity/topic (same noun phrases within 5 words). Flag if ratio > 10x or < 0.1x. Score: `1.0 - min(1.0, magnitudeViolationCount * 0.35)`. | Status: not_done
- [ ] **Implement `src/methods/numerical-plausibility.ts` — Internal numerical consistency** — Check total vs component sums. Check rate + duration plausibility. Check "increased from X to Y" / "decreased from X to Y" direction consistency. Score: `1.0 - min(1.0, internalViolationCount * 0.25)`. | Status: not_done
- [ ] **Implement `src/methods/numerical-plausibility.ts` — Round number suspicion** — Detect many suspiciously round numbers in contexts expecting precision. Info-level findings only (weak signal). | Status: not_done
- [ ] **Implement `src/methods/numerical-plausibility.ts` — Composite scoring** — Weighted average of sub-scores: percentage consistency 0.30, order of magnitude 0.35, internal consistency 0.25, round number suspicion 0.10. Text with no numbers returns 1.0 (neutral). Emit all specified findings. | Status: not_done

### 2.5 Update `check()` and Exports

- [ ] **Update `src/check.ts` to integrate source grounding and numerical plausibility** — Add source-grounding method (active when sources provided). Add numerical-plausibility method (always active). Update weight redistribution logic. Update composite score computation. | Status: not_done
- [ ] **Update `src/index.ts` — Phase 2 exports** — Export `checkGrounded` function. | Status: not_done

### 2.6 Phase 2 Tests

- [ ] **Write `src/__tests__/match/exact.test.ts`** — Test exact substring matching: verbatim match returns 1.0, 5+ word subsequence match works, no match returns 0. | Status: not_done
- [ ] **Write `src/__tests__/match/fuzzy.test.ts`** — Test fuzzy matching: minor wording differences detected, trigram pre-filter works, similarity threshold respected. | Status: not_done
- [ ] **Write `src/__tests__/match/ngram.test.ts`** — Test n-gram overlap: stopword removal, weighted Jaccard computation, threshold respected. | Status: not_done
- [ ] **Write `src/__tests__/match/tfidf.test.ts`** — Test TF-IDF: IDF computation, cosine similarity, pre-computed IDF reuse. | Status: not_done
- [ ] **Write `src/__tests__/match/composite.test.ts`** — Test composite scoring: weights applied correctly, with/without embedder weights differ. | Status: not_done
- [ ] **Write `src/__tests__/methods/source-grounding.test.ts`** — Test: verbatim claim grounded at 1.0, paraphrased claim grounded via fuzzy/ngram, unrelated claim ungrounded, numerical contradiction flagged, no sources returns 1.0, multiple sources with one matching identifies correct source, pre-filter selects relevant sources. | Status: not_done
- [ ] **Write `src/__tests__/methods/numerical-plausibility.test.ts`** — Test: percentages summing to 100 no issue, percentages summing to 115 warning, 10x magnitude mismatch critical, direction mismatch critical, no numbers returns 1.0, round number suspicion info finding. | Status: not_done
- [ ] **Write `src/__tests__/check-grounded.test.ts`** — Integration tests for `checkGrounded()`: all claims grounded gives high score, ungrounded claims flagged, contradicting claims detected, correct GroundingReport structure. | Status: not_done

---

## Phase 3: Self-Consistency and Internal Consistency (v0.3.0)

### 3.1 Self-Consistency Method

- [ ] **Implement `src/methods/self-consistency.ts` — Cross-sample claim matching** — For each claim in primary response, check presence in other samples using: direct match (similarity > 0.85, support 1.0), paraphrase match (0.5-0.85, support 0.7), partial match (0.3-0.5, support 0.3), no match (< 0.3, support 0.0), contradiction (high entity overlap but negation/different values, support -0.5). | Status: not_done
- [ ] **Implement `src/methods/self-consistency.ts` — Consistency scoring** — Per-claim consistency score: average support across non-primary samples, clamped to [0.0, 1.0]. Classify: 0.8-1.0 highly consistent, 0.5-0.79 moderately consistent, 0.2-0.49 inconsistent, 0.0-0.19 highly inconsistent. | Status: not_done
- [ ] **Implement `src/methods/self-consistency.ts` — Contradiction detection across samples** — Detect claims sharing key entities/topic but using negation or opposing quantifiers. Contradicted claims receive deducted score: `max(0, consistencyScore - 0.3)`. | Status: not_done
- [ ] **Implement `src/methods/self-consistency.ts` — Method-level score** — Weighted average of per-claim consistency scores. Weight claims with specific content (named entities, numbers, dates) higher than generic claims. Emit findings: `claim-inconsistent` (warning), `claim-contradicted` (critical), `claim-consistent` (info, verbose only). | Status: not_done

### 3.2 `checkConsistency()` Function

- [ ] **Implement `checkConsistency()` function** — Accept responses array (minimum 2), ConsistencyOptions. Extract claims from primary response (first element). Run self-consistency checking against remaining samples. Return `ConsistencyReport` with consistencyScore, per-claim assessments (claim, consistency, classification, appearsInSamples, totalSamples, contradicted), inconsistentClaims, contradictedClaims, findings, durationMs. Validate minimum 2 responses (error or warn on single response). | Status: not_done

### 3.3 Internal Consistency Method

- [ ] **Implement `src/methods/internal-consistency.ts` — Explicit contradiction patterns** — Self-correction markers ("actually", "correction:", "I should clarify", etc.) emit warning findings. However-negation patterns (declarative + "however" + negation of same subject within 2-3 sentences). Opposite descriptors (same entity with antonymic adjectives from built-in antonym list). | Status: not_done
- [x] **Implement `src/methods/internal-consistency.ts` — Numerical contradictions** — Extract numerical claims with associated entities, group by entity, flag same entity with two different incompatible values. Exception: different time periods are not contradictions. | Status: done
- [ ] **Implement `src/methods/internal-consistency.ts` — Temporal contradictions** — Extract event-date pairs. Flag same event dated differently in two places. Flag inconsistent temporal sequences ("After the 2020 launch... before the product launched in 2020..."). | Status: not_done
- [ ] **Implement `src/methods/internal-consistency.ts` — Assertion-negation pairs** — Detect "X is Y" followed by "X is not Y" patterns. Context-aware: negations in different scopes (temporal distinctions) are not contradictions. | Status: not_done
- [x] **Implement `src/methods/internal-consistency.ts` — Method-level score** — `1.0 - min(1.0, contradictionCount * 0.25)`. Emit findings: `self-correction` (warning), `numerical-contradiction` (critical), `antonym-contradiction` (critical), `temporal-contradiction` (critical). | Status: done

### 3.4 `createChecker()` Factory

- [ ] **Implement `src/factory.ts`** — Accept `CheckerConfig`. Return `Checker` object with `check()`, `checkGrounded()`, `checkConsistency()`, `extractClaims()`, `detectFabricatedEntities()` methods. Implement configuration precedence: per-call options > factory config > built-in defaults. Compile patterns once at factory creation time. | Status: not_done

### 3.5 Embedding Support

- [ ] **Implement `src/match/embedding.ts`** — Accept pluggable `embedder` function `(text: string) => Promise<number[]> | number[]`. Compute embeddings for claim and each source. Compute cosine similarity. Return score if exceeds embeddingThreshold (default 0.8), match type `embedding`. Handle both sync and async embedder functions. | Status: not_done

### 3.6 Update `check()` and Exports

- [ ] **Update `src/check.ts` to integrate self-consistency and internal consistency** — Add self-consistency method (active when samples provided). Add internal-consistency method (always active). Update weight redistribution. Integrate with composite score computation. Support `samples` option in `check()`. | Status: not_done
- [ ] **Update `src/index.ts` — Phase 3 exports** — Export `checkConsistency`, `createChecker`. Ensure all types exported. | Status: not_done

### 3.7 Phase 3 Tests

- [ ] **Write `src/__tests__/methods/self-consistency.test.ts`** — Test: all samples contain same claim = consistency 1.0, no other sample contains claim = consistency 0.0, claim with minor rewording detected as paraphrase, one sample contradicts = contradiction detected, two samples minimum viable check, temperature-0 near-identical samples handled correctly. | Status: not_done
- [ ] **Write `src/__tests__/methods/internal-consistency.test.ts`** — Test: no contradictions = score 1.0, self-correction detected as warning, same entity with different values = critical, antonym contradiction ("simple" vs "complex") = critical, temporal contradiction (same event different dates) = critical, legitimate temporal distinction ("in 2020... in 2021...") not flagged. | Status: not_done
- [ ] **Write `src/__tests__/check-consistency.test.ts`** — Integration tests for `checkConsistency()`: consistent samples give high score, inconsistent samples give low score, specific claims flagged, correct ConsistencyReport structure, minimum 2 responses validation. | Status: not_done
- [ ] **Write factory tests** — Test `createChecker()`: custom weights applied, custom thresholds applied, method selection works, custom patterns appended, configuration precedence (per-call > factory > defaults), checker instance reusable across multiple checks. | Status: not_done
- [ ] **Write embedding integration tests** — Test embedding strategy: mock embedder function, embedding scores computed correctly, weights adjusted when embedder provided, both sync and async embedder supported. | Status: not_done

---

## Phase 4: Polish and v1.0.0

### 4.1 Performance Optimization

- [ ] **Implement pattern catalog compilation caching** — Compile all regex patterns once at module load time or once per `createChecker()` call. Ensure no re-compilation on each `check()` call. | Status: not_done
- [ ] **Implement lazy method computation** — Methods not applicable (no sources for grounding, no samples for consistency) are skipped entirely, not computed then ignored. | Status: not_done
- [ ] **Verify no backtracking regex** — Audit all regex patterns for potential ReDoS on adversarial inputs. Ensure linear-time execution for all patterns. | Status: not_done
- [ ] **Optimize TF-IDF IDF pre-computation** — Ensure IDF values computed once across all sources and reused for all claim-source comparisons. | Status: not_done
- [ ] **Optimize fuzzy matching sliding window** — Ensure trigram pre-filter reduces Levenshtein evaluations to only positions with >= 30% trigram overlap. | Status: not_done

### 4.2 Sub-Sentence Claim Decomposition

- [ ] **Implement `claimGranularity: 'clause'` in `src/claims/extract.ts`** — Split sentences on coordinating conjunctions with independent clauses (`, and`, `, but`, `, or`, `, yet`) and semicolons. Each clause becomes a separate claim. Only split when each clause makes an independent factual assertion. | Status: not_done

### 4.3 Edge Case Hardening

- [ ] **Handle empty string input** — `check("")` returns a well-formed report (score 1.0: no claims = nothing to hallucinate). | Status: not_done
- [ ] **Handle text with no factual claims** — All sentences filtered as non-factual. Return appropriate score and report. | Status: not_done
- [ ] **Handle text with only one claim** — Single-claim analysis works correctly across all methods. | Status: not_done
- [ ] **Handle very long text (10,000+ words)** — Ensure performance stays under 50ms. No memory issues. | Status: not_done
- [ ] **Handle text containing code blocks** — Code content should not be analyzed as factual claims. Detect and skip fenced code blocks (``` delimiters) and indented code blocks. | Status: not_done
- [ ] **Handle Unicode text** — CJK characters, emoji, RTL text do not cause crashes or incorrect offsets. | Status: not_done
- [ ] **Handle sources as strings vs SourceDocument objects** — Both formats accepted and processed correctly. Strings converted to `{ index, content }` internally. | Status: not_done
- [ ] **Handle single sample in checkConsistency** — Minimum 2 required. Throw error or return warning. | Status: not_done

### 4.4 Per-Claim Scoring Refinement

- [ ] **Implement per-claim hallucination score** — Each claim gets its own score from applicable methods at claim granularity: source grounding (per-claim grounding score), self-consistency (per-claim consistency score), confidence language (per-claim hedging density), fabricated entities (per-claim entity score), numerical plausibility (per-claim number check), internal consistency (per-claim contradiction involvement). Weighted average for per-claim composite. Classify: supported >= 0.7, uncertain 0.4-0.69, likely-hallucinated < 0.4. | Status: not_done

### 4.5 Report Serialization

- [ ] **Verify JSON serialization** — Ensure `HallucinationReport` serializes cleanly with `JSON.stringify()`. No class instances, functions, or circular references. All fields use primitives, arrays, or nested plain objects. | Status: not_done

### 4.6 Composite Score Tests

- [ ] **Write composite score tests** — Test: all methods at 1.0 = composite 1.0, one critical method at floor = composite capped at ceiling, custom weights applied correctly, weight redistribution when methods excluded, pass threshold comparison, per-claim classification based on score ranges. | Status: not_done

### 4.7 Integration Tests

- [ ] **Write integration test — Clean text with sources** — All claims grounded, high score. | Status: not_done
- [ ] **Write integration test — Text with fabricated entities, no sources** — Fabricated URLs, citations detected, lower score. | Status: not_done
- [ ] **Write integration test — Text contradicting sources** — Numerical contradictions flagged, low grounding score. | Status: not_done
- [ ] **Write integration test — Self-consistency check with consistent samples** — High consistency score. | Status: not_done
- [ ] **Write integration test — Self-consistency check with inconsistent samples** — Low consistency, specific claims flagged. | Status: not_done
- [ ] **Write integration test — Dense hedging text** — Confidence language method drives score down. | Status: not_done
- [ ] **Write integration test — Text with internal contradictions** — Internal consistency method flags issues. | Status: not_done
- [ ] **Write integration test — Empty text** — Score 1.0 (no claims = nothing to hallucinate). | Status: not_done
- [ ] **Write determinism test** — Same input twice produces identical output. | Status: not_done

### 4.8 Performance Benchmarks

- [ ] **Write `src/__tests__/performance.test.ts`** — Benchmark and assert: check on 500-word text, no sources: under 2ms. Check on 500-word text, 5 sources: under 5ms. Check on 2000-word text, 20 sources: under 20ms. Check on 10,000-word text, 100 sources: under 50ms. Consistency check on 5 samples of 500 words each: under 15ms. These benchmarks should be verified in CI to detect regressions. | Status: not_done

### 4.9 Edge Case Tests

- [ ] **Write edge case tests** — Test: empty string input, text with no factual claims (all questions and hedging), text with only one claim, very long text (10,000+ words), text containing code blocks, Unicode text (CJK, emoji, RTL), text with no numbers (numerical plausibility returns 1.0), sources as strings vs SourceDocument objects, single sample to checkConsistency (error/warn). | Status: not_done

---

## Phase 5: Documentation and Publishing

### 5.1 Documentation

- [ ] **Write README.md** — Comprehensive README with: package description, installation instructions, quick start examples, API reference for all 6 exported functions (check, checkGrounded, checkConsistency, extractClaims, detectFabricatedEntities, createChecker), configuration guide (weights, thresholds, custom patterns), detection method descriptions, score interpretation guide (0.9-1.0, 0.7-0.89, 0.4-0.69, 0.0-0.39), integration examples (rag-cite, output-grade, llm-retry, monitoring), performance characteristics, dependency rationale. | Status: not_done
- [ ] **Add JSDoc comments to all public functions** — Document parameters, return types, usage examples, and behavioral notes for: check(), checkGrounded(), checkConsistency(), extractClaims(), detectFabricatedEntities(), createChecker(). | Status: not_done
- [ ] **Add inline code comments** — Add explanatory comments to non-obvious algorithm implementations: fuzzy matching sliding window, trigram pre-filter, TF-IDF computation, composite score with critical floors, weight redistribution. | Status: not_done

### 5.2 Version Bump and Publishing Prep

- [ ] **Bump version to 1.0.0 in package.json** — Update version field. Ensure all package.json fields are correct (name, description, main, types, files, scripts, keywords, engines, publishConfig). | Status: not_done
- [ ] **Add keywords to package.json** — Add relevant keywords: hallucination, detection, llm, ai, grounding, fact-checking, claims, verification, etc. | Status: not_done
- [ ] **Verify `npm run build` succeeds** — Ensure TypeScript compiles cleanly with zero errors. Output appears in `dist/`. | Status: not_done
- [ ] **Verify `npm run test` passes** — All unit, integration, edge case, and performance tests pass. | Status: not_done
- [ ] **Verify `npm run lint` passes** — No linting errors. | Status: not_done
- [ ] **Verify package contents** — Run `npm pack --dry-run` to verify only `dist/` files are included. No source files, test files, or spec files in the published package. | Status: not_done
