// hallucinate-check - Heuristic hallucination detection for Node.js
export { check, createChecker } from './check'
export { extractClaims } from './claims'
export type {
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
} from './types'
