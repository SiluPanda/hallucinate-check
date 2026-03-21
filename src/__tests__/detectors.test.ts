import { describe, it, expect } from 'vitest'
import { detectConfidenceIssues } from '../detectors/confidence-language'
import { detectFabricatedEntities } from '../detectors/fabricated-entities'
import { detectInternalConsistency } from '../detectors/internal-consistency'
import { extractClaims } from '../claims'

describe('confidence-language detector', () => {
  it('detects overconfidence phrases', () => {
    const text = 'The earth is definitely round and this is scientifically proven.'
    const claims = extractClaims(text)
    const { findings } = detectConfidenceIssues(text, claims)
    const overconfidenceFindings = findings.filter(f => f.severity === 'warning')
    expect(overconfidenceFindings.length).toBeGreaterThanOrEqual(1)
    expect(overconfidenceFindings.some(f => f.description.includes('definitely'))).toBe(true)
  })

  it('lowers score when overconfidence phrases are present', () => {
    const cleanText = 'The Eiffel Tower is in Paris.'
    const suspectText = 'Definitely without question all studies show this is true.'
    const cleanClaims = extractClaims(cleanText)
    const suspectClaims = extractClaims(suspectText)
    const cleanResult = detectConfidenceIssues(cleanText, cleanClaims)
    const suspectResult = detectConfidenceIssues(suspectText, suspectClaims)
    expect(cleanResult.score).toBeGreaterThan(suspectResult.score)
  })

  it('returns score in [0, 1]', () => {
    const text = 'I think maybe possibly perhaps this might be true.'
    const claims = extractClaims(text)
    const { score } = detectConfidenceIssues(text, claims)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(1)
  })

  it('score is 1.0 for neutral factual text', () => {
    const text = 'The Eiffel Tower stands in Paris and was built in 1889.'
    const claims = extractClaims(text)
    const { score } = detectConfidenceIssues(text, claims)
    expect(score).toBe(1)
  })
})

describe('fabricated-entities detector', () => {
  it('flags example.com URLs as critical', () => {
    const text = 'You can find more at https://example.com/article/details.'
    const { findings } = detectFabricatedEntities(text)
    const critical = findings.filter(f => f.severity === 'critical')
    expect(critical.length).toBeGreaterThanOrEqual(1)
    expect(critical.some(f => f.description.includes('example.com'))).toBe(true)
  })

  it('flags test.com URLs as critical', () => {
    const text = 'See the documentation at https://test.com/docs.'
    const { findings } = detectFabricatedEntities(text)
    expect(findings.some(f => f.severity === 'critical')).toBe(true)
  })

  it('lowers score for placeholder domain URLs', () => {
    const cleanText = 'The sky is blue.'
    const suspectText = 'Visit https://example.com for more info.'
    const cleanResult = detectFabricatedEntities(cleanText)
    const suspectResult = detectFabricatedEntities(suspectText)
    expect(cleanResult.score).toBeGreaterThan(suspectResult.score)
  })

  it('returns score 1.0 for text without URLs or citations', () => {
    const text = 'The Eiffel Tower is in Paris.'
    const { score } = detectFabricatedEntities(text)
    expect(score).toBe(1)
  })

  it('returns score in [0, 1]', () => {
    const text = 'See https://foo.com and https://placeholder.com/deep/path/here/more/stuff.'
    const { score } = detectFabricatedEntities(text)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(1)
  })
})

describe('internal-consistency detector', () => {
  it('detects antonym contradiction between similar claims', () => {
    // Two highly similar sentences with antonym pair
    const text = 'The population always increases every year. The population never increases every year.'
    const claims = extractClaims(text)
    const { findings } = detectInternalConsistency(text, claims)
    const criticals = findings.filter(f => f.severity === 'critical')
    expect(criticals.length).toBeGreaterThanOrEqual(1)
  })

  it('returns score 1.0 for consistent text', () => {
    const text = 'The sky is blue. The ocean is deep. Mountains are tall.'
    const claims = extractClaims(text)
    const { score } = detectInternalConsistency(text, claims)
    expect(score).toBe(1)
  })

  it('returns score in [0, 1]', () => {
    const text = 'The value always increases. The value never increases.'
    const claims = extractClaims(text)
    const { score } = detectInternalConsistency(text, claims)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(1)
  })
})
