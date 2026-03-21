import { Claim } from './types'
import { sentenceSplit } from './utils/text'

const REFUSAL_PATTERNS = [
  /^(yes|no|maybe|sure|okay|ok)\b/i,
  /^(I|we) (think|believe|feel|guess)/i,
  /\?$/,
  /^(note|disclaimer|warning):/i,
]

const FACTUAL_INDICATORS = [
  /\b(is|are|was|were|has|have|had|will|does|do|did)\b/i,
  /\b(in|on|at|from|by|since|until)\s+\d/,
  /\b\d{4}\b/,
]

function isFactualSentence(sentence: string): boolean {
  const trimmed = sentence.trim()

  // Not factual: too short
  if (trimmed.split(/\s+/).length < 5) return false

  // Not factual: matches refusal/hedging/question patterns
  for (const pattern of REFUSAL_PATTERNS) {
    if (pattern.test(trimmed)) return false
  }

  // Factual: contains factual indicators
  for (const indicator of FACTUAL_INDICATORS) {
    if (indicator.test(trimmed)) return true
  }

  // Factual: contains what looks like a named entity or number
  if (/[A-Z][a-z]+/.test(trimmed)) return true

  return false
}

export function extractClaims(text: string): Claim[] {
  const sentences = sentenceSplit(text)
  const claims: Claim[] = []
  let offset = 0
  let claimIndex = 0

  for (const sentence of sentences) {
    // Find actual position of this sentence in the original text
    const pos = text.indexOf(sentence, offset)
    const startOffset = pos >= 0 ? pos : offset
    const endOffset = startOffset + sentence.length

    const factual = isFactualSentence(sentence)

    claims.push({
      text: sentence,
      sentence,
      startOffset,
      endOffset,
      isFactual: factual,
      index: claimIndex,
    })

    claimIndex++
    offset = endOffset
  }

  return claims
}
