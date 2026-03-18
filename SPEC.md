# hallucinate-check -- Specification

## 1. Overview

`hallucinate-check` is a heuristic hallucination detection library for Node.js that scores LLM-generated text for hallucination risk without calling a second LLM. It extracts individual claims from the text, checks each claim against multiple detection methods -- source grounding verification, self-consistency checking, confidence language analysis, fabricated entity detection, numerical plausibility analysis, and internal contradiction detection -- and produces a structured hallucination report with a composite 0-1 score, per-claim assessments, per-method scores, and detailed findings with locations and severities. It is the first JavaScript-native hallucination scorer: a single `check()` call that answers the question "how likely is this output to contain hallucinated content?" with a machine-readable result.

The gap this package fills is specific and well-defined. Hallucination detection in production LLM systems today requires one of three approaches: LLM-as-judge (calling a second, stronger LLM to evaluate the first LLM's claims), embedding-based NLI (running a Natural Language Inference model to check entailment between sources and claims), or manual human review. All three are expensive, slow, non-deterministic, or unscalable. Meanwhile, teams need hallucination signals for concrete operational decisions: should this response be shown to the user? should this claim be flagged for review? is this RAG response grounded in its sources? is the model fabricating entities, URLs, citations, or dates? These decisions do not always require the deep semantic understanding that an NLI model or LLM judge provides -- they often require fast, deterministic, cheap signals that detect the common hallucination patterns: fabricated URLs that do not follow real URL structures, citations to nonexistent papers, dates that are impossible or implausible, entities that appear nowhere in the provided context, confidence language that correlates with uncertainty, and internal contradictions where the model says two incompatible things.

In Python, several tools address hallucination detection. SelfCheckGPT (Manakul et al., 2023) generates multiple sampled responses and measures consistency between them -- if the model says different things each time, it is likely hallucinating. RAGAS provides a `faithfulness` metric that decomposes answers into claims and checks each against the context using LLM-based NLI. DeepEval provides hallucination metrics (`FaithfulnessMetric`, `HallucinationMetric`) that use LLM calls to verify claims. Vectara's Hughes Hallucination Evaluation Model (HHEM) is a fine-tuned cross-encoder that scores whether a summary is consistent with its source document. LangChain provides hallucination evaluation chains. All of these either require LLM API calls, require model inference (HHEM needs a transformer model), or are Python-only. In the JavaScript/TypeScript ecosystem, there is nothing. The `output-grade` package in this monorepo includes a lightweight hallucination risk dimension (hedging phrases, fabricated URLs, impossible dates) as one of eight quality dimensions, but it is a shallow scan -- it does not extract claims, does not verify against source context, does not check self-consistency, does not detect fabricated entities, and does not provide per-claim assessments. The `rag-cite` package in this monorepo verifies citation accuracy against provided sources, but it is citation-specific -- it checks whether `[1]` points to the right source, not whether the claims themselves are plausible. No npm package provides dedicated, deep hallucination detection.

`hallucinate-check` fills this gap with a multi-method heuristic pipeline. It is not a replacement for LLM-as-judge or NLI-based verification -- those provide higher accuracy for subtle factual errors. It is the fast, deterministic, zero-cost first-pass filter that catches the 80% of hallucinations that are structural and pattern-based: fabricated entities not in the source context, URLs with telltale fabrication patterns, citations to future-dated or nonexistent papers, numerical claims that are orders of magnitude off, internal contradictions where the model reverses itself, and text that the model generates with high variation across samples (indicating parametric uncertainty). The remaining 20% of hallucinations -- subtle factual errors, plausible-sounding but wrong claims, correct-seeming reasoning with incorrect premises -- require an LLM judge, NLI model, or knowledge base lookup. `hallucinate-check` catches the obvious ones in microseconds at zero marginal cost, leaving only the ambiguous cases for expensive evaluation methods.

The design philosophy is claim-level granularity. Unlike `output-grade`'s hallucination risk dimension, which produces a single score for the entire output, `hallucinate-check` decomposes the response into individual claims, evaluates each claim independently across all detection methods, and reports per-claim hallucination scores. This enables consumers to display claim-level trust indicators ("this specific sentence may be hallucinated"), filter out individual hallucinated claims while keeping the rest, and understand exactly which parts of the response are problematic and why.

---

## 2. Goals and Non-Goals

### Goals

- Provide a `check(text, options?)` function that extracts claims from LLM-generated text, runs all detection methods, and returns a `HallucinationReport` containing a composite 0-1 score, per-claim assessments, per-method scores, individual findings, and a pass/fail determination.
- Provide a `checkGrounded(text, sources, options?)` function that verifies whether the claims in the text are supported by provided source documents, producing a grounding score and per-claim grounding assessments.
- Provide a `checkConsistency(responses, options?)` function that takes multiple sampled responses to the same prompt and measures self-consistency, detecting claims that vary across samples (indicating hallucination).
- Provide an `extractClaims(text, options?)` function that decomposes text into individual verifiable claims, filtering non-factual content.
- Provide a `detectFabricatedEntities(text, sources?, options?)` function that identifies entities (people, organizations, publications, URLs, dates) in the text that do not appear in the provided sources and exhibit fabrication patterns.
- Provide a `createChecker(config)` factory that returns a preconfigured checker instance with custom thresholds, weights, pattern catalogs, and detection method selection, reusable across multiple checks.
- Score six detection methods: source grounding, self-consistency, confidence language, fabricated entities, numerical plausibility, and internal consistency. Each method produces a 0-1 score with documented algorithm.
- Combine method scores into a single composite 0-1 hallucination score using a configurable weighted formula, where 1.0 means no hallucination indicators detected and 0.0 means high hallucination risk.
- Report per-claim hallucination assessments: each claim gets a 0-1 score, a list of findings from each detection method, and a classification (supported, uncertain, likely-hallucinated).
- Report individual findings with their location (character offsets in the original text), severity (info, warning, critical), detection method, and human-readable description.
- Apply only deterministic, rule-based heuristics for the core pipeline. No LLM calls, no model inference, no network access, no external service dependencies. The same input always produces the same score.
- Accept an optional pluggable embedding function for semantic similarity in source grounding, for users who want higher-accuracy matching beyond text overlap heuristics.
- Run in sub-10ms time for typical LLM outputs (under 2000 words, under 10 source documents). No operation should exceed 50ms even for large inputs (10,000 words, 100 source documents).
- Keep runtime dependencies minimal: depend only on `fastest-levenshtein` for edit distance computation. All other algorithms are implemented using built-in JavaScript/Node.js capabilities.
- Work with any LLM output: OpenAI, Anthropic, Google, Cohere, open-source models. The library is model-agnostic and operates on plain text.

### Non-Goals

- **Not an LLM-as-judge.** This package does not call a second LLM to evaluate hallucination. It does not require API keys, does not make HTTP requests, and does not incur inference costs. The tradeoff is explicit: `hallucinate-check` catches structural, pattern-based, and context-based hallucination indicators; it does not catch subtle factual errors or plausible-sounding misinformation that requires deep reasoning. For LLM-as-judge hallucination evaluation, use DeepEval, RAGAS (Python), or call an LLM directly on the structured output from `hallucinate-check`.
- **Not an NLI engine.** This package does not run Natural Language Inference models (e.g., DeBERTa fine-tuned on MNLI) to determine textual entailment. NLI-based verification is more accurate for paraphrase detection but requires model inference. Source grounding in this package uses text overlap heuristics as a proxy for entailment. Users who need NLI can use the claim-source pairs from `hallucinate-check`'s output as input to an NLI model.
- **Not a knowledge base.** This package does not contain or query a factual knowledge base. It cannot determine whether "The population of France is 67 million" is correct. It can determine whether that claim is supported by the provided source context, whether the number is plausible relative to other numbers in the text, and whether the model expressed uncertainty about it. For factual verification against a knowledge base, use a search API or knowledge graph.
- **Not a citation verifier.** This package detects fabricated citation patterns (nonexistent journals, implausible paper IDs, future-dated references) but does not verify whether a specific citation `[1]` points to the correct source chunk. For citation-level verification in RAG pipelines, use `rag-cite`.
- **Not a general text quality scorer.** This package evaluates hallucination risk specifically. It does not score structural validity, truncation, refusal, coherence, or format compliance. For general-purpose LLM output quality scoring, use `output-grade`.
- **Not a real-time fact checker.** This package does not query the internet, search engines, or databases to verify claims in real time. Source grounding operates only against source documents explicitly provided by the caller.
- **Not a Python port.** This package is inspired by the concepts in SelfCheckGPT, RAGAS faithfulness, and HHEM, but it is a native JavaScript implementation with its own algorithms, not a port of any Python library.

---

## 3. Target Users and Use Cases

### RAG Application Developers

Developers building retrieval-augmented generation applications who need to verify that LLM responses are grounded in the retrieved source documents. After the LLM generates a response using retrieved chunks as context, they run `checkGrounded(response, sources)` to get a per-claim grounding assessment. Claims not supported by any source are flagged as potential hallucinations. This is complementary to `rag-cite`'s citation verification: `rag-cite` checks whether explicit citation markers point to the right sources; `hallucinate-check` checks whether the claims themselves are plausible and grounded, regardless of citation markers.

### AI Safety and Trust Engineers

Engineers responsible for ensuring that AI-generated content is trustworthy before it reaches end users. They integrate `hallucinate-check` into the response pipeline as a safety gate: responses with hallucination scores below a threshold are blocked, flagged for human review, or regenerated. The per-claim granularity enables surgical intervention -- flagging individual hallucinated claims while preserving the rest of the response.

### LLM Evaluation and Benchmarking Teams

Teams evaluating LLM performance across datasets who need a hallucination metric that runs at scale without LLM API costs. Running LLM-as-judge hallucination checks on 10,000 responses costs money and takes time. `hallucinate-check` scores all 10,000 in seconds with zero API cost. The heuristic scores identify the clearly hallucinated outputs (score < 0.3) and the clearly clean outputs (score > 0.9), leaving only the ambiguous range for expensive LLM-as-judge evaluation. This hybrid approach reduces evaluation costs by 60-80%.

### Content Generation Pipelines

Teams using LLMs to generate articles, product descriptions, summaries, or documentation. Before publishing, the content passes through `hallucinate-check` to detect fabricated statistics, nonexistent URLs, made-up citations, implausible dates, and other fabrication patterns. The self-consistency check (generating multiple drafts and comparing) is especially valuable here: if the LLM generates different "facts" each time, the content is likely fabricated.

### Monitoring and Observability Teams

Teams operating LLM-powered services in production who need to track hallucination rates over time. Dashboard metrics like "average hallucination score over the last hour," "percentage of responses with fabricated entities," and "grounding score distribution" provide operational visibility. Alert rules like "fire if the 5-minute rolling average hallucination score drops below 0.6" detect model degradation or prompt drift. `hallucinate-check` provides the metric; Prometheus, Datadog, or custom telemetry consumes it.

### Developers Using Local or Open-Source Models

Developers using Ollama, vLLM, llama.cpp, or similar inference servers with open-source models. These models hallucinate more frequently than commercial APIs, producing more fabricated entities, more invented citations, and more internally inconsistent outputs. `hallucinate-check` is especially valuable here because the hallucination rate is higher and the cost of running an LLM judge on every output (which would require a second model) is impractical.

### Legal and Compliance Teams

Teams in regulated industries where AI-generated content must be verifiable. Every claim in a response needs to be traceable to a source document. `hallucinate-check`'s per-claim grounding assessment provides an audit trail: which claims are supported, which are not, and what evidence connects each claim to its source. The structured report serves as a compliance artifact.

---

## 4. Core Concepts

### Hallucination

A hallucination is content generated by an LLM that is not grounded in the provided context, is factually incorrect, or is fabricated without basis. Hallucinations fall into several categories:

- **Intrinsic hallucination**: The generated text contradicts the source material. The source says "revenue increased by 5%" and the LLM says "revenue increased by 50%."
- **Extrinsic hallucination**: The generated text adds information that is neither supported nor contradicted by the source material. The source discusses Q3 revenue and the LLM adds a claim about Q4 projections that appears nowhere in the source.
- **Fabricated entities**: The LLM invents people, organizations, publications, URLs, or other named entities that do not exist. "According to Dr. James Thornton of the Institute for Advanced Language Studies..." when no such person or institution exists.
- **Confabulation**: The LLM generates plausible-sounding but fabricated narratives, filling in gaps with invented details. It produces a coherent story that is convincing but factually baseless.

`hallucinate-check` detects hallucination indicators across all four categories using heuristic methods. It does not determine ground truth -- it flags text that exhibits patterns correlated with hallucination.

### Claim

A claim is an individual factual assertion within the LLM-generated text that can be independently evaluated for hallucination. Claims are the atomic units of analysis. A single sentence may contain one claim ("Paris is the capital of France") or multiple claims ("Paris is the capital of France and was founded in the 3rd century BC"). Claims are extracted by sentence segmentation with optional sub-sentence decomposition. Non-factual sentences -- questions, opinions, hedging statements, meta-commentary, and social niceties -- are filtered out because they make no verifiable assertions and should not be penalized as hallucinations.

### Finding

A finding is a specific, discrete hallucination indicator detected during analysis. Each finding belongs to a detection method, has a severity (info, warning, critical), a human-readable description, a location in the original text (character offset range), and the claim it applies to (if claim-level). Findings are the evidence behind scores. A hallucination score of 0.3 might be backed by findings like `{ id: 'fabricated-url', severity: 'critical', message: 'URL follows LLM fabrication pattern: http://www.ijpd-journal.org/articles/2025/study', location: { start: 145, end: 198 } }` and `{ id: 'entity-not-in-source', severity: 'warning', message: 'Entity "Dr. James Thornton" not found in any source document', location: { start: 20, end: 39 } }`. Findings provide explainability: the caller can inspect why a claim was flagged, not just that it was flagged.

### Source Document

A source document is a passage of text provided as context for grounding verification. In RAG applications, these are the retrieved chunks that the LLM used to generate its response. Source documents are the ground truth against which claims are verified. A claim is considered grounded if it can be matched to at least one source document with sufficient confidence. Source documents are optional -- `check()` can run without them, using only the non-grounding detection methods.

### Hallucination Score

The hallucination score is a single 0-1 value summarizing the overall hallucination risk of the text. The score is inverted from risk: 1.0 means no hallucination indicators detected (low risk, high trustworthiness), 0.0 means pervasive hallucination indicators (high risk, low trustworthiness). The score is computed as a weighted combination of per-method scores. The inversion convention (higher is better) matches the convention used by `output-grade` and `rag-cite`, enabling consistent interpretation across the monorepo.

### Checker Instance

A checker instance is a preconfigured checking function created by `createChecker(config)`. It encapsulates detection method weights, thresholds, custom pattern catalogs, and method selection. A checker instance is reusable across multiple `check()` calls, avoiding repeated configuration parsing. Teams typically create one checker per use case: one for RAG grounding verification, one for content generation quality gates, one for monitoring pipelines.

---

## 5. Hallucination Types and Detection Coverage

### 5.1 Intrinsic Hallucination

**Definition**: The generated text directly contradicts the provided source material.

**Detection approach**: Source grounding verification (Section 6.1) and internal consistency checking (Section 6.6). When sources are provided, each claim is matched against the source text. If a claim makes a quantitative assertion that contradicts a matching source passage (e.g., the source says "15%" and the claim says "50%"), the claim is flagged. Internal consistency checking catches cases where the model contradicts itself within the same response.

**Coverage**: Moderate. Numerical contradictions and explicit negation contradictions are reliably detected. Subtle semantic contradictions (the source implies X and the model states not-X using different words) are beyond heuristic detection.

### 5.2 Extrinsic Hallucination

**Definition**: The generated text adds information not present in or derivable from the provided sources.

**Detection approach**: Source grounding verification (Section 6.1) and fabricated entity detection (Section 6.4). Claims that cannot be matched to any source passage are flagged as potentially extrinsic. Entities (people, organizations, publications) mentioned in the claim but not in any source are additional evidence of extrinsic hallucination.

**Coverage**: Good for claims that introduce entirely new topics or entities. Weaker for claims that subtly extend source material with plausible-sounding additions (e.g., adding a specific date to a source passage that mentions an event without dating it).

### 5.3 Fabricated Entities

**Definition**: The LLM invents specific named entities -- people, organizations, publications, URLs, email addresses, phone numbers, or product names -- that do not exist.

**Detection approach**: Fabricated entity detection (Section 6.4). Named entities are extracted from the text using pattern-based recognition. Each entity is checked against the source documents (if provided) and against structural plausibility heuristics (URL format analysis, citation format analysis, date validity).

**Coverage**: Strong for URLs (fabrication patterns are distinctive), citations (format plausibility is checkable), and dates (validity is deterministic). Moderate for person and organization names (can check source presence but cannot verify real-world existence).

### 5.4 Confabulation

**Definition**: The LLM generates detailed, coherent narratives that are entirely fabricated.

**Detection approach**: Self-consistency checking (Section 6.2) and confidence language detection (Section 6.3). Confabulated content tends to vary significantly across multiple generations (the LLM invents different details each time). Additionally, confabulated content sometimes exhibits characteristic confidence patterns -- either excessive hedging (the model is uncertain) or excessive confidence (the model asserts fabricated details with unwarranted certainty).

**Coverage**: Self-consistency checking is the strongest signal for confabulation but requires multiple sampled responses. Without multiple samples, confabulation detection relies on weaker signals (confidence language, entity fabrication patterns).

---

## 6. Detection Methods

### 6.1 Source Grounding

**Method ID**: `source-grounding`

**What it measures**: Whether the claims in the text are supported by the provided source documents. A grounded claim is one whose content can be traced to at least one source passage. An ungrounded claim is one that introduces information not found in any source -- potentially a hallucination or unsupported parametric knowledge.

**When it applies**: Only when the caller provides source documents via `check(text, { sources })` or uses `checkGrounded(text, sources)`. If no sources are provided, this method returns 1.0 (neutral -- cannot evaluate grounding without reference material) and is excluded from the composite score.

**Algorithm**:

1. **Claim extraction**: Decompose the text into individual claims (see Section 7).

2. **Text normalization**: For each claim and each source document, normalize: lowercase, collapse whitespace, strip leading/trailing punctuation, remove common articles and prepositions for matching purposes (but preserve the original text for reporting).

3. **Exact substring matching**:
   a. Check if the normalized claim text (or any contiguous sequence of 5+ words from the claim) appears verbatim in any normalized source.
   b. If found, the claim is grounded with confidence 1.0 and match type `exact`.

4. **Fuzzy substring matching**:
   a. Slide a window of size `claim.length +/- 20%` across each source document.
   b. For each window position, compute normalized Levenshtein similarity using `fastest-levenshtein`: `1 - (distance / max(claim.length, window.length))`.
   c. Pre-filter using character trigram overlap: only evaluate positions where at least 30% of the claim's character trigrams appear within the window.
   d. If the best similarity exceeds the fuzzy threshold (default: 0.75), the claim is grounded with the similarity as confidence and match type `fuzzy`.

5. **N-gram overlap matching**:
   a. Tokenize both claim and source into words. Remove stopwords.
   b. Generate word n-grams for n = 1, 2, 3.
   c. Compute weighted Jaccard similarity: `0.2 * jaccard_1 + 0.3 * jaccard_2 + 0.5 * jaccard_3`.
   d. If the weighted score exceeds the n-gram threshold (default: 0.3), the claim has supporting evidence with the score as confidence and match type `ngram`.

6. **TF-IDF cosine similarity**:
   a. Build a vocabulary and compute IDF values across all source documents.
   b. Compute TF-IDF vectors for the claim and each source.
   c. Compute cosine similarity between the claim vector and each source vector.
   d. If cosine similarity exceeds the TF-IDF threshold (default: 0.3), the claim has supporting evidence with the score as confidence and match type `tfidf`.

7. **Embedding similarity** (optional, pluggable):
   a. If the caller provides an `embedder` function, compute embeddings for the claim and each source.
   b. Compute cosine similarity between claim embedding and source embeddings.
   c. If similarity exceeds the embedding threshold (default: 0.8), the claim is grounded with the similarity as confidence and match type `embedding`.

8. **Composite per-claim grounding score**: Weighted combination of all active matching strategies, using the same weight scheme as `rag-cite`:

   | Strategy | Default Weight (no embedder) | Default Weight (with embedder) |
   |----------|-----|-----|
   | Exact substring | 0.40 | 0.30 |
   | Fuzzy substring | 0.25 | 0.15 |
   | N-gram overlap | 0.20 | 0.15 |
   | TF-IDF cosine | 0.15 | 0.10 |
   | Embedding | 0.00 | 0.30 |

9. **Grounding threshold**: A claim is considered grounded if its composite grounding score exceeds the `groundingThreshold` (default: 0.4). Claims below the threshold are flagged as ungrounded.

10. **Method-level score**: `groundedClaimCount / totalFactualClaimCount`. A score of 1.0 means every factual claim is grounded. A score of 0.0 means no claims are grounded.

**Findings emitted**:
- `{ id: 'claim-ungrounded', severity: 'warning', message: 'Claim not supported by any source: "..."' }` for each ungrounded claim.
- `{ id: 'claim-weakly-grounded', severity: 'info', message: 'Claim weakly grounded (score 0.42): "..."' }` for claims just above the threshold.
- `{ id: 'claim-contradicts-source', severity: 'critical', message: 'Claim appears to contradict source: claim says "50%" but source says "5%"' }` when a numerical contradiction is detected.

**Default weight in composite**: 0.30 (when sources are provided). 0.00 (when no sources are provided -- excluded and weight redistributed).

---

### 6.2 Self-Consistency

**Method ID**: `self-consistency`

**What it measures**: Whether the LLM produces consistent claims across multiple sampled responses to the same prompt. The key insight from SelfCheckGPT is that factual claims grounded in the model's training data tend to be consistent across samples, while hallucinated claims vary -- the model invents different "facts" each time because it has no grounded knowledge to anchor to.

**When it applies**: Only when the caller provides multiple response samples via `checkConsistency(responses)` or `check(text, { samples })`. If no samples are provided, this method returns 1.0 (neutral) and is excluded from the composite score.

**Algorithm**:

1. **Claim extraction from primary response**: Decompose the first (primary) response into individual claims using the standard claim extraction pipeline (Section 7).

2. **Claim matching across samples**: For each claim in the primary response, check whether the same or equivalent claim appears in the other sampled responses:
   a. **Exact match**: The claim appears verbatim (after normalization) in the sample.
   b. **Fuzzy match**: The claim appears with minor wording differences (normalized Levenshtein similarity > 0.8).
   c. **Semantic match**: The claim is conveyed using different words but the same meaning (n-gram overlap > 0.4 after stopword removal, or embedding similarity > 0.8 if embedder is provided).

3. **Consistency score per claim**: `matchingSampleCount / totalSampleCount`. If the claim appears in all samples, consistency is 1.0. If it appears in none, consistency is 0.0.

4. **Contradiction detection across samples**: For each claim in the primary response, check whether any sample contains a contradicting claim:
   a. A contradicting claim is one that shares key entities and topic (high n-gram overlap of nouns) but uses negation or opposing quantifiers ("increased" vs. "decreased", "15%" vs. "50%").
   b. Contradicted claims receive a lower consistency score: `max(0, consistencyScore - 0.3)`.

5. **Method-level score**: Average of per-claim consistency scores, weighted by claim importance (claims with more specific/detailed content are weighted higher than generic claims).

**Findings emitted**:
- `{ id: 'claim-inconsistent', severity: 'warning', message: 'Claim appears in only 1 of 4 samples: "..."' }` for inconsistent claims.
- `{ id: 'claim-contradicted', severity: 'critical', message: 'Claim contradicted in sample 3: primary says "15%" but sample says "50%"' }` for contradicted claims.
- `{ id: 'claim-consistent', severity: 'info', message: 'Claim consistent across all 4 samples: "..."' }` for verified claims (emitted only in verbose mode).

**Default weight in composite**: 0.25 (when samples are provided). 0.00 (when no samples are provided -- excluded and weight redistributed).

---

### 6.3 Confidence Language

**Method ID**: `confidence-language`

**What it measures**: The presence and density of linguistic markers that correlate with hallucination. LLMs exhibit characteristic language patterns when generating uncertain or fabricated content: hedging phrases ("I think," "probably," "it seems"), uncertainty disclaimers ("I'm not sure," "I could be wrong"), knowledge cutoff references ("as of my last update"), and excessive confidence markers ("definitely," "without a doubt," "100%") that overcompensate for underlying uncertainty.

**When it applies**: Always. This method analyzes the text itself without requiring external context.

**Algorithm**:

1. **Hedging phrase detection**: Scan for phrases indicating uncertainty. These correlate with hallucination because LLMs tend to hedge more when generating content they are uncertain about.

   **Hedging phrase catalog** (case-insensitive):

   | Category | Phrases |
   |---|---|
   | Belief qualifiers | "I think", "I believe", "I'm not sure", "I'm not certain", "I'm not entirely sure", "if I recall correctly", "if I remember correctly", "to the best of my knowledge", "as far as I know" |
   | Possibility markers | "probably", "possibly", "perhaps", "maybe", "might be", "could be", "it's possible that", "there's a chance that", "it seems like", "it appears that", "it seems to be", "it looks like" |
   | Approximation markers | "approximately", "roughly", "around", "about" (when preceding numbers), "more or less", "give or take", "somewhere around", "in the ballpark of", "estimated", "on the order of" |
   | Uncertainty disclaimers | "I'm not 100% sure", "don't quote me on this", "take this with a grain of salt", "this may not be accurate", "I could be wrong", "this is my understanding", "I may be mistaken" |
   | Knowledge cutoff references | "as of my last update", "as of my knowledge cutoff", "I don't have access to real-time", "my training data goes up to", "I was trained on data up to", "I cannot verify current", "this information may be outdated" |

   Compute hedging density: `hedgingPhraseCount / sentenceCount`. A density above 0.3 indicates high hallucination risk. Score contribution: `1.0 - min(1.0, hedgingDensity * 2.5)`.

2. **Overconfidence detection**: Scan for patterns where the model expresses very high confidence about claims that are inherently uncertain. Overconfidence paired with specific factual claims can indicate the model is masking uncertainty.

   **Overconfidence phrase catalog** (case-insensitive):

   | Category | Phrases |
   |---|---|
   | Absolute certainty | "definitely", "certainly", "without a doubt", "100%", "guaranteed", "undeniably", "indisputably", "unquestionably" |
   | Universal quantifiers | "always", "never", "every single", "in all cases", "without exception", "no one has ever", "everyone knows" |
   | False precision | "exactly", "precisely" (when followed by round numbers or estimates), specific decimal percentages in contexts where such precision is implausible |

   Overconfidence scoring is asymmetric: a single overconfident phrase in an otherwise well-hedged text is not alarming, but overconfidence combined with other hallucination indicators amplifies the risk. Score contribution: when combined with other warning signals, each overconfidence marker deducts 0.05 (down to a floor of 0.5). When no other signals are present, overconfidence markers are treated as info-level findings with no score impact.

3. **Weasel word detection**: Scan for vague attributions that disguise unsupported claims as sourced.

   **Weasel phrase catalog**: "some experts say", "studies have shown", "research suggests", "it is widely believed", "many people think", "it is generally accepted", "according to some sources", "it has been reported".

   Weasel words are a moderate signal: they often appear in legitimate text but are also a hallucination marker when the model fabricates a vague authority to lend credibility to an unsupported claim. Each weasel phrase adds an info-level finding. Score contribution: `1.0 - min(1.0, weaselPhraseCount * 0.08)`.

4. **Composite**: Weighted combination of sub-scores. Hedging detection contributes 0.60, overconfidence detection contributes 0.25, weasel word detection contributes 0.15.

**Findings emitted**:
- `{ id: 'hedging-phrase', severity: 'warning', message: 'Hedging phrase detected: "I believe"', location: { start: 0, end: 10 } }`
- `{ id: 'overconfidence', severity: 'info', message: 'Overconfidence marker: "definitely" used with factual claim', location: { start: 50, end: 61 } }`
- `{ id: 'weasel-phrase', severity: 'info', message: 'Vague attribution: "studies have shown"', location: { start: 100, end: 120 } }`
- `{ id: 'high-hedging-density', severity: 'critical', message: 'Hedging density 0.45 exceeds threshold (0.30)', location: null }`

**Default weight in composite**: 0.15.

---

### 6.4 Fabricated Entities

**Method ID**: `fabricated-entities`

**What it measures**: Whether the text contains named entities -- people, organizations, publications, URLs, email addresses, dates, and specific identifiers -- that are likely fabricated by the LLM. Entity fabrication is one of the most distinctive hallucination patterns: LLMs generate plausible-sounding but nonexistent journal names, author names, URLs, DOIs, and institutional affiliations.

**When it applies**: Always, though detection accuracy improves when source documents are provided (entities can be cross-referenced against sources).

**Algorithm**:

1. **URL fabrication detection**:
   a. Extract all URLs using regex: `https?://[^\s<>")\]]+`.
   b. Check each URL for fabrication indicators:
      - **Example domain usage**: URL uses `example.com`, `example.org`, `test.com`, `sample.org`, `placeholder.com` outside of explicitly illustrative context. Severity: warning.
      - **Overly specific long paths**: URL path has 5+ segments with title-like slugs (e.g., `/articles/2024/comprehensive-guide-to-hallucination-detection`). LLMs tend to generate long, descriptive URL paths that real websites rarely use. Severity: warning.
      - **Domain-path format mismatch**: URL references a known real domain but with a path structure inconsistent with that domain. For example, `arxiv.org/abs/` followed by a paper ID that does not match arxiv's `YYMM.NNNNN` format, or `doi.org/10.` followed by a DOI that does not follow standard DOI structure. Severity: critical.
      - **Suspicious TLD**: URL uses an unusual or nonsensical top-level domain. Severity: info.
      - **IP address URLs**: URL uses a raw IP address (e.g., `http://192.168.1.1/paper.pdf`) in a context where a domain name would be expected. Severity: info.
   c. Score contribution: `1.0 - min(1.0, suspiciousUrlCount * 0.25)`.

2. **Citation fabrication detection**:
   a. Extract academic citation patterns: `Author (Year)`, `Author et al. (Year)`, `(Author, Year)`, `[N]` style references with subsequent bibliography entries, DOI references.
   b. Check each citation for plausibility:
      - **Year range**: Citations with years in the future (more than 1 year beyond current date) add a critical finding. Citations with years before 1800 for scientific papers add a warning finding.
      - **Author name plausibility**: Single-word author names that are common English nouns rather than surnames add a warning finding. Author names with unusual character patterns add an info finding.
      - **Journal name plausibility**: Very long journal names (> 80 characters), journal names containing unusual character sequences, or journal names that read like descriptions rather than proper nouns add a warning finding.
      - **DOI format**: DOIs that do not match the standard `10.NNNN/...` format add a warning finding.
      - **Paper ID format**: arXiv IDs that do not match `YYMM.NNNNN(N)` format, PubMed IDs that are not numeric, ISBN numbers with invalid check digits add warning findings.
   c. Score contribution: `1.0 - min(1.0, implausibleCitationCount * 0.20)`.

3. **Date fabrication detection**:
   a. Extract dates in common formats: `YYYY-MM-DD`, `MM/DD/YYYY`, `DD/MM/YYYY`, `Month DD, YYYY`, `DD Month YYYY`, and natural language date expressions ("in January 2025", "on March 15th").
   b. Check each date for validity:
      - **Impossible dates**: Month > 12, day > 31, February 29 in non-leap years, February 30/31, April/June/September/November 31. Severity: critical.
      - **Future dates**: Dates more than 2 years in the future (configurable). Severity: warning.
      - **Implausible historical dates**: Dates before 1900 in contexts where modern events are discussed. Severity: info.
      - **Conflicting dates**: The same event described with different dates within the text. Severity: critical.
   c. Score contribution: `1.0 - min(1.0, fabricatedDateCount * 0.30)`.

4. **Entity-source cross-referencing** (when sources are provided):
   a. Extract named entities from the text using pattern-based recognition:
      - **Person names**: Capitalized multi-word sequences following patterns like "Dr. First Last", "First Last", "First M. Last", or preceded by titles (Mr., Mrs., Prof., Dr.).
      - **Organization names**: Capitalized multi-word sequences preceded by keywords ("the", "at", "from") or following patterns like "University of...", "Institute for...", "Department of...".
      - **Publication names**: Text in italics or quotes following "published in", "in the journal", "in the proceedings of".
   b. For each extracted entity, search for it (or close variants) in the source documents.
   c. Entities not found in any source document are flagged as potentially fabricated. Severity: warning (person/org names), info (generic entities).
   d. Score contribution: `1.0 - min(1.0, unfoundEntityCount * 0.15)`.

5. **Email fabrication detection**:
   a. Extract email addresses using standard email regex.
   b. Check for fabrication indicators: domain is `example.com`, domain is a clearly fake name, local part follows LLM patterns (e.g., `john.doe@company.com` as a generic placeholder).
   c. Score contribution: `1.0 - min(1.0, suspiciousEmailCount * 0.15)`.

6. **Composite**: Minimum of all active sub-scores (worst-case approach). A single fabricated URL is enough to undermine trust. Score is floored at 0.0.

**Findings emitted**:
- `{ id: 'fabricated-url', severity: 'critical', message: 'URL follows LLM fabrication pattern: "http://..."', location: { start: 120, end: 180 } }`
- `{ id: 'future-citation', severity: 'critical', message: 'Citation dated 2028 is in the future', location: { start: 200, end: 230 } }`
- `{ id: 'impossible-date', severity: 'critical', message: 'Impossible date: February 30', location: { start: 300, end: 315 } }`
- `{ id: 'entity-not-in-source', severity: 'warning', message: 'Person "Dr. James Thornton" not found in any source', location: { start: 20, end: 39 } }`
- `{ id: 'implausible-journal', severity: 'warning', message: 'Journal name unusually long or descriptive: "International Journal of..."', location: { start: 240, end: 310 } }`

**Default weight in composite**: 0.20.

---

### 6.5 Numerical Plausibility

**Method ID**: `numerical-plausibility`

**What it measures**: Whether numerical claims in the text are internally consistent and plausible. LLMs frequently hallucinate numbers: percentages that do not sum to 100, growth rates that are orders of magnitude off, counts that are inconsistent with other numbers in the same text, and statistics that contradict basic mathematical constraints.

**When it applies**: Always, though the method is most informative for text containing numerical claims. For text with no numbers, the method returns 1.0 (neutral).

**Algorithm**:

1. **Numerical extraction**: Extract all numbers and their surrounding context using regex patterns that capture:
   - Integers and decimals: `\b\d+\.?\d*\b`
   - Percentages: `\d+\.?\d*%`
   - Currency amounts: `\$\d+`, `\d+ dollars/euros/pounds`
   - Ordinals: "first", "second", "third", "1st", "2nd", "3rd"
   - Multipliers: "thousand", "million", "billion", "trillion"
   - Fractions: "one-third", "3/4", "half"

   Each extracted number is tagged with its context: the surrounding sentence, any associated unit, and the entity it describes.

2. **Percentage consistency**: Check whether percentages in the text are internally consistent:
   a. If the text lists components as percentages of a whole (e.g., "40% were male, 35% were female, 30% were undetermined"), check if they sum to approximately 100%. Deviations greater than 5% add a warning finding.
   b. If a percentage exceeds 100% in a context where it should not (e.g., "150% of respondents"), add a critical finding. Exception: contexts where >100% is valid ("150% increase", "200% of target").
   c. Score contribution: `1.0 - min(1.0, percentageViolationCount * 0.30)`.

3. **Order of magnitude check**: When source documents are provided, compare numerical claims against source numbers:
   a. Extract numbers from both the text and the sources.
   b. Match numbers by surrounding entity/topic (same noun phrases within 5 words of the number).
   c. If a matched pair has a ratio greater than 10x or less than 0.1x (order of magnitude difference), flag it. "The company has 500 employees" vs. source saying "50,000 employees" is a critical finding.
   d. Score contribution: `1.0 - min(1.0, magnitudeViolationCount * 0.35)`.

4. **Internal numerical consistency**: Check whether numbers within the text are consistent with each other:
   a. If the text states a total and then lists components, check if components sum to the stated total.
   b. If the text states a rate and a duration, check if the implied quantity is plausible.
   c. If the text states "increased from X to Y" or "decreased from X to Y", check that the direction is consistent with "increased"/"decreased".
   d. Score contribution: `1.0 - min(1.0, internalViolationCount * 0.25)`.

5. **Round number suspicion**: When the text contains many suspiciously round numbers ("about 1,000", "approximately 500", "around 10,000") in contexts where precise figures are expected, add info-level findings. Round numbers alone are a weak signal -- they may be legitimate approximations -- but they amplify other signals.

6. **Composite**: Weighted average of sub-scores. Percentage consistency contributes 0.30, order of magnitude contributes 0.35, internal consistency contributes 0.25, round number suspicion contributes 0.10.

**Findings emitted**:
- `{ id: 'percentage-sum-error', severity: 'warning', message: 'Percentages sum to 105% (expected ~100%): 40% + 35% + 30%', location: null }`
- `{ id: 'magnitude-mismatch', severity: 'critical', message: 'Claim says "500 employees" but source says "50,000 employees" (100x difference)', location: { start: 80, end: 95 } }`
- `{ id: 'direction-mismatch', severity: 'critical', message: 'Text says "increased" but values show decrease: from 100 to 50', location: { start: 150, end: 185 } }`
- `{ id: 'suspicious-round-numbers', severity: 'info', message: '4 of 5 numerical claims use round numbers', location: null }`

**Default weight in composite**: 0.10.

---

### 6.6 Internal Consistency

**Method ID**: `internal-consistency`

**What it measures**: Whether the text contradicts itself. Internal contradictions are a strong hallucination signal: when the model makes two incompatible claims in the same response, at least one of them must be wrong. Internal consistency does not require source documents -- it analyzes the text against itself.

**When it applies**: Always. This method is especially valuable when no source documents are available.

**Algorithm**:

1. **Explicit contradiction patterns**: Scan for linguistic patterns that indicate self-correction or contradiction:
   a. **Self-correction markers**: "actually", "correction:", "I should clarify", "to be more precise", "I made an error", "that's not right", "let me correct that". These indicate the model is aware of a contradiction. Each occurrence adds a warning finding.
   b. **However-negation patterns**: A declarative statement followed within 2-3 sentences by "however" + negation of the same subject. "The company was founded in 1990. However, the company was not actually established until 1995." Detection: extract subject-verb-object triples, look for negation of the same subject-verb pair.
   c. **Opposite descriptors**: The same entity described with antonymic adjectives. "The process is simple... The process is extremely complex." Detection: extract entity-adjective pairs, check for antonym pairs from a built-in antonym list (~200 common antonym pairs: simple/complex, large/small, fast/slow, increase/decrease, more/less, etc.).

2. **Numerical contradictions**: The same quantity stated differently in different parts of the text:
   a. Extract all numerical claims with their associated entities (see Section 6.5 numerical extraction).
   b. Group by entity (same noun phrases).
   c. If the same entity has two different numerical values that cannot both be true (e.g., "The building is 50 stories tall" and "The 30-story building"), flag it.
   d. Exception: different time periods ("revenue was $10M in 2022 and $15M in 2023") are not contradictions.

3. **Temporal contradictions**: Inconsistent ordering or dating of events:
   a. Extract event-date pairs.
   b. If an event is dated differently in two places, flag it.
   c. If a temporal sequence is inconsistent ("After the 2020 launch... before the product launched in 2020..."), flag it.

4. **Assertion-negation pairs**: Detect cases where the model asserts something and then negates it:
   a. Extract simple declarative assertions: "X is Y", "X has Y", "X does Y".
   b. For each assertion, search for negations of the same assertion: "X is not Y", "X does not have Y", "X does not Y".
   c. Context-aware: negations in different scopes are not contradictions ("In 2020, X was Y. In 2021, X was no longer Y" is a legitimate temporal distinction, not a contradiction).

5. **Method-level score**: `1.0 - min(1.0, contradictionCount * 0.25)`. Each detected contradiction deducts 0.25 from the score, capped at 0.0. Contradictions are severe: even one is a strong hallucination indicator.

**Findings emitted**:
- `{ id: 'self-correction', severity: 'warning', message: 'Self-correction detected: "actually, the date was..."', location: { start: 200, end: 240 } }`
- `{ id: 'numerical-contradiction', severity: 'critical', message: 'Same entity with conflicting values: "50 stories" vs. "30-story"', location: { start: 100, end: 115 } }`
- `{ id: 'antonym-contradiction', severity: 'critical', message: 'Same entity described as both "simple" and "complex"', location: { start: 300, end: 320 } }`
- `{ id: 'temporal-contradiction', severity: 'critical', message: 'Event "launch" dated as both "2020" and "2021"', location: { start: 400, end: 430 } }`

**Default weight in composite**: 0.15 (when sources are not provided, weight is higher due to redistribution). This method is always active and is especially important when source grounding is not available.

---

## 7. Claim Extraction

### Overview

Claim extraction decomposes the input text into individual factual assertions. This is the foundation for all detection methods that operate at claim granularity (source grounding, self-consistency, per-claim scoring). The claim extraction pipeline is shared with `rag-cite`'s claim extractor in design but implemented independently to avoid a cross-package dependency.

### Sentence Segmentation

The primary claim boundary is the sentence. The segmenter splits the text into sentences using a rule-based approach:

1. **Sentence-ending punctuation**: Split on `.`, `!`, `?` followed by whitespace and a capital letter (or end of string).
2. **Abbreviation handling**: Common abbreviations that contain periods do not trigger a split: `Dr.`, `Mr.`, `Mrs.`, `Ms.`, `Prof.`, `e.g.`, `i.e.`, `vs.`, `etc.`, `U.S.`, `U.K.`, `Inc.`, `Ltd.`, `Corp.`, `Jr.`, `Sr.`, `St.`.
3. **Decimal numbers**: Periods within numbers (`3.14`, `$1,200.50`) do not trigger a split.
4. **Ellipses**: `...` does not trigger a split.
5. **URLs**: Periods within URLs do not trigger splits.
6. **Newlines**: Double newlines (`\n\n`) always trigger a split. Single newlines within a paragraph do not trigger a split unless followed by a list marker.
7. **List items**: Lines starting with `- `, `* `, `1. `, or similar list markers are treated as individual claims.

### Sub-Sentence Decomposition

When `claimGranularity` is set to `'clause'`, the extractor further decomposes sentences into clauses:

- Split on coordinating conjunctions with independent clauses: `, and`, `, but`, `, or`, `, yet` where each clause makes an independent factual assertion.
- Split on semicolons.
- Each clause becomes a separate claim for evaluation.

### Non-Factual Content Filtering

Not every sentence makes a verifiable factual assertion. The extractor filters out non-factual content to avoid false positives (flagging a hedging statement as "ungrounded" when it was never meant to be a factual assertion):

| Category | Detection Heuristic | Examples |
|----------|-------------------|----------|
| Questions | Ends with `?` or starts with question words (`What`, `How`, `Why`, `When`, `Where`, `Who`, `Which`, `Can`, `Could`, `Would`, `Should`, `Is`, `Are`, `Do`, `Does`) | "What does this mean?" |
| Hedging language | Starts with or contains strong hedging markers: `I think`, `I believe`, `It seems`, `It appears`, `possibly`, `perhaps`, `might`, `may` (when the hedging is the primary content, not a modifier on a factual claim) | "I think this might be related." |
| Meta-commentary | Sentences about the response itself: `As mentioned`, `As discussed`, `In summary`, `To summarize`, `In conclusion`, `As noted above`, `Let me explain` | "As mentioned earlier, ..." |
| Transition phrases | Standalone transitions: `Moving on`, `Next`, `Additionally`, `Furthermore`, `Moreover`, `However` (when standalone, not followed by a factual clause) | "Let's move on to the next topic." |
| Greetings and closings | Social niceties: `Sure!`, `Great question!`, `I hope this helps`, `Let me know if you have questions`, `Happy to help` | "I hope this helps!" |
| Disclaimers | Standard LLM disclaimers: `I'm an AI`, `I don't have personal opinions`, `My training data`, `I cannot guarantee`, `Please verify`, `Consult a professional` | "Please note that I'm an AI assistant." |
| Opinions | Explicit opinion markers: `In my opinion`, `I feel that`, `I'd recommend`, `My suggestion would be` | "In my opinion, this is a good approach." |

Filtering is conservative: a sentence is only filtered if it matches a non-factual pattern with high confidence. Sentences that contain both hedging and factual content ("I believe Paris is the capital of France") are kept as claims -- the hedging is noted as a confidence language finding (Section 6.3) but the factual content is still evaluated.

### Claim Output

Each extracted claim is a `Claim` object containing:

- `text`: The claim text.
- `sentence`: The source sentence from which the claim was extracted.
- `startOffset` / `endOffset`: Character offsets in the original text.
- `isFactual`: Whether the claim passed the non-factual content filter.
- `index`: Sequential index in the claim list.

---

## 8. Grounding Verification

### Overview

Grounding verification is the process of determining whether each claim in the text is supported by the provided source documents. It is the core of the `checkGrounded()` function and the source-grounding detection method. The process matches claims to sources using multiple text similarity strategies and classifies each claim as grounded, weakly grounded, or ungrounded.

### Claim-Source Matching Pipeline

For each factual claim, the pipeline evaluates the claim against every source document (or a pre-filtered subset for large source sets):

1. **Pre-filtering** (for > 20 source documents): Compute the number of shared unique non-stopword terms between the claim and each source. Select the top `maxSourcesPerClaim` (default: 20) sources by shared term count. This reduces computation from O(claims x sources) to O(claims x maxSourcesPerClaim) for the expensive matching operations.

2. **Multi-strategy matching**: Run all active matching strategies (exact, fuzzy, n-gram, TF-IDF, embedding) against each candidate source. Each strategy produces a 0-1 similarity score.

3. **Composite scoring**: Combine strategy scores using the configurable weights (Section 6.1, step 8).

4. **Grounding classification**:

   | Composite Score | Classification | Meaning |
   |----------------|----------------|---------|
   | >= 0.7 | `grounded` | Strong evidence of support in at least one source |
   | 0.4 - 0.69 | `weakly-grounded` | Partial evidence; may be paraphrased or indirectly supported |
   | < 0.4 | `ungrounded` | No meaningful support found in any source |

5. **Contradiction detection**: For claims classified as weakly-grounded or ungrounded, check whether the claim actively contradicts a source passage (as opposed to simply not being present). Extract numerical values and key predicates from both claim and best-matching source. If the claim asserts a different value for the same entity/attribute as the source, flag it as a contradiction (more severe than merely ungrounded).

### Source Match Evidence

For each claim-source match, the pipeline records the specific evidence:

- The matching source document and its ID.
- The confidence score and primary match type.
- The specific substring in the source that best matches the claim (for substring-based matches).
- The character offset of the match evidence within the source.

This evidence enables consumers to display "this claim is supported by [Source 3]: '...relevant excerpt...'" in their UI.

### Grounding Score Computation

The overall grounding score is computed as:

```
grounding_score = Σ(per_claim_grounding_score) / factual_claim_count
```

Where `per_claim_grounding_score` is: 1.0 for `grounded` claims, 0.5 for `weakly-grounded` claims, 0.0 for `ungrounded` claims, and -0.2 penalty for `contradicts-source` claims (clamped so the per-claim minimum is 0.0).

---

## 9. Self-Consistency Checking

### Overview

Self-consistency checking implements a simplified version of the SelfCheckGPT approach: if the LLM generates consistent claims across multiple independent samples, those claims are likely grounded in the model's knowledge; if the claims vary, they are likely hallucinated. This method requires the caller to provide multiple responses to the same prompt.

### Sample Requirements

- **Minimum samples**: 2 (the primary response plus at least 1 additional sample).
- **Recommended samples**: 3-5 for reliable consistency measurement.
- **Maximum samples**: No hard limit, but diminishing returns above 10 samples. Processing time scales linearly with sample count.
- **Sample quality**: Samples should be generated with the same prompt and similar settings (temperature > 0 to ensure variation). Samples generated with temperature 0 may be near-identical, making consistency checking uninformative.

### Consistency Measurement

For each claim in the primary response, the consistency checker computes a support score across the other samples:

1. **Claim presence in sample**: For each non-primary sample, determine whether the claim (or its equivalent) appears:
   a. **Direct match** (similarity > 0.85): The claim appears almost verbatim. Support = 1.0.
   b. **Paraphrase match** (similarity 0.5 - 0.85): The claim is conveyed with different wording. Support = 0.7.
   c. **Partial match** (similarity 0.3 - 0.5): Some elements of the claim appear. Support = 0.3.
   d. **No match** (similarity < 0.3): The claim does not appear. Support = 0.0.
   e. **Contradiction** (high entity overlap but negation/different values): The sample contradicts the claim. Support = -0.5.

2. **Aggregation**: The claim's consistency score is the average support across all non-primary samples, clamped to [0.0, 1.0].

3. **Interpretation**:

   | Consistency Score | Interpretation |
   |-------------------|---------------|
   | 0.8 - 1.0 | Highly consistent. Claim likely grounded in model knowledge. |
   | 0.5 - 0.79 | Moderately consistent. Claim appears in most samples with some variation. |
   | 0.2 - 0.49 | Inconsistent. Claim appears in some samples but not others. Potential hallucination. |
   | 0.0 - 0.19 | Highly inconsistent. Claim is unique to the primary response. Likely hallucinated. |

### Method-Level Score

The overall self-consistency score is the weighted average of per-claim consistency scores, where claims with more specific content (containing named entities, numbers, dates) receive higher weight than generic claims. The intuition is that specific claims are more informative: if the model consistently says "the population is 67 million," that is a stronger signal than if it consistently says "Paris is a large city."

---

## 10. Hallucination Score

### Composite Score Computation

The hallucination score is computed as a weighted average of all applicable detection method scores:

```
hallucinationScore = Σ(methodScore_i x weight_i) / Σ(weight_i)
```

Where the sum runs only over applicable methods (methods whose weight is non-zero after redistribution). Methods that do not apply (no sources for source-grounding, no samples for self-consistency) have their weights set to zero, and the remaining weights are scaled proportionally so they still sum to 1.0.

### Default Weights

| Method | Default Weight | Condition |
|--------|---------------|-----------|
| Source Grounding | 0.30 | Only when `sources` is provided |
| Self-Consistency | 0.25 | Only when `samples` is provided |
| Confidence Language | 0.15 | Always |
| Fabricated Entities | 0.20 | Always |
| Numerical Plausibility | 0.10 | Always |
| Internal Consistency | 0.15 | Always |

**Note**: The default weights sum to more than 1.0 because source grounding and self-consistency are rarely both active simultaneously. When only the always-on methods are active (no sources, no samples), the redistributed weights are:

| Method | Redistributed Weight |
|--------|---------------------|
| Confidence Language | 0.25 |
| Fabricated Entities | 0.33 |
| Numerical Plausibility | 0.17 |
| Internal Consistency | 0.25 |

When sources are provided but no samples:

| Method | Redistributed Weight |
|--------|---------------------|
| Source Grounding | 0.33 |
| Confidence Language | 0.17 |
| Fabricated Entities | 0.22 |
| Numerical Plausibility | 0.11 |
| Internal Consistency | 0.17 |

### Critical Method Floor

Certain methods represent hard hallucination signals that should cap the composite score. A text that contains a fabricated URL pointing to a nonexistent domain should not score 0.9 just because confidence language and numerical plausibility are clean.

**Default critical methods**:

| Method | Floor Threshold | Ceiling When Below Floor |
|--------|----------------|--------------------------|
| Source Grounding | 0.3 | 0.3 |
| Internal Consistency | 0.2 | 0.25 |
| Fabricated Entities | 0.2 | 0.3 |

Example: if source grounding scores 0.2 (most claims ungrounded), the composite score is capped at 0.3 even if all other methods score 1.0.

### Score Calibration

The composite score is calibrated so that:

- **0.9 - 1.0**: No hallucination indicators. Text appears trustworthy based on available evidence.
- **0.7 - 0.89**: Minor indicators. A few hedging phrases or one weakly grounded claim. Text is likely acceptable but warrants awareness.
- **0.4 - 0.69**: Moderate indicators. Multiple ungrounded claims, fabricated entity patterns, or inconsistency signals. Text should be reviewed before use.
- **0.0 - 0.39**: Strong indicators. Pervasive hallucination signals: many ungrounded claims, fabricated URLs/citations, internal contradictions, or high inconsistency across samples. Text should not be used without verification.

### Per-Claim Hallucination Score

Each claim receives its own hallucination score, computed from the subset of methods that operate at claim granularity:

- Source grounding: per-claim grounding score (0-1).
- Self-consistency: per-claim consistency score (0-1).
- Confidence language: per-claim hedging density (presence of hedging phrases in or adjacent to the claim sentence).
- Fabricated entities: per-claim entity fabrication score (whether entities in this specific claim are suspicious).
- Numerical plausibility: per-claim numerical check (whether numbers in this specific claim are plausible).
- Internal consistency: per-claim contradiction involvement (whether this claim contradicts another claim in the text).

The per-claim score is the weighted average of applicable method scores for that claim. Claims are classified based on their score:

| Per-Claim Score | Classification |
|-----------------|---------------|
| >= 0.7 | `supported` |
| 0.4 - 0.69 | `uncertain` |
| < 0.4 | `likely-hallucinated` |

---

## 11. API Surface

### Installation

```bash
npm install hallucinate-check
```

### Runtime Dependencies

```json
{
  "dependencies": {
    "fastest-levenshtein": "^1.0.16"
  }
}
```

### Main Export: `check`

The primary API. Extracts claims, runs all applicable detection methods, computes scores, and returns a comprehensive hallucination report.

```typescript
import { check } from 'hallucinate-check';

// Basic usage -- check text without source context
const report = check('The Eiffel Tower is 324 meters tall and was built in 1887.');
console.log(report.score);       // 0.88
console.log(report.pass);        // true
console.log(report.findings);    // []

// With source context for grounding verification
const report2 = check(
  'The building was designed by Dr. James Thornton in 2025 and stands 500 meters tall.',
  {
    sources: [
      'The building was designed by architect Sarah Chen in 2019. It is 50 meters tall.'
    ],
  },
);
console.log(report2.score);      // 0.18
console.log(report2.pass);       // false
console.log(report2.claims[0].classification); // 'likely-hallucinated'
console.log(report2.findings);
// [
//   { id: 'entity-not-in-source', severity: 'warning', message: 'Person "Dr. James Thornton" not found in source' },
//   { id: 'future-citation', severity: 'critical', message: 'Date "2025" may be fabricated (beyond current date)' },
//   { id: 'magnitude-mismatch', severity: 'critical', message: 'Height 500m vs source 50m (10x difference)' },
// ]
```

**Signature**:

```typescript
function check(text: string, options?: CheckOptions): HallucinationReport;
```

### `checkGrounded`

Source grounding verification focused API. Verifies whether claims are supported by source documents.

```typescript
import { checkGrounded } from 'hallucinate-check';

const report = checkGrounded(
  'Paris is the capital of France. It has a population of approximately 2.1 million.',
  [
    'Paris is the capital and largest city of France.',
    'The population of Paris is approximately 2.16 million inhabitants.',
  ],
);

console.log(report.groundingScore);    // 1.0
console.log(report.claims[0].grounded); // true
console.log(report.claims[1].grounded); // true
console.log(report.ungroundedClaims);   // []
```

**Signature**:

```typescript
function checkGrounded(
  text: string,
  sources: string[] | SourceDocument[],
  options?: GroundingOptions,
): GroundingReport;
```

### `checkConsistency`

Self-consistency checking across multiple sampled responses.

```typescript
import { checkConsistency } from 'hallucinate-check';

const report = checkConsistency([
  'The company was founded in 1995 by John Smith. It has 500 employees.',
  'The company was founded in 1995 by John Smith. It has about 480 employees.',
  'The company was founded in 1998 by John Smith. It has 500 employees.',
  'The company was founded in 1995 by Jane Doe. It employs around 500 people.',
]);

console.log(report.consistencyScore); // 0.65
console.log(report.claims[0]);
// { text: 'The company was founded in 1995 by John Smith.',
//   consistency: 0.55,  // founding year varies, founder name varies
//   classification: 'uncertain' }
console.log(report.inconsistentClaims);
// Claims that vary across samples
```

**Signature**:

```typescript
function checkConsistency(
  responses: string[],
  options?: ConsistencyOptions,
): ConsistencyReport;
```

### `extractClaims`

Extracts verifiable claims from text without performing hallucination detection. Useful for inspecting the claim decomposition or feeding claims into external evaluation systems.

```typescript
import { extractClaims } from 'hallucinate-check';

const claims = extractClaims(
  'Paris is the capital of France. What is its population? The city has about 2.1 million residents. I hope this helps!',
);

console.log(claims.filter(c => c.isFactual).length); // 2
// "Paris is the capital of France." and "The city has about 2.1 million residents."
// "What is its population?" filtered as question.
// "I hope this helps!" filtered as closing.
```

**Signature**:

```typescript
function extractClaims(
  text: string,
  options?: { claimGranularity?: 'sentence' | 'clause' },
): Claim[];
```

### `detectFabricatedEntities`

Detects potentially fabricated entities in the text. Can optionally cross-reference against source documents.

```typescript
import { detectFabricatedEntities } from 'hallucinate-check';

const result = detectFabricatedEntities(
  'According to Dr. James Thornton of the Institute for Advanced Language Studies (http://www.ials-research.org/papers/2028/language-hallucination), the phenomenon is well-documented.',
  ['The phenomenon of language model hallucination has been studied by researchers at MIT and Stanford.'],
);

console.log(result.fabricatedEntities);
// [
//   { type: 'person', value: 'Dr. James Thornton', confidence: 0.8, reason: 'Not found in sources' },
//   { type: 'organization', value: 'Institute for Advanced Language Studies', confidence: 0.7, reason: 'Not found in sources' },
//   { type: 'url', value: 'http://www.ials-research.org/papers/2028/language-hallucination', confidence: 0.9, reason: 'Future date in URL path, long descriptive path' },
// ]
console.log(result.score); // 0.15
```

**Signature**:

```typescript
function detectFabricatedEntities(
  text: string,
  sources?: string[] | SourceDocument[],
  options?: EntityDetectionOptions,
): EntityDetectionResult;
```

### Factory: `createChecker`

Creates a preconfigured checker instance with custom thresholds, weights, and detection method selection.

```typescript
import { createChecker } from 'hallucinate-check';

const checker = createChecker({
  weights: {
    'source-grounding': 0.40,
    'confidence-language': 0.10,
    'fabricated-entities': 0.25,
    'numerical-plausibility': 0.10,
    'internal-consistency': 0.15,
  },
  passThreshold: 0.6,
  groundingThreshold: 0.5,
  methods: ['source-grounding', 'fabricated-entities', 'internal-consistency'],
  customPatterns: {
    hedging: [/in my clinical opinion/i, /based on available evidence/i],
  },
});

const report1 = checker.check(text1, { sources: sources1 });
const report2 = checker.check(text2, { sources: sources2 });
const grounding = checker.checkGrounded(text3, sources3);
```

**Signature**:

```typescript
function createChecker(config: CheckerConfig): Checker;
```

### Type Definitions

```typescript
// -- Source Document Input ------------------------------------------------

/** A source document for grounding verification. */
interface SourceDocument {
  /** Unique identifier for the source. */
  id: string;

  /** The text content of the source document. */
  content: string;

  /** Optional metadata. */
  metadata?: Record<string, unknown>;
}

// -- Claim ---------------------------------------------------------------

/** A verifiable claim extracted from the text. */
interface Claim {
  /** The claim text. */
  text: string;

  /** The original sentence from which the claim was extracted. */
  sentence: string;

  /** Character offset in the original text. */
  startOffset: number;
  endOffset: number;

  /** Whether this claim was classified as a factual assertion. */
  isFactual: boolean;

  /** Sequential index in the claim list. */
  index: number;
}

// -- Finding -------------------------------------------------------------

/** A specific hallucination indicator detected during analysis. */
interface Finding {
  /** Unique finding identifier (e.g., 'fabricated-url', 'entity-not-in-source'). */
  id: string;

  /** Severity level. */
  severity: 'info' | 'warning' | 'critical';

  /** The detection method that produced this finding. */
  method: string;

  /** Human-readable description. */
  message: string;

  /** Location in the original text, if applicable. */
  location: FindingLocation | null;

  /** Index of the claim this finding applies to, if claim-level. */
  claimIndex: number | null;
}

/** Location of a finding in the original text. */
interface FindingLocation {
  /** Start character offset (0-based). */
  start: number;

  /** End character offset (exclusive). */
  end: number;
}

// -- Claim Assessment ----------------------------------------------------

/** Per-claim hallucination assessment. */
interface ClaimAssessment {
  /** The claim being assessed. */
  claim: Claim;

  /** Per-claim hallucination score (0.0 = likely hallucinated, 1.0 = supported). */
  score: number;

  /** Classification based on score. */
  classification: 'supported' | 'uncertain' | 'likely-hallucinated';

  /** Per-method scores for this claim. */
  methodScores: Partial<Record<string, number>>;

  /** Findings specific to this claim. */
  findings: Finding[];

  /** Grounding details (when sources are provided). */
  grounding: ClaimGrounding | null;

  /** Consistency details (when samples are provided). */
  consistency: ClaimConsistency | null;
}

/** Grounding details for a single claim. */
interface ClaimGrounding {
  /** Whether the claim is grounded in at least one source. */
  grounded: boolean;

  /** The grounding classification. */
  classification: 'grounded' | 'weakly-grounded' | 'ungrounded' | 'contradicts-source';

  /** The best matching source, if any. */
  bestMatch: SourceMatch | null;

  /** All source matches above a minimum threshold. */
  matches: SourceMatch[];
}

/** A match between a claim and a source document. */
interface SourceMatch {
  /** The matched source document. */
  source: SourceDocument | { index: number; content: string };

  /** Composite confidence score (0.0-1.0). */
  confidence: number;

  /** Which matching strategy produced the strongest signal. */
  primaryMatchType: 'exact' | 'fuzzy' | 'ngram' | 'tfidf' | 'embedding';

  /** Per-strategy scores. */
  strategyScores: {
    exact: number;
    fuzzy: number;
    ngram: number;
    tfidf: number;
    embedding: number;
  };

  /** The specific substring in the source that best matches the claim. */
  matchEvidence: string | null;
}

/** Consistency details for a single claim. */
interface ClaimConsistency {
  /** Consistency score across samples (0.0-1.0). */
  score: number;

  /** Number of samples in which this claim (or equivalent) appears. */
  appearsInSamples: number;

  /** Total number of non-primary samples. */
  totalSamples: number;

  /** Whether any sample contradicts this claim. */
  contradicted: boolean;
}

// -- Fabricated Entity ---------------------------------------------------

/** A potentially fabricated entity detected in the text. */
interface FabricatedEntity {
  /** The entity type. */
  type: 'person' | 'organization' | 'publication' | 'url' | 'email' | 'date' | 'identifier';

  /** The entity value as it appears in the text. */
  value: string;

  /** Confidence that the entity is fabricated (0.0-1.0). */
  confidence: number;

  /** Why the entity is flagged. */
  reason: string;

  /** Location in the original text. */
  location: FindingLocation;
}

// -- Reports -------------------------------------------------------------

/** The complete hallucination report returned by check(). */
interface HallucinationReport {
  /** Composite hallucination score (0.0 = high risk, 1.0 = low risk). */
  score: number;

  /** Whether the score meets or exceeds the pass threshold. */
  pass: boolean;

  /** The pass threshold used. */
  passThreshold: number;

  /** Per-method scores. Keys are method IDs, values are 0-1 scores. */
  methodScores: Record<string, number>;

  /** Per-claim assessments. */
  claims: ClaimAssessment[];

  /** Claims classified as 'likely-hallucinated'. */
  flagged: ClaimAssessment[];

  /** Claims classified as 'uncertain'. */
  uncertain: ClaimAssessment[];

  /** Claims classified as 'supported'. */
  supported: ClaimAssessment[];

  /** All findings detected across all methods. */
  findings: Finding[];

  /** Human-readable summary (1-3 sentences). */
  summary: string;

  /** Metadata about the check. */
  meta: CheckMeta;
}

/** Metadata about the check process. */
interface CheckMeta {
  /** Time taken, in milliseconds. */
  durationMs: number;

  /** The weights used for composite score calculation. */
  weights: Record<string, number>;

  /** Which methods were applicable (non-zero weight). */
  applicableMethods: string[];

  /** Whether any critical floor was triggered, and which one. */
  criticalFloorTriggered: string | null;

  /** Total number of claims extracted. */
  claimCount: number;

  /** Number of factual claims (after filtering). */
  factualClaimCount: number;

  /** Number of source documents provided. */
  sourceCount: number;

  /** Number of response samples provided (for self-consistency). */
  sampleCount: number;

  /** ISO 8601 timestamp of when the check was performed. */
  timestamp: string;
}

/** Grounding-specific report returned by checkGrounded(). */
interface GroundingReport {
  /** Overall grounding score (0.0-1.0). */
  groundingScore: number;

  /** Per-claim grounding assessments. */
  claims: Array<{
    claim: Claim;
    grounded: boolean;
    classification: 'grounded' | 'weakly-grounded' | 'ungrounded' | 'contradicts-source';
    bestMatch: SourceMatch | null;
    matches: SourceMatch[];
    score: number;
  }>;

  /** Claims not grounded in any source. */
  ungroundedClaims: Claim[];

  /** Claims that contradict a source. */
  contradictingClaims: Claim[];

  /** All findings from grounding analysis. */
  findings: Finding[];

  /** Wall-clock time in milliseconds. */
  durationMs: number;
}

/** Consistency-specific report returned by checkConsistency(). */
interface ConsistencyReport {
  /** Overall consistency score (0.0-1.0). */
  consistencyScore: number;

  /** Per-claim consistency assessments. */
  claims: Array<{
    claim: Claim;
    consistency: number;
    classification: 'supported' | 'uncertain' | 'likely-hallucinated';
    appearsInSamples: number;
    totalSamples: number;
    contradicted: boolean;
  }>;

  /** Claims that are inconsistent across samples. */
  inconsistentClaims: Claim[];

  /** Claims that are contradicted in at least one sample. */
  contradictedClaims: Claim[];

  /** All findings from consistency analysis. */
  findings: Finding[];

  /** Wall-clock time in milliseconds. */
  durationMs: number;
}

/** Result of fabricated entity detection. */
interface EntityDetectionResult {
  /** Entity detection score (0.0 = many fabricated, 1.0 = none fabricated). */
  score: number;

  /** Potentially fabricated entities. */
  fabricatedEntities: FabricatedEntity[];

  /** All findings from entity detection. */
  findings: Finding[];
}

// -- Options -------------------------------------------------------------

/** Options for the check() function. */
interface CheckOptions {
  /** Source documents for grounding verification. */
  sources?: string[] | SourceDocument[];

  /** Additional sampled responses for self-consistency checking. */
  samples?: string[];

  /** Detection method weights (overrides defaults). */
  weights?: Partial<Record<string, number>>;

  /** Pass/fail threshold. Default: 0.7. */
  passThreshold?: number;

  /** Grounding confidence threshold. Default: 0.4. */
  groundingThreshold?: number;

  /** Which detection methods to run. Default: all applicable. */
  methods?: string[];

  /** Claim extraction granularity. Default: 'sentence'. */
  claimGranularity?: 'sentence' | 'clause';

  /** Custom patterns to add to detection catalogs. */
  customPatterns?: CustomPatterns;

  /** Optional embedding function for semantic similarity. */
  embedder?: (text: string) => Promise<number[]> | number[];

  /** Embedding similarity threshold. Default: 0.8. */
  embeddingThreshold?: number;

  /** Critical method floor overrides. */
  criticalFloors?: Record<string, { threshold: number; ceiling: number }>;

  /** Maximum source documents to evaluate per claim. Default: 20. */
  maxSourcesPerClaim?: number;

  /** Fuzzy matching similarity threshold. Default: 0.75. */
  fuzzyThreshold?: number;

  /** N-gram overlap threshold. Default: 0.3. */
  ngramThreshold?: number;

  /** TF-IDF cosine similarity threshold. Default: 0.3. */
  tfidfThreshold?: number;

  /** Stopwords for text matching. Default: built-in English list. */
  stopwords?: string[];
}

/** Options for checkGrounded(). */
interface GroundingOptions {
  /** Grounding confidence threshold. Default: 0.4. */
  groundingThreshold?: number;

  /** Claim extraction granularity. Default: 'sentence'. */
  claimGranularity?: 'sentence' | 'clause';

  /** Optional embedding function. */
  embedder?: (text: string) => Promise<number[]> | number[];

  /** Embedding similarity threshold. Default: 0.8. */
  embeddingThreshold?: number;

  /** Maximum sources per claim. Default: 20. */
  maxSourcesPerClaim?: number;

  /** Matching strategy weights. */
  weights?: {
    exact?: number;
    fuzzy?: number;
    ngram?: number;
    tfidf?: number;
    embedding?: number;
  };

  /** Fuzzy matching threshold. Default: 0.75. */
  fuzzyThreshold?: number;

  /** N-gram threshold. Default: 0.3. */
  ngramThreshold?: number;

  /** TF-IDF threshold. Default: 0.3. */
  tfidfThreshold?: number;

  /** Stopwords. */
  stopwords?: string[];
}

/** Options for checkConsistency(). */
interface ConsistencyOptions {
  /** Claim extraction granularity. Default: 'sentence'. */
  claimGranularity?: 'sentence' | 'clause';

  /** Optional embedding function for semantic matching. */
  embedder?: (text: string) => Promise<number[]> | number[];

  /** Minimum similarity for claim matching across samples. Default: 0.5. */
  matchThreshold?: number;
}

/** Options for detectFabricatedEntities(). */
interface EntityDetectionOptions {
  /** Which entity types to check. Default: all. */
  entityTypes?: Array<'person' | 'organization' | 'publication' | 'url' | 'email' | 'date' | 'identifier'>;
}

/** Custom pattern overrides. */
interface CustomPatterns {
  /** Additional hedging phrases. */
  hedging?: RegExp[];

  /** Additional overconfidence phrases. */
  overconfidence?: RegExp[];

  /** Additional weasel phrases. */
  weasel?: RegExp[];

  /** Additional URL fabrication patterns. */
  urlFabrication?: RegExp[];

  /** Additional non-factual content filters. */
  nonFactual?: RegExp[];
}

// -- Checker Instance ----------------------------------------------------

/** Configuration for createChecker(). */
interface CheckerConfig extends Omit<CheckOptions, 'sources' | 'samples'> {
  // Checker config contains reusable settings.
  // Per-call settings (sources, samples) are passed to check().
}

/** A preconfigured checker instance. */
interface Checker {
  /** Run full hallucination check with preset configuration. */
  check(text: string, options?: Partial<CheckOptions>): HallucinationReport;

  /** Check grounding against sources. */
  checkGrounded(
    text: string,
    sources: string[] | SourceDocument[],
    options?: Partial<GroundingOptions>,
  ): GroundingReport;

  /** Check consistency across samples. */
  checkConsistency(
    responses: string[],
    options?: Partial<ConsistencyOptions>,
  ): ConsistencyReport;

  /** Extract claims from text. */
  extractClaims(
    text: string,
    options?: { claimGranularity?: 'sentence' | 'clause' },
  ): Claim[];

  /** Detect fabricated entities. */
  detectFabricatedEntities(
    text: string,
    sources?: string[] | SourceDocument[],
    options?: Partial<EntityDetectionOptions>,
  ): EntityDetectionResult;
}
```

---

## 12. Report Structure

### HallucinationReport

The `HallucinationReport` is the primary output of the `check()` function. It is designed to be:

1. **Machine-readable**: Every field is typed. The report serializes cleanly to JSON. Monitoring systems can extract `report.score`, alerting systems can check `report.pass`, and dashboards can display `report.methodScores`.
2. **Human-readable**: The `summary` field provides a natural-language description. Findings have human-readable `message` fields. The report can be printed for debugging.
3. **Actionable at claim level**: The `claims` array provides per-claim assessments, enabling consumers to highlight, filter, or flag individual claims.
4. **Explainable**: The `findings` array provides evidence for every score. A caller who sees a low score can inspect findings to understand why.

### Summary Generation

The `summary` field is generated from scores and findings using template logic (not an LLM):

- Score >= 0.9: "No significant hallucination indicators detected."
- Score 0.7-0.89: "{count} minor hallucination indicator(s) detected: {top findings}."
- Score 0.4-0.69: "Moderate hallucination risk. {count} indicator(s) detected: {top findings}. Review recommended."
- Score < 0.4: "High hallucination risk. {count} critical indicator(s) detected: {top findings}. Content should not be used without verification."

### Finding Ordering

Findings in the report are ordered by:
1. Severity (critical first, then warning, then info).
2. Within the same severity, by method (source-grounding, fabricated-entities, internal-consistency, numerical-plausibility, confidence-language, self-consistency).
3. Within the same method, by location (earlier findings first).

### Report Serialization

The `HallucinationReport` is a plain object with no class instances, functions, or circular references. It serializes cleanly with `JSON.stringify()`. All fields use primitive types, arrays, or nested plain objects. `FindingLocation` uses numbers (character offsets), not pointers or references.

---

## 13. Configuration

### Detection Method Weight Configuration

Weights control how much each detection method contributes to the composite score. The default weights (Section 10) are designed for general-purpose use. Teams should adjust weights based on their use case:

- **RAG grounding verification**: Increase `source-grounding` to 0.45, decrease `confidence-language` to 0.10. Grounding against provided sources is the primary signal.
- **Content generation quality gates**: Increase `fabricated-entities` to 0.30, increase `internal-consistency` to 0.20. Without source context, entity fabrication and self-contradiction are the strongest signals.
- **Self-consistency evaluation**: Increase `self-consistency` to 0.40, decrease other methods. Consistency across samples is the primary signal.
- **Medical/legal content**: Increase all weights, lower `passThreshold` to 0.5. Err on the side of flagging rather than missing.

### Pass/Fail Threshold

The `passThreshold` option (default: 0.7) determines the `pass` field in the report.

Recommended thresholds by use case:

| Use Case | Recommended Threshold |
|---|---|
| Safety gate in production pipeline | 0.7 |
| RAG response quality gate | 0.6 |
| Content publication gate | 0.75 |
| Alerting (fire alert if below threshold) | 0.4 |
| Batch evaluation (flag for review) | 0.5 |
| Strict regulated content | 0.85 |

### Custom Pattern Configuration

The `customPatterns` option allows adding domain-specific patterns:

```typescript
const report = check(text, {
  customPatterns: {
    // Medical domain hedging
    hedging: [
      /consult your doctor/i,
      /this is not medical advice/i,
      /individual results may vary/i,
    ],
    // Additional URL fabrication patterns
    urlFabrication: [
      /pubmed\.ncbi\.nlm\.nih\.gov\/\d{10,}/,  // implausibly long PubMed IDs
    ],
  },
});
```

Custom patterns are appended to the built-in catalog. To completely replace built-in patterns for a method, use `createChecker` with explicit pattern lists.

### Configuration Precedence

When using `createChecker`, options are merged with the following precedence (highest first):

1. Per-call options passed to `checker.check(text, options)`.
2. Factory-level config passed to `createChecker(config)`.
3. Built-in defaults.

---

## 14. Integration

### Integration with `rag-cite`

`rag-cite` verifies citation accuracy; `hallucinate-check` evaluates claim plausibility. Together they provide complementary hallucination signals.

```typescript
import { cite } from 'rag-cite';
import { check } from 'hallucinate-check';

const citationReport = await cite(response, sources);
const hallucinationReport = check(response, {
  sources: sources.map(s => s.content),
});

// Citation-level signal: misattributed or phantom citations
const citationIssues = citationReport.misattributed.length + citationReport.phantom.length;

// Claim-level signal: ungrounded or fabricated claims
const hallucinationIssues = hallucinationReport.flagged.length;

// Combined trust score
const trustScore = Math.min(citationReport.scores.quality, hallucinationReport.score);
```

### Integration with `output-grade`

`output-grade` provides general quality scoring (structure, coherence, truncation, refusal). `hallucinate-check` provides deep hallucination analysis. They address orthogonal quality dimensions.

```typescript
import { grade } from 'output-grade';
import { check } from 'hallucinate-check';

const qualityReport = grade(output, { prompt, format: 'json' });
const hallucinationReport = check(output, { sources });

// Use output-grade for structural quality, hallucinate-check for factual quality
if (!qualityReport.pass) {
  return retry('structural quality too low');
}
if (!hallucinationReport.pass) {
  return retry('hallucination risk too high');
}
```

### Integration with `llm-retry`

`hallucinate-check` can serve as a validation signal for retry decisions.

```typescript
import { retryWithValidation } from 'llm-retry';
import { check } from 'hallucinate-check';

const result = await retryWithValidation(callLLM, UserSchema, {
  validate: (data, rawOutput) => {
    const report = check(rawOutput, { sources: contextChunks });

    if (report.score < 0.5) {
      return {
        success: false,
        errors: report.findings
          .filter(f => f.severity === 'critical')
          .map(f => ({
            path: '$',
            message: `Hallucination: ${f.message}`,
            code: f.id,
          })),
      };
    }
    return { success: true, data };
  },
});
```

### Integration with Monitoring Systems

```typescript
import { check } from 'hallucinate-check';

// After each LLM call
const report = check(llmOutput, { sources: contextChunks });

// Prometheus metrics
histogram.observe({ method: 'composite' }, report.score);
for (const [method, score] of Object.entries(report.methodScores)) {
  histogram.observe({ method }, score);
}
counter.inc({ metric: 'flagged_claims' }, report.flagged.length);

// Alert if hallucination rate spikes
if (!report.pass) {
  alertManager.fire('hallucination-detected', {
    score: report.score,
    summary: report.summary,
    flaggedClaims: report.flagged.map(c => c.claim.text),
  });
}
```

### Integration with Self-Consistency via Multiple LLM Calls

```typescript
import { checkConsistency } from 'hallucinate-check';

// Generate multiple samples with temperature > 0
const samples = await Promise.all(
  Array.from({ length: 4 }, () =>
    llm.complete(prompt, { temperature: 0.7 })
  ),
);

const report = checkConsistency(samples);

// Use the most consistent response
const primaryResponse = samples[0];
const consistentClaims = report.claims
  .filter(c => c.consistency > 0.7)
  .map(c => c.claim.text);

console.log(`${consistentClaims.length} of ${report.claims.length} claims are consistent`);
```

---

## 15. Testing Strategy

### Unit Tests

Each detection method has its own test suite:

**Source Grounding**:
- Claim appearing verbatim in source: grounded with confidence 1.0.
- Claim paraphrasing source content: grounded via fuzzy/n-gram matching.
- Claim not related to any source: ungrounded.
- Claim contradicting source (different number for same entity): flagged as contradiction.
- No sources provided: method returns 1.0 (neutral).
- Multiple sources, claim supported by one: correct source identified.
- Pre-filtering correctly selects relevant sources from large set.

**Self-Consistency**:
- All samples contain the same claim: consistency 1.0.
- No other sample contains the claim: consistency 0.0.
- Claim appears with minor rewording: detected as paraphrase.
- One sample contradicts the claim: contradiction detected.
- Two samples only: minimum viable consistency check.
- Temperature-0 near-identical samples: correctly handled (high consistency but low informational value).

**Confidence Language**:
- Text with no hedging: score 1.0.
- Text with dense hedging ("I think... probably... maybe..."): low score.
- Text with mixed hedging and factual content: intermediate score.
- Overconfidence markers ("definitely", "100%"): info-level findings.
- Weasel words ("studies have shown"): info-level findings.
- Hedging density calculation: correct count / sentence ratio.

**Fabricated Entities**:
- URL with example.com domain: flagged.
- URL with overly long descriptive path: flagged.
- URL with valid arxiv format: not flagged.
- URL with invalid arxiv format: flagged.
- Citation dated in the future: flagged.
- Citation with valid year: not flagged.
- Impossible date (February 30): flagged.
- Valid date: not flagged.
- Person name in sources: not flagged.
- Person name not in sources: flagged.
- Email with example.com: flagged.

**Numerical Plausibility**:
- Percentages summing to 100: no issue.
- Percentages summing to 115: warning.
- 10x magnitude mismatch with source: critical.
- Direction mismatch ("increased" with decreasing values): critical.
- No numbers in text: score 1.0.
- Round number suspicion: info finding.

**Internal Consistency**:
- No contradictions: score 1.0.
- Self-correction ("actually, the date was..."): warning.
- Same entity with different values: critical.
- Antonym contradiction ("simple" vs. "complex" for same entity): critical.
- Temporal contradiction (same event, different dates): critical.
- Legitimate temporal distinction ("in 2020... in 2021..."): not flagged.

### Claim Extraction Tests

- Simple sentences split correctly.
- Abbreviations (`Dr.`, `U.S.`) do not cause false splits.
- Decimal numbers not split on period.
- URLs not split on periods.
- List items treated as individual claims.
- Questions filtered as non-factual.
- Hedging-only sentences filtered.
- Meta-commentary filtered.
- Greetings and closings filtered.
- Mixed factual and non-factual content: factual parts preserved.
- Clause-level splitting on `, and` and `;`.

### Composite Score Tests

- All methods at 1.0: composite is 1.0.
- One critical method at floor: composite capped at ceiling.
- Custom weights applied correctly.
- Weight redistribution when methods excluded.
- Pass threshold comparison.
- Per-claim classification based on score ranges.

### Integration Tests

- **Clean text with sources**: All claims grounded, high score.
- **Text with fabricated entities and no sources**: Fabricated URLs, citations detected, lower score.
- **Text contradicting sources**: Numerical contradictions flagged, low grounding score.
- **Self-consistency check with consistent samples**: High consistency score.
- **Self-consistency check with inconsistent samples**: Low consistency, specific claims flagged.
- **Dense hedging text**: Confidence language method drives score down.
- **Text with internal contradictions**: Internal consistency method flags issues.
- **Empty text**: Score 0.0 or 1.0 depending on interpretation (no claims = nothing to hallucinate = 1.0).
- **Determinism test**: Same input twice produces identical output.

### Edge Cases

- Empty string input.
- Text with no factual claims (all questions and hedging).
- Text with only one claim.
- Very long text (10,000+ words).
- Text containing code blocks (code content should not be analyzed as factual claims).
- Unicode text (CJK, emoji, RTL).
- Text with no numbers (numerical plausibility returns 1.0).
- Sources provided as strings vs. SourceDocument objects.
- Single sample provided to checkConsistency (minimum 2 required -- should error or warn).

### Performance Benchmarks

- Check on 500-word text, no sources: under 2ms.
- Check on 500-word text, 5 sources: under 5ms.
- Check on 2000-word text, 20 sources: under 20ms.
- Check on 10,000-word text, 100 sources: under 50ms.
- Consistency check on 5 samples of 500 words each: under 15ms.
- These benchmarks are verified in CI to detect regressions.

---

## 16. Performance

### Design Constraints

`hallucinate-check` is designed for inline use in production response pipelines. The check runs after the LLM generates a response and before the response is returned to the user or stored. Target latencies:

- **No sources, no samples** (confidence language, fabricated entities, numerical plausibility, internal consistency only): under 5ms for typical text (500 words).
- **With sources** (adds source grounding): under 10ms for typical text with 5 sources.
- **With samples** (adds self-consistency): under 15ms for 5 samples of 500 words.

### Optimization Strategy

**Pre-computed IDF**: When sources are provided, IDF values are computed once across all sources and reused for all claim-source TF-IDF comparisons. O(total_source_tokens) one-time cost.

**Source pre-filtering**: For large source sets (> 20 documents), a fast pre-filter using shared term counts reduces the candidate set before expensive matching. This limits worst-case complexity to O(claims x maxSourcesPerClaim).

**Sliding window optimization**: Fuzzy substring matching uses a trigram pre-filter to avoid evaluating Levenshtein distance at every position in the source text. Only positions with at least 30% trigram overlap are evaluated.

**Pattern catalog compilation**: All regex patterns (hedging phrases, URL patterns, date patterns, etc.) are compiled once at module load time (or once per `createChecker()` call) and reused across all checks.

**Lazy method computation**: Methods that are not applicable (no sources for grounding, no samples for consistency) are skipped entirely, not computed and then ignored.

**No backtracking regex**: All patterns are designed for linear-time execution to avoid ReDoS attacks on adversarial inputs.

### Memory Usage

Memory usage scales with input size and source count. The largest in-memory structures are:

- TF-IDF vocabulary and IDF vector: ~100 bytes per unique term. For 5 sources averaging 500 words (~2500 total words, ~1000 unique terms): ~100KB.
- Claim and finding objects: ~500 bytes each. For a 20-claim text with 10 findings: ~15KB.
- Total overhead for a typical check: under 500KB.

---

## 17. Dependencies

### Runtime Dependencies

| Package | Purpose |
|---------|---------|
| `fastest-levenshtein` | Edit distance computation for fuzzy substring matching in source grounding and self-consistency checking. Zero transitive dependencies. |

### Why `fastest-levenshtein`

Levenshtein edit distance is a core primitive of the fuzzy matching strategy. The optimized implementation in `fastest-levenshtein` is 2-3x faster than a naive dynamic programming implementation, and the sliding window matcher calls it hundreds of times per claim-source pair. The package has zero dependencies, a single JavaScript file, and 20M+ weekly downloads.

### Why Not Other Libraries

- **`natural`**: Heavy NLP library. `hallucinate-check` only needs edit distance and implements all other algorithms (n-grams, TF-IDF, sentence splitting) in ~200 lines total.
- **`compromise`**: NLP library with named entity recognition. Would simplify entity extraction but adds 200KB+ to the bundle. The pattern-based entity extraction in `hallucinate-check` is less sophisticated but sufficient for the fabrication detection use case.
- **`string-similarity`**: Uses Dice coefficient only. `hallucinate-check` needs multiple matching strategies with per-strategy scores.

### Development Dependencies

| Package | Purpose |
|---------|---------|
| `typescript` | TypeScript compiler |
| `vitest` | Test runner |
| `eslint` | Linting |
| `@types/node` | Node.js type definitions |

### Peer Dependencies

None.

### Compatibility

- Node.js >= 18 (uses ES2022 features).
- TypeScript >= 5.0.
- No browser-specific APIs. Works in Bun and Deno (Node.js compatibility mode).

---

## 18. File Structure

```
hallucinate-check/
  package.json
  tsconfig.json
  SPEC.md
  README.md
  src/
    index.ts                        -- Public API exports: check, checkGrounded,
                                       checkConsistency, extractClaims,
                                       detectFabricatedEntities, createChecker,
                                       and all types.
    check.ts                        -- check() function: pipeline orchestration,
                                       composite score computation, report generation.
    factory.ts                      -- createChecker() factory function.
    types.ts                        -- All TypeScript type definitions.
    claims/
      extract.ts                    -- Claim extraction: sentence segmentation,
                                       sub-sentence decomposition, non-factual filtering.
      sentences.ts                  -- Sentence segmentation with abbreviation handling.
      filters.ts                    -- Non-factual content filters (questions, hedging,
                                       meta-commentary, disclaimers, opinions).
    methods/
      source-grounding.ts           -- Source grounding verification: multi-strategy
                                       claim-source matching, grounding classification.
      self-consistency.ts           -- Self-consistency checking: cross-sample claim
                                       matching, consistency scoring.
      confidence-language.ts        -- Confidence language detection: hedging phrases,
                                       overconfidence markers, weasel words.
      fabricated-entities.ts        -- Fabricated entity detection: URLs, citations,
                                       dates, named entities, emails.
      numerical-plausibility.ts     -- Numerical plausibility: percentage consistency,
                                       magnitude checks, internal numerical consistency.
      internal-consistency.ts       -- Internal consistency: contradiction detection,
                                       self-correction, antonym pairs, numerical conflicts.
    match/
      exact.ts                      -- Exact substring matching strategy.
      fuzzy.ts                      -- Fuzzy substring matching with sliding window
                                       and trigram pre-filter.
      ngram.ts                      -- N-gram overlap (Jaccard similarity) strategy.
      tfidf.ts                      -- TF-IDF cosine similarity strategy.
      embedding.ts                  -- Pluggable embedding similarity strategy.
      composite.ts                  -- Composite match score computation.
      prefilter.ts                  -- Fast pre-filter for large source sets.
    patterns/
      hedging.ts                    -- Hedging phrase catalog.
      overconfidence.ts             -- Overconfidence phrase catalog.
      weasel.ts                     -- Weasel word catalog.
      refusal.ts                    -- Non-factual content patterns.
      antonyms.ts                   -- Antonym pair list for contradiction detection.
      stopwords.ts                  -- English stopword list.
    utils/
      tokenizer.ts                  -- Word tokenization.
      text.ts                       -- Text normalization, whitespace collapsing.
      url.ts                        -- URL extraction and fabrication analysis.
      date.ts                       -- Date extraction and validation.
      citation.ts                   -- Citation pattern extraction and plausibility.
      entity.ts                     -- Named entity extraction (person, org, publication).
      numbers.ts                    -- Numerical extraction and context tagging.
      cosine.ts                     -- Cosine similarity computation.
    defaults.ts                     -- Default weights, thresholds, configuration.
  src/__tests__/
    check.test.ts                   -- Integration tests for check().
    check-grounded.test.ts          -- Integration tests for checkGrounded().
    check-consistency.test.ts       -- Integration tests for checkConsistency().
    claims/
      extract.test.ts               -- Claim extraction tests.
      sentences.test.ts             -- Sentence segmentation tests.
      filters.test.ts               -- Non-factual content filter tests.
    methods/
      source-grounding.test.ts      -- Source grounding tests.
      self-consistency.test.ts      -- Self-consistency tests.
      confidence-language.test.ts   -- Confidence language tests.
      fabricated-entities.test.ts   -- Fabricated entity tests.
      numerical-plausibility.test.ts -- Numerical plausibility tests.
      internal-consistency.test.ts  -- Internal consistency tests.
    match/
      exact.test.ts                 -- Exact matching tests.
      fuzzy.test.ts                 -- Fuzzy matching tests.
      ngram.test.ts                 -- N-gram overlap tests.
      tfidf.test.ts                 -- TF-IDF tests.
      composite.test.ts             -- Composite scoring tests.
    performance.test.ts             -- Performance benchmarks.
    fixtures/
      texts/                        -- Sample LLM outputs for testing.
      sources/                      -- Sample source documents.
  dist/                             -- Compiled output (generated by tsc)
```

---

## 19. Implementation Roadmap

### Phase 1: Core Claims and Basic Detection (v0.1.0)

Implement the foundation: types, claim extraction, confidence language detection, and fabricated entity detection.

**Deliverables**:
1. **Types and defaults** (`types.ts`, `defaults.ts`): Define all interfaces, default weights, default thresholds.
2. **Utility functions** (`utils/`): Tokenizer, text normalization, URL extraction, date extraction, citation pattern extraction, number extraction.
3. **Pattern catalogs** (`patterns/`): Hedging phrases, overconfidence phrases, weasel words, stopwords, antonyms.
4. **Claim extraction** (`claims/`): Sentence segmentation with abbreviation handling, non-factual content filtering.
5. **Confidence language detection** (`methods/confidence-language.ts`): Hedging, overconfidence, weasel word detection with density scoring.
6. **Fabricated entity detection** (`methods/fabricated-entities.ts`): URL fabrication, citation fabrication, date fabrication, email fabrication.
7. **Basic `check()` function** (`check.ts`): Run confidence language and fabricated entity methods, compute composite score, generate report.
8. **Public API** (`index.ts`): Export `check`, `extractClaims`, `detectFabricatedEntities`.
9. **Tests**: Unit tests for claim extraction, confidence language, fabricated entities.

### Phase 2: Source Grounding (v0.2.0)

Add source grounding verification with multi-strategy matching.

**Deliverables**:
1. **Matching strategies** (`match/`): Exact substring, fuzzy substring (with `fastest-levenshtein`), n-gram Jaccard, TF-IDF cosine. Add `fastest-levenshtein` dependency.
2. **Source pre-filter** (`match/prefilter.ts`): Shared-term pre-filtering for large source sets.
3. **Composite matching** (`match/composite.ts`): Weighted combination of strategy scores.
4. **Source grounding method** (`methods/source-grounding.ts`): Claim-source matching pipeline, grounding classification, contradiction detection.
5. **`checkGrounded()` function**: Grounding-focused API with `GroundingReport`.
6. **Numerical plausibility** (`methods/numerical-plausibility.ts`): Percentage consistency, magnitude checks, internal numerical consistency.
7. **Tests**: Grounding tests, matching strategy tests, numerical plausibility tests.

### Phase 3: Self-Consistency and Internal Consistency (v0.3.0)

Add self-consistency checking and internal contradiction detection.

**Deliverables**:
1. **Self-consistency method** (`methods/self-consistency.ts`): Cross-sample claim matching, consistency scoring, contradiction detection across samples.
2. **`checkConsistency()` function**: Consistency-focused API with `ConsistencyReport`.
3. **Internal consistency method** (`methods/internal-consistency.ts`): Self-correction detection, antonym contradictions, numerical contradictions, temporal contradictions.
4. **`createChecker()` factory** (`factory.ts`): Preconfigured checker instances with option merging.
5. **Embedding support** (`match/embedding.ts`): Pluggable embedding similarity for source grounding and self-consistency.
6. **Tests**: Self-consistency tests, internal consistency tests, factory tests, embedding integration tests.

### Phase 4: Polish and v1.0.0

Production readiness, performance optimization, and documentation.

**Deliverables**:
1. **Performance optimization**: Benchmark suite, pre-filter tuning, lazy computation, pattern compilation caching.
2. **Edge case hardening**: Unicode handling, pathological inputs, very large texts, adversarial regex inputs.
3. **Per-claim scoring refinement**: Calibrate per-claim score aggregation against annotated datasets.
4. **Sub-sentence claim decomposition**: Implement `claimGranularity: 'clause'` option.
5. **API stability**: Stabilize all public types and function signatures for semver 1.0.
6. **Documentation**: Comprehensive README with usage examples, configuration guide, and integration patterns.
7. **npm publish**.

---

## 20. Example Use Cases

### Example 1: Clean Text with Source Grounding

**Input text**:
```
Paris is the capital of France. It has a population of approximately 2.1 million inhabitants.
```

**Sources**: `["Paris is the capital and largest city of France.", "The population of Paris is approximately 2.16 million inhabitants."]`

**Hallucination Report**:
```
score: 0.95
pass: true
methodScores:
  source-grounding: 1.00
  confidence-language: 0.92  (one approximation marker: "approximately")
  fabricated-entities: 1.00
  numerical-plausibility: 1.00
  internal-consistency: 1.00
claims:
  - text: "Paris is the capital of France."
    score: 0.98, classification: 'supported'
    grounding: { grounded: true, bestMatch: { source: 0, confidence: 0.95, type: 'exact' } }
  - text: "It has a population of approximately 2.1 million inhabitants."
    score: 0.92, classification: 'supported'
    grounding: { grounded: true, bestMatch: { source: 1, confidence: 0.85, type: 'fuzzy' } }
flagged: []
findings:
  - { id: 'approximation-marker', severity: 'info', message: '"approximately" used with numerical claim' }
summary: "No significant hallucination indicators detected."
```

### Example 2: Text with Fabricated Entities

**Input text**:
```
According to Dr. James Thornton of the Institute for Advanced Language Studies, hallucination in LLMs was first documented in a seminal 2028 paper published in the Journal of Artificial Intelligence and Language Processing (http://www.jailp-research.org/papers/2028/hallucination-survey). The study found that 73% of all LLM outputs contain at least one hallucinated claim.
```

**Sources**: `["Hallucination in language models has been studied by researchers at MIT, Stanford, and Google DeepMind. The phenomenon was first characterized in 2020."]`

**Hallucination Report**:
```
score: 0.12
pass: false
methodScores:
  source-grounding: 0.20
  confidence-language: 1.00
  fabricated-entities: 0.05
  numerical-plausibility: 0.80
  internal-consistency: 1.00
claims:
  - text: "...hallucination in LLMs was first documented in a seminal 2028 paper..."
    score: 0.08, classification: 'likely-hallucinated'
    findings:
      - { id: 'entity-not-in-source', severity: 'warning', message: '"Dr. James Thornton" not in sources' }
      - { id: 'entity-not-in-source', severity: 'warning', message: '"Institute for Advanced Language Studies" not in sources' }
      - { id: 'future-citation', severity: 'critical', message: 'Citation dated 2028 is in the future' }
      - { id: 'fabricated-url', severity: 'critical', message: 'URL has long descriptive path and future date' }
      - { id: 'implausible-journal', severity: 'warning', message: 'Journal name follows LLM fabrication pattern' }
  - text: "The study found that 73% of all LLM outputs contain at least one hallucinated claim."
    score: 0.25, classification: 'likely-hallucinated'
    findings:
      - { id: 'claim-ungrounded', severity: 'warning', message: 'Statistic not found in any source' }
flagged: [claim 0, claim 1]
summary: "High hallucination risk. 6 critical indicator(s) detected: fabricated URL, future-dated citation, entities not found in sources, ungrounded statistical claim. Content should not be used without verification."
```

### Example 3: Self-Consistency Check

**Input samples** (4 responses to "When was the company founded?"):
```
Sample 1: "The company was founded in 1995 by John Smith in San Francisco."
Sample 2: "The company was founded in 1995 by John Smith in the Bay Area."
Sample 3: "The company was founded in 1998 by John Smith in San Francisco."
Sample 4: "Founded in 1995, the company was started by Jane Doe in San Francisco."
```

**Consistency Report**:
```
consistencyScore: 0.55
claims:
  - text: "The company was founded in 1995"
    consistency: 0.75  (3 of 4 samples agree on 1995)
    classification: 'uncertain'
  - text: "by John Smith"
    consistency: 0.50  (3 of 4 samples say John Smith, 1 says Jane Doe)
    classification: 'uncertain'
  - text: "in San Francisco"
    consistency: 0.75  (3 of 4 say San Francisco, 1 says "Bay Area" -- paraphrase match)
    classification: 'uncertain'
inconsistentClaims: ["The company was founded in 1998...", "...by Jane Doe..."]
```

### Example 4: Internal Contradictions

**Input text**:
```
The project was completed in 6 months with a team of 10 engineers. The rapid development cycle of just 2 months was possible because of the large team of 50 engineers working around the clock.
```

**Hallucination Report**:
```
score: 0.25
pass: false
methodScores:
  confidence-language: 1.00
  fabricated-entities: 1.00
  numerical-plausibility: 0.80
  internal-consistency: 0.10
claims:
  - text: "The project was completed in 6 months with a team of 10 engineers."
    score: 0.30, classification: 'likely-hallucinated'
  - text: "The rapid development cycle of just 2 months was possible because of the large team of 50 engineers..."
    score: 0.20, classification: 'likely-hallucinated'
findings:
  - { id: 'numerical-contradiction', severity: 'critical', message: 'Duration stated as both "6 months" and "2 months"' }
  - { id: 'numerical-contradiction', severity: 'critical', message: 'Team size stated as both "10 engineers" and "50 engineers"' }
summary: "High hallucination risk. 2 critical internal contradictions detected: duration and team size stated with conflicting values. Content should not be used without verification."
```

### Example 5: Hedging-Dense Text

**Input text**:
```
I think the population of France is probably around 67 million people, though I'm not entirely sure about the exact figure. It seems like the number might be approximately correct based on what I recall. I believe most sources would suggest a similar number, but I could be wrong about this.
```

**Hallucination Report**:
```
score: 0.42
pass: false
methodScores:
  confidence-language: 0.22
  fabricated-entities: 1.00
  numerical-plausibility: 1.00
  internal-consistency: 1.00
claims:
  - text: "...the population of France is probably around 67 million people..."
    score: 0.35, classification: 'likely-hallucinated'
    findings:
      - { id: 'hedging-phrase', severity: 'warning', message: '"I think"' }
      - { id: 'hedging-phrase', severity: 'warning', message: '"probably"' }
      - { id: 'hedging-phrase', severity: 'warning', message: '"I\'m not entirely sure"' }
findings:
  - { id: 'high-hedging-density', severity: 'critical', message: 'Hedging density 0.67 exceeds threshold' }
  - 7 individual hedging phrase findings
summary: "Moderate hallucination risk. High hedging phrase density (0.67) suggests uncertainty about claims. Review recommended."
```

### Example 6: Numerical Implausibility

**Input text**:
```
The survey covered 1000 respondents. Of these, 45% were male, 40% were female, and 25% identified as non-binary. The average age was 35 years, with the youngest participant being 42 years old.
```

**Hallucination Report**:
```
score: 0.38
pass: false
methodScores:
  confidence-language: 1.00
  fabricated-entities: 1.00
  numerical-plausibility: 0.15
  internal-consistency: 0.60
findings:
  - { id: 'percentage-sum-error', severity: 'warning', message: 'Percentages sum to 110% (45% + 40% + 25%), expected ~100%' }
  - { id: 'direction-mismatch', severity: 'critical', message: 'Average age (35) is less than youngest participant (42)' }
summary: "High hallucination risk. Numerical inconsistencies: percentages sum to 110%, average age lower than youngest participant. Content should not be used without verification."
```
