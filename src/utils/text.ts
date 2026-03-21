// Common abbreviations that should not trigger sentence splits
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'dr', 'prof', 'st', 'vs', 'etc', 'i.e', 'e.g',
])

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter(t => t.length >= 2)
}

export function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

export function sentenceSplit(text: string): string[] {
  // Split on . ! ? followed by space or end of string
  // Guard against common abbreviations
  const sentences: string[] = []
  let current = ''
  let i = 0

  while (i < text.length) {
    const ch = text[i]
    current += ch

    if (ch === '.' || ch === '!' || ch === '?') {
      // Check if followed by space/end
      const next = text[i + 1]
      if (next === undefined || next === ' ' || next === '\n') {
        // Check abbreviation guard: last word before the punctuation
        const words = current.trimEnd().slice(0, -1).split(/\s+/)
        const lastWord = words[words.length - 1]?.toLowerCase().replace(/\.$/, '') ?? ''
        if (ch === '.' && ABBREVIATIONS.has(lastWord)) {
          i++
          continue
        }
        const trimmed = current.trim()
        if (trimmed.length > 0) {
          sentences.push(trimmed)
        }
        current = ''
        // Skip the space separator
        if (next === ' ') {
          i++
        }
      }
    }
    i++
  }

  const remainder = current.trim()
  if (remainder.length > 0) {
    sentences.push(remainder)
  }

  return sentences.filter(s => s.length > 0)
}

export function ngramOverlap(a: string, b: string, n = 2): number {
  const getNgrams = (text: string): Set<string> => {
    const tokens = tokenize(text)
    const ngrams = new Set<string>()
    for (let i = 0; i <= tokens.length - n; i++) {
      ngrams.add(tokens.slice(i, i + n).join(' '))
    }
    return ngrams
  }

  const aNgrams = getNgrams(a)
  const bNgrams = getNgrams(b)

  if (aNgrams.size === 0 && bNgrams.size === 0) return 1

  let intersection = 0
  for (const ng of aNgrams) {
    if (bNgrams.has(ng)) intersection++
  }

  const union = aNgrams.size + bNgrams.size - intersection
  if (union === 0) return 0

  return intersection / union
}
