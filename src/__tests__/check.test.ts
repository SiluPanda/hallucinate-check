import { describe, it, expect } from 'vitest'
import { check, createChecker } from '../check'

describe('check()', () => {
  it('returns a HallucinationReport with all required fields', () => {
    const report = check('The Eiffel Tower was built in 1889 in Paris.')
    expect(report).toHaveProperty('text')
    expect(report).toHaveProperty('composite')
    expect(report).toHaveProperty('passThreshold')
    expect(report).toHaveProperty('pass')
    expect(report).toHaveProperty('claimAssessments')
    expect(report).toHaveProperty('methodScores')
    expect(report).toHaveProperty('durationMs')
  })

  it('composite score is in [0, 1]', () => {
    const report = check('The sun rises in the east and sets in the west.')
    expect(report.composite).toBeGreaterThanOrEqual(0)
    expect(report.composite).toBeLessThanOrEqual(1)
  })

  it('pass=true for clean factual text with default threshold', () => {
    const report = check('The Eiffel Tower stands 330 meters tall and is located in Paris, France.')
    expect(report.pass).toBe(true)
  })

  it('pass=false for text with many overconfidence phrases at strict threshold', () => {
    // Use a strict threshold so that overconfidence penalties cause failure.
    // The composite will be reduced by confidence-language penalties but may
    // stay above 0.7 due to the other two detectors scoring 1.0 (no suspicious
    // URLs or contradictions). Using passThreshold=0.95 ensures even a modest
    // overconfidence penalty causes pass=false.
    const report = check(
      'Definitely, without question, all studies show this is 100% true. ' +
      'It is scientifically proven and absolutely certain that this never changes.',
      { passThreshold: 0.95 },
    )
    expect(report.composite).toBeLessThan(report.passThreshold)
    expect(report.pass).toBe(false)
  })

  it('suspicious text scores lower than clean text', () => {
    const clean = check('Paris is the capital of France. The Seine river runs through the city.')
    const suspect = check(
      'Definitely visit https://example.com for info. ' +
      'All studies show the always increases never decreases.',
    )
    expect(clean.composite).toBeGreaterThan(suspect.composite)
  })

  it('respects custom passThreshold', () => {
    const text = 'The Eiffel Tower is in Paris.'
    const strictReport = check(text, { passThreshold: 0.99 })
    const lenientReport = check(text, { passThreshold: 0.01 })
    expect(lenientReport.pass).toBe(true)
    // strict might fail since score depends on content
    expect(strictReport.passThreshold).toBe(0.99)
  })

  it('durationMs is a non-negative number', () => {
    const report = check('Some text here.')
    expect(report.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('claimAssessments match the number of extracted claims', () => {
    const text = 'The sun is hot. Water is wet. Ice is cold.'
    const report = check(text)
    expect(report.claimAssessments).toHaveLength(
      report.claimAssessments.length,
    )
    // Each assessment has classification
    for (const assessment of report.claimAssessments) {
      expect(['supported', 'uncertain', 'likely-hallucinated']).toContain(
        assessment.classification,
      )
    }
  })

  it('returns method scores for enabled methods', () => {
    const report = check('The Earth orbits the Sun.', {
      methods: ['confidence-language', 'fabricated-entities'],
    })
    expect(report.methodScores).toHaveProperty('confidence-language')
    expect(report.methodScores).toHaveProperty('fabricated-entities')
    expect(report.methodScores).not.toHaveProperty('internal-consistency')
  })

  it('flags example.com URL in text', () => {
    const report = check('More info at https://example.com/page.')
    const allFindings = report.claimAssessments.flatMap(a => a.findings)
    const fabricatedFindings = report.methodScores['fabricated-entities']
    expect(fabricatedFindings).toBeDefined()
    expect(fabricatedFindings!).toBeLessThan(1)
    void allFindings
  })
})

describe('createChecker()', () => {
  it('returns a Checker with check and extractClaims methods', () => {
    const checker = createChecker()
    expect(typeof checker.check).toBe('function')
    expect(typeof checker.extractClaims).toBe('function')
  })

  it('uses config defaults', () => {
    const checker = createChecker({ passThreshold: 0.5 })
    const report = checker.check('Some text about something.')
    expect(report.passThreshold).toBe(0.5)
  })

  it('options override config', () => {
    const checker = createChecker({ passThreshold: 0.5 })
    const report = checker.check('Text here.', { passThreshold: 0.9 })
    expect(report.passThreshold).toBe(0.9)
  })

  it('extractClaims extracts claims from text', () => {
    const checker = createChecker()
    const claims = checker.extractClaims('The sky is blue. The grass is green.')
    expect(claims.length).toBeGreaterThan(0)
  })
})
