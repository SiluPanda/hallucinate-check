import { describe, it, expect } from 'vitest'
import { extractClaims } from '../claims'

describe('extractClaims', () => {
  it('does not extract pure questions', () => {
    const claims = extractClaims('What is the capital of France?')
    const factual = claims.filter(c => c.isFactual)
    expect(factual).toHaveLength(0)
  })

  it('does not extract short hedging phrases', () => {
    const claims = extractClaims('I think so. Maybe.')
    const factual = claims.filter(c => c.isFactual)
    expect(factual).toHaveLength(0)
  })

  it('extracts factual sentences with verbs and entities', () => {
    const text = 'The Eiffel Tower was built in Paris. It was completed in 1889.'
    const claims = extractClaims(text)
    const factual = claims.filter(c => c.isFactual)
    expect(factual.length).toBeGreaterThanOrEqual(1)
  })

  it('extracts sentences with years as factual', () => {
    const text = 'The company was founded in 1998 by two Stanford students.'
    const claims = extractClaims(text)
    const factual = claims.filter(c => c.isFactual)
    expect(factual.length).toBeGreaterThanOrEqual(1)
  })

  it('assigns correct startOffset and endOffset', () => {
    const text = 'The sky is blue. The grass is green.'
    const claims = extractClaims(text)
    for (const claim of claims) {
      expect(claim.endOffset).toBeGreaterThan(claim.startOffset)
      expect(text.slice(claim.startOffset, claim.endOffset)).toBe(claim.sentence)
    }
  })

  it('assigns sequential indices', () => {
    const text = 'The sun is hot. Water is wet. Ice is cold.'
    const claims = extractClaims(text)
    claims.forEach((c, i) => expect(c.index).toBe(i))
  })

  it('does not extract disclaimer lines', () => {
    const claims = extractClaims('Note: this is not financial advice.')
    const factual = claims.filter(c => c.isFactual)
    expect(factual).toHaveLength(0)
  })
})
