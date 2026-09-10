import { describe, expect, it } from 'vitest'
import { SCENARIOS, buildEvents, buildSamples, calculateMetrics, type FeatureFlags } from './App'

const baseFeatures: FeatureFlags = {
  learnedAid: true,
  mapFeedback: true,
  faults: { gnssJump: false, pothole: true, mountShift: false, badSpeed: false },
}

describe('AstraNav deterministic simulation', () => {
  it('reproduces the core GNSS state sequence at the expected timestamps', () => {
    const scenario = SCENARIOS[0]
    const samples = buildSamples(scenario, baseFeatures)
    expect(samples).toHaveLength(1201)
    expect(samples[0].gnssState).toBe('TRUSTED')
    expect(samples[150].gnssState).toBe('DEGRADED')
    expect(samples[250].gnssState).toBe('DENIED')
    expect(samples[880].gnssState).toBe('REACQUIRING')
    expect(samples[1000].gnssState).toBe('TRUSTED')
  })

  it('keeps hybrid blackout error below the classical baseline in the default run', () => {
    const scenario = SCENARIOS[0]
    const metrics = calculateMetrics(buildSamples(scenario, baseFeatures), scenario)
    expect(metrics.hybridError).toBeLessThan(metrics.classicalError)
    expect(metrics.blackoutDistance).toBeGreaterThan(0)
    expect(metrics.hybridDrift).toBeGreaterThanOrEqual(0)
  })

  it('emits only enabled faults and exposes their event ledger', () => {
    const scenario = SCENARIOS[0]
    const enabled = buildEvents(scenario, baseFeatures.faults)
    const disabled = buildEvents(scenario, { ...baseFeatures.faults, pothole: false })
    expect(enabled.some((event) => event.title === 'SHOCK_DETECTED')).toBe(true)
    expect(disabled.some((event) => event.title === 'SHOCK_DETECTED')).toBe(false)
  })

  it('makes learned aid behavior measurable when disabled', () => {
    const scenario = SCENARIOS[0]
    const learned = calculateMetrics(buildSamples(scenario, baseFeatures), scenario)
    const classicalOnly = calculateMetrics(buildSamples(scenario, { ...baseFeatures, learnedAid: false }), scenario)
    expect(classicalOnly.hybridError).toBeGreaterThan(learned.hybridError)
  })
})
