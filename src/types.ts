export type DetectionMethod = 'confidence-language' | 'fabricated-entities' | 'internal-consistency' | 'source-grounding' | 'numerical-plausibility'
export type ClaimClassification = 'supported' | 'uncertain' | 'likely-hallucinated'
export type Severity = 'info' | 'warning' | 'critical'

export interface SourceDocument { id: string; text: string; metadata?: Record<string, unknown> }

export interface Claim { text: string; sentence: string; startOffset: number; endOffset: number; isFactual: boolean; index: number }

export interface Finding { claimIndex: number; method: DetectionMethod; severity: Severity; description: string; location: { start: number; end: number } }

export interface ClaimAssessment { claim: Claim; hallucScore: number; classification: ClaimClassification; findings: Finding[]; methodScores: Partial<Record<DetectionMethod, number>> }

export interface HallucinationReport {
  text: string; composite: number; passThreshold: number; pass: boolean
  claimAssessments: ClaimAssessment[]
  methodScores: Partial<Record<DetectionMethod, number>>
  durationMs: number
}

export interface CheckOptions {
  sources?: SourceDocument[]
  passThreshold?: number
  methods?: DetectionMethod[]
  weights?: Partial<Record<DetectionMethod, number>>
}

export interface CheckerConfig extends CheckOptions {}

export interface Checker {
  check(text: string, options?: CheckOptions): HallucinationReport
  extractClaims(text: string): Claim[]
}
