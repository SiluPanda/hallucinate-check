import { Claim, Finding } from '../types'

const HEDGING_PHRASES = [
  'I think', 'I believe', 'I assume', 'I guess', 'it seems', 'it appears',
  'probably', 'possibly', 'perhaps', 'maybe', 'likely', 'might be',
  "I'm not sure", "I'm not certain", 'as far as I know', 'to my knowledge',
  'I may be wrong', 'not 100%',
]

const OVERCONFIDENCE_PHRASES = [
  'definitely', 'certainly', 'absolutely', 'undoubtedly', 'without question',
  'always', 'never', '100%', 'every single', 'all studies show',
  'it is a fact that', 'scientifically proven',
]

function containsPhrase(text: string, phrase: string): boolean {
  return text.toLowerCase().includes(phrase.toLowerCase())
}

export function detectConfidenceIssues(
  text: string,
  claims: Claim[],
): { score: number; findings: Finding[] } {
  const findings: Finding[] = []
  let hedgedClaims = 0
  let overconfidentClaims = 0

  for (const claim of claims) {
    const claimText = claim.text
    let isHedged = false
    let isOverconfident = false

    for (const phrase of HEDGING_PHRASES) {
      if (containsPhrase(claimText, phrase)) {
        isHedged = true
        break
      }
    }

    for (const phrase of OVERCONFIDENCE_PHRASES) {
      if (containsPhrase(claimText, phrase)) {
        isOverconfident = true
        const phraseIdx = claimText.toLowerCase().indexOf(phrase.toLowerCase())
        const start = claim.startOffset + (phraseIdx >= 0 ? phraseIdx : 0)
        findings.push({
          claimIndex: claim.index,
          method: 'confidence-language',
          severity: 'warning',
          description: `Overconfidence phrase detected: "${phrase}"`,
          location: { start, end: start + phrase.length },
        })
      }
    }

    if (isHedged) hedgedClaims++
    if (isOverconfident) overconfidentClaims++
  }

  const total = Math.max(1, claims.length)
  const hedgingRate = hedgedClaims / total
  const overconfidenceRate = overconfidentClaims / total

  // Excessive hedging across a large fraction of claims is also a signal
  if (hedgingRate > 0.5) {
    findings.push({
      claimIndex: -1,
      method: 'confidence-language',
      severity: 'info',
      description: `Excessive hedging detected: ${Math.round(hedgingRate * 100)}% of claims contain hedging language`,
      location: { start: 0, end: text.length },
    })
  }

  const rawScore = 1 - (hedgingRate * 0.3 + overconfidenceRate * 0.4)
  const score = Math.max(0, Math.min(1, rawScore))

  return { score, findings }
}
