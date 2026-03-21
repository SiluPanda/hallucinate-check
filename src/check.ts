import {
  CheckOptions,
  CheckerConfig,
  Checker,
  ClaimAssessment,
  DetectionMethod,
  Finding,
  HallucinationReport,
} from './types'
import { extractClaims } from './claims'
import { detectConfidenceIssues } from './detectors/confidence-language'
import { detectFabricatedEntities } from './detectors/fabricated-entities'
import { detectInternalConsistency } from './detectors/internal-consistency'

const DEFAULT_WEIGHTS: Record<DetectionMethod, number> = {
  'confidence-language': 0.15,
  'fabricated-entities': 0.20,
  'internal-consistency': 0.15,
  'source-grounding': 0.30,
  'numerical-plausibility': 0.10,
}

export function check(text: string, options?: CheckOptions): HallucinationReport {
  const start = Date.now()
  const claims = extractClaims(text)
  const passThreshold = options?.passThreshold ?? 0.7
  const enabledMethods: DetectionMethod[] = options?.methods ?? [
    'confidence-language',
    'fabricated-entities',
    'internal-consistency',
  ]
  const weights: Record<DetectionMethod, number> = { ...DEFAULT_WEIGHTS, ...options?.weights }

  const methodScores: Partial<Record<DetectionMethod, number>> = {}
  const allFindings: Finding[] = []

  if (enabledMethods.includes('confidence-language')) {
    const { score, findings } = detectConfidenceIssues(text, claims)
    methodScores['confidence-language'] = score
    allFindings.push(...findings)
  }
  if (enabledMethods.includes('fabricated-entities')) {
    const { score, findings } = detectFabricatedEntities(text, options?.sources)
    methodScores['fabricated-entities'] = score
    allFindings.push(...findings)
  }
  if (enabledMethods.includes('internal-consistency')) {
    const { score, findings } = detectInternalConsistency(text, claims)
    methodScores['internal-consistency'] = score
    allFindings.push(...findings)
  }

  // Compute weighted composite score
  const totalWeight = enabledMethods.reduce((sum, m) => sum + (weights[m] ?? 1), 0)
  const composite = enabledMethods.reduce((sum, m) => {
    const score = methodScores[m] ?? 1
    return sum + score * (weights[m] ?? 1) / totalWeight
  }, 0)

  // Build per-claim assessments
  const claimAssessments: ClaimAssessment[] = claims.map((claim, i) => {
    const claimFindings = allFindings.filter(f => f.claimIndex === i)
    const claimScore = claimFindings.length === 0
      ? 1
      : Math.max(
          0,
          1 - claimFindings.reduce(
            (sum, f) =>
              sum + (f.severity === 'critical' ? 0.3 : f.severity === 'warning' ? 0.15 : 0.05),
            0,
          ),
        )
    return {
      claim,
      hallucScore: claimScore,
      findings: claimFindings,
      methodScores: {},
      classification:
        claimScore >= 0.7
          ? 'supported'
          : claimScore >= 0.4
            ? 'uncertain'
            : 'likely-hallucinated',
    }
  })

  return {
    text,
    composite,
    passThreshold,
    pass: composite >= passThreshold,
    claimAssessments,
    methodScores,
    durationMs: Date.now() - start,
  }
}

export function createChecker(config?: CheckerConfig): Checker {
  return {
    check: (text, options) => check(text, { ...config, ...options }),
    extractClaims,
  }
}
