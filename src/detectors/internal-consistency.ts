import { distance } from 'fastest-levenshtein'
import { Claim, Finding } from '../types'

const ANTONYM_PAIRS: [string, string][] = [
  ['increase', 'decrease'], ['larger', 'smaller'], ['faster', 'slower'],
  ['better', 'worse'], ['higher', 'lower'], ['more', 'less'],
  ['true', 'false'], ['always', 'never'], ['first', 'last'],
  ['before', 'after'], ['open', 'close'], ['start', 'end'],
  ['positive', 'negative'], ['old', 'new'], ['strong', 'weak'],
]

function stringSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - distance(a, b) / maxLen
}

function hasAntonymConflict(claimA: string, claimB: string): boolean {
  const aLower = claimA.toLowerCase()
  const bLower = claimB.toLowerCase()

  for (const [word1, word2] of ANTONYM_PAIRS) {
    const aHas1 = aLower.includes(word1)
    const aHas2 = aLower.includes(word2)
    const bHas1 = bLower.includes(word1)
    const bHas2 = bLower.includes(word2)

    // One claim has word1 and the other has word2 (or vice versa)
    if ((aHas1 && bHas2) || (aHas2 && bHas1)) {
      return true
    }
  }

  return false
}

function extractNumbers(text: string): number[] {
  const matches = text.match(/\b\d+(?:\.\d+)?\b/g) ?? []
  return matches.map(Number)
}

export function detectInternalConsistency(
  text: string,
  claims: Claim[],
): { score: number; findings: Finding[] } {
  const findings: Finding[] = []
  const factualClaims = claims.filter(c => c.isFactual)
  let inconsistentPairs = 0
  let totalPairs = 0

  for (let i = 0; i < factualClaims.length; i++) {
    for (let j = i + 1; j < factualClaims.length; j++) {
      totalPairs++
      const claimA = factualClaims[i]
      const claimB = factualClaims[j]

      const similarity = stringSimilarity(
        claimA.text.toLowerCase(),
        claimB.text.toLowerCase(),
      )

      // High similarity but antonym conflict = likely contradiction
      if (similarity > 0.85 && hasAntonymConflict(claimA.text, claimB.text)) {
        inconsistentPairs++
        findings.push({
          claimIndex: claimA.index,
          method: 'internal-consistency',
          severity: 'critical',
          description: `Direct contradiction between claim ${claimA.index} and claim ${claimB.index}`,
          location: { start: claimA.startOffset, end: claimB.endOffset },
        })
      } else if (hasAntonymConflict(claimA.text, claimB.text)) {
        // Lower similarity but antonym conflict = possible inconsistency
        const numsA = extractNumbers(claimA.text)
        const numsB = extractNumbers(claimB.text)
        const sharedNums = numsA.filter(n => numsB.includes(n))

        if (sharedNums.length > 0) {
          // Same numbers but contradictory direction = numerical contradiction
          inconsistentPairs++
          findings.push({
            claimIndex: claimA.index,
            method: 'internal-consistency',
            severity: 'critical',
            description: `Numerical contradiction between claim ${claimA.index} and claim ${claimB.index}`,
            location: { start: claimA.startOffset, end: claimB.endOffset },
          })
        } else {
          findings.push({
            claimIndex: claimA.index,
            method: 'internal-consistency',
            severity: 'warning',
            description: `Possible inconsistency between claim ${claimA.index} and claim ${claimB.index}`,
            location: { start: claimA.startOffset, end: claimB.endOffset },
          })
        }
      }
    }
  }

  // Suppress unused variable warning
  void text

  const contradictionRate = totalPairs > 0 ? inconsistentPairs / totalPairs : 0
  const score = Math.max(0, Math.min(1, 1 - contradictionRate))

  return { score, findings }
}
