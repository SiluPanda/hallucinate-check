import { distance } from 'fastest-levenshtein'
import { Finding, SourceDocument } from '../types'

const EXAMPLE_DOMAINS = ['example.com', 'test.com', 'sample.org', 'foo.com', 'placeholder.com']
const SUSPICIOUS_URL_RE = /https?:\/\/[^\s<>"]+/g
const DEEP_PATH_RE = /\/([^/\s]+\/){4,}/

const FAKE_CITATION_RE = /\(([A-Z][a-z]+(?:\s[A-Z][a-z]+)*),?\s+(19|20)\d{2}[a-z]?\)/g

function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - distance(a, b) / maxLen
}

export function detectFabricatedEntities(
  text: string,
  sources?: SourceDocument[],
): { score: number; findings: Finding[] } {
  const findings: Finding[] = []
  let suspiciousCount = 0
  let totalChecked = 0

  // 1. Extract and check URLs
  const urlMatches = [...text.matchAll(SUSPICIOUS_URL_RE)]
  for (const match of urlMatches) {
    totalChecked++
    const url = match[0]
    const start = match.index ?? 0

    const isExampleDomain = EXAMPLE_DOMAINS.some(d => url.includes(d))
    if (isExampleDomain) {
      suspiciousCount++
      findings.push({
        claimIndex: -1,
        method: 'fabricated-entities',
        severity: 'critical',
        description: `URL uses a placeholder/example domain: "${url}"`,
        location: { start, end: start + url.length },
      })
    } else if (DEEP_PATH_RE.test(url)) {
      suspiciousCount++
      findings.push({
        claimIndex: -1,
        method: 'fabricated-entities',
        severity: 'warning',
        description: `URL has suspiciously deep path structure: "${url}"`,
        location: { start, end: start + url.length },
      })
    }
  }

  // 2. Extract and check citations
  const citationMatches = [...text.matchAll(FAKE_CITATION_RE)]
  for (const match of citationMatches) {
    totalChecked++
    const citation = match[0]
    const start = match.index ?? 0

    // Valid years: 1900–2030
    const yearStr = match[0].match(/\d{4}/)?.[0] ?? '0'
    const yearFull = parseInt(yearStr, 10)
    if (yearFull < 1900 || yearFull > 2030) {
      suspiciousCount++
      findings.push({
        claimIndex: -1,
        method: 'fabricated-entities',
        severity: 'warning',
        description: `Citation has implausible year: "${citation}"`,
        location: { start, end: start + citation.length },
      })
    }
  }

  // 3. If sources provided, check entity grounding via Levenshtein
  if (sources && sources.length > 0) {
    const sourceText = sources.map(s => s.text).join(' ')
    // Extract candidate named entities from the response text (capitalized words)
    const entityRe = /\b[A-Z][a-z]{2,}(?:\s[A-Z][a-z]{2,})*\b/g
    const entities = [...text.matchAll(entityRe)]

    for (const match of entities) {
      totalChecked++
      const entity = match[0]
      const start = match.index ?? 0
      // Check if entity appears in sources with reasonable similarity
      const sourceWords = sourceText.split(/\s+/)
      let bestSim = 0
      for (let i = 0; i < sourceWords.length; i++) {
        const window = sourceWords.slice(i, i + entity.split(' ').length).join(' ')
        const sim = levenshteinSimilarity(entity.toLowerCase(), window.toLowerCase())
        if (sim > bestSim) bestSim = sim
        if (bestSim > 0.85) break
      }

      if (bestSim < 0.5) {
        suspiciousCount++
        findings.push({
          claimIndex: -1,
          method: 'fabricated-entities',
          severity: 'warning',
          description: `Entity "${entity}" not found in provided sources`,
          location: { start, end: start + entity.length },
        })
      }
    }
  }

  const fabricatedRatio = totalChecked > 0 ? suspiciousCount / totalChecked : 0
  const score = Math.max(0, Math.min(1, 1 - fabricatedRatio))

  return { score, findings }
}
