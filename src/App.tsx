import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BrainCircuit,
  CarFront,
  Check,
  ChevronDown,
  CircleHelp,
  Compass,
  Crosshair,
  Database,
  Download,
  Gauge,
  History,
  Info,
  Layers3,
  LocateFixed,
  MapPinned,
  Menu,
  Navigation,
  Pause,
  Play,
  RotateCcw,
  Route,
  Satellite,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  SquareActivity,
  Timer,
  X,
  Zap,
} from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

export type NavState = 'TRUSTED' | 'DEGRADED' | 'DENIED' | 'REACQUIRING'
type NavMode = 'GNSS + INS' | 'DEGRADED FUSION' | 'DEAD RECKONING' | 'REACQUISITION'
type TabKey = 'navigate' | 'replay' | 'evidence' | 'system'
type LayerKey = 'reference' | 'classical' | 'hybrid' | 'map' | 'gnss' | 'uncertainty'

type Point = [number, number]

export type ScenarioDefinition = {
  id: string
  title: string
  description: string
  duration: number
  outageStart: number
  outageEnd: number
  defaultFaults: FaultFlags
  accent: string
}

export type FaultFlags = {
  gnssJump: boolean
  pothole: boolean
  mountShift: boolean
  badSpeed: boolean
}

export type FeatureFlags = {
  learnedAid: boolean
  mapFeedback: boolean
  faults: FaultFlags
}

type RoadCandidate = {
  name: string
  score: number
  color: string
  active: boolean
}

type NavigationEvent = {
  id: string
  time: number
  type: string
  severity: 'info' | 'warning' | 'critical' | 'success'
  title: string
  detail: string
  mitigation: string
}

export type NavigationSnapshot = {
  time: number
  reference: Point
  classical: Point
  hybrid: Point
  heading: number
  speed: number
  gnssState: NavState
  navMode: NavMode
  outageTime: number
  distanceSinceOutage: number
  bound95: number
  headingUncertainty: number
  virtualSpeed: number
  virtualSpeedSigma: number
  alignment: number
  mlConfidence: number
  oodScore: number
  mapConfidence: number
  navHealth: number
  nhc: 'ACTIVE' | 'SOFTENED' | 'OFF'
  shadowDisagreement: number
  thermal: 'STABLE' | 'WARM'
  candidates: RoadCandidate[]
  gnssFix: Point | null
  gnssRejected: boolean
  message: string
}

export type RunMetrics = {
  hybridError: number
  classicalError: number
  rawError: number
  hybridDrift: number
  classicalDrift: number
  reacquisitionDelay: number
  correctionJump: number
  boundCoverage: number
  blackoutDistance: number
}

const ROUTE_POINTS: Point[] = [
  [92, 548],
  [156, 515],
  [220, 500],
  [274, 462],
  [334, 425],
  [393, 386],
  [470, 355],
  [544, 354],
  [615, 320],
  [675, 282],
  [745, 242],
  [825, 201],
  [918, 160],
]

const BRANCH_POINTS: Point[] = [
  [470, 355],
  [505, 300],
  [555, 255],
  [610, 226],
  [672, 214],
  [716, 182],
]

const PARALLEL_POINTS: Point[] = [
  [304, 502],
  [371, 454],
  [442, 420],
  [521, 407],
  [603, 385],
  [698, 339],
  [780, 298],
  [874, 252],
]

export const SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'core-blackout',
    title: 'Core blackout',
    description: 'Tunnel approach, full denial, pothole, and gradual GNSS recovery.',
    duration: 120,
    outageStart: 25,
    outageEnd: 88,
    defaultFaults: { gnssJump: false, pothole: true, mountShift: false, badSpeed: false },
    accent: '#47d7f2',
  },
  {
    id: 'urban-canyon',
    title: 'Urban canyon',
    description: 'Multipath-heavy streets with a plausible parallel-road ambiguity.',
    duration: 120,
    outageStart: 34,
    outageEnd: 92,
    defaultFaults: { gnssJump: true, pothole: false, mountShift: false, badSpeed: false },
    accent: '#b6a1f5',
  },
  {
    id: 'mount-shift',
    title: 'Mount shift',
    description: 'A deliberate phone rotation tests alignment recovery and constraint softening.',
    duration: 120,
    outageStart: 28,
    outageEnd: 86,
    defaultFaults: { gnssJump: false, pothole: false, mountShift: true, badSpeed: false },
    accent: '#f3bb60',
  },
]

const LAYER_LABELS: Record<LayerKey, string> = {
  reference: 'Reference',
  classical: 'Classical INS',
  hybrid: 'AstraNav estimate',
  map: 'Map-assisted',
  gnss: 'GNSS fixes',
  uncertainty: '95% bound',
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function distance(a: Point, b: Point) {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

function lerpPoint(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

function routePoint(progress: number): Point {
  const scaled = clamp(progress, 0, 1) * (ROUTE_POINTS.length - 1)
  const index = Math.min(ROUTE_POINTS.length - 2, Math.floor(scaled))
  return lerpPoint(ROUTE_POINTS[index], ROUTE_POINTS[index + 1], scaled - index)
}

function routeHeading(progress: number) {
  const a = routePoint(clamp(progress - 0.002, 0, 1))
  const b = routePoint(clamp(progress + 0.002, 0, 1))
  return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI + 90
}

function pathString(points: Point[]) {
  return points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')
}

function formatTime(seconds: number) {
  const whole = Math.max(0, Math.round(seconds))
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`
}

export function buildEvents(scenario: ScenarioDefinition, faults: FaultFlags): NavigationEvent[] {
  const events: NavigationEvent[] = [
    { id: 'degraded', time: scenario.outageStart - 10, type: 'GNSS', severity: 'warning', title: 'GNSS_DEGRADED', detail: 'Position innovation is rising above the trust gate.', mitigation: 'Increase GNSS covariance and prepare dead reckoning.' },
    { id: 'denied', time: scenario.outageStart, type: 'GNSS', severity: 'critical', title: 'GNSS_DENIED', detail: 'No consistent fix is available for the estimator.', mitigation: 'Disable GNSS updates and continue with inertial aids.' },
    ...(faults.pothole ? [{ id: 'pothole', time: 45, type: 'FAULT', severity: 'warning' as const, title: 'SHOCK_DETECTED', detail: 'Short vibration impulse appears in the motion window.', mitigation: 'Inflate covariance and soften motion constraints for 3 s.' }] : []),
    { id: 'ambiguity', time: 65, type: 'MAP', severity: 'info', title: 'ROAD_AMBIGUITY', detail: 'Two connected road hypotheses remain plausible.', mitigation: 'Keep both candidates and suspend map feedback.' },
    ...(faults.mountShift ? [{ id: 'mount', time: 58, type: 'ALIGNMENT', severity: 'warning' as const, title: 'MOUNT_SHIFT_SUSPECT', detail: 'Frame residuals suggest the phone rotated in its mount.', mitigation: 'Soften NHC and learned aid while alignment recovers.' }] : []),
    ...(faults.gnssJump ? [{ id: 'jump', time: scenario.outageEnd + 1, type: 'GNSS', severity: 'warning' as const, title: 'GNSS_FIX_REJECTED', detail: 'Returned fix disagrees with speed, heading, and road context.', mitigation: 'Remain in reacquisition and wait for consistent fixes.' }] : [{ id: 'jump', time: scenario.outageEnd + 1, type: 'GNSS', severity: 'warning' as const, title: 'GNSS_FIX_REJECTED', detail: 'First returned fix fails the consistency gate.', mitigation: 'Remain in reacquisition and wait for consistent fixes.' }]),
    { id: 'reacquire', time: scenario.outageEnd + 4, type: 'GNSS', severity: 'success', title: 'GNSS_REACQUIRING', detail: 'Returned fixes agree with the inertial state.', mitigation: 'Accept with high covariance and observe three fixes.' },
    { id: 'trusted', time: scenario.outageEnd + 12, type: 'GNSS', severity: 'success', title: 'GNSS_TRUSTED', detail: 'Multiple consistent fixes passed integrity checks.', mitigation: 'Restore normal fusion and reduce covariance gradually.' },
  ]
  return events.sort((a, b) => a.time - b.time)
}

export function buildSamples(scenario: ScenarioDefinition, features: FeatureFlags): NavigationSnapshot[] {
  const total = Math.round(scenario.duration * 10)
  const samples: NavigationSnapshot[] = []
  for (let index = 0; index <= total; index += 1) {
    const time = index / 10
    const progress = clamp(0.018 + (time / scenario.duration) * 0.94, 0, 1)
    const reference = routePoint(progress)
    const heading = routeHeading(progress)
    const degraded = clamp((time - (scenario.outageStart - 10)) / 10, 0, 1)
    const deniedSeconds = clamp(time - scenario.outageStart, 0, scenario.outageEnd - scenario.outageStart)
    const reacquireSeconds = clamp(time - scenario.outageEnd, 0, 12)
    let gnssState: NavState = 'TRUSTED'
    if (time >= scenario.outageStart - 10 && time < scenario.outageStart) gnssState = 'DEGRADED'
    if (time >= scenario.outageStart && time < scenario.outageEnd) gnssState = 'DENIED'
    if (time >= scenario.outageEnd && time < scenario.outageEnd + 12) gnssState = 'REACQUIRING'

    const potholeActive = features.faults.pothole && time >= 45 && time < 48
    const mountActive = features.faults.mountShift && time >= 58 && time < 66
    const jumpActive = features.faults.gnssJump && time >= scenario.outageEnd + 1 && time < scenario.outageEnd + 3
    const speedFault = features.faults.badSpeed && time >= 70 && time < 80
    const lateralDrift = Math.sin(time * 0.41 + scenario.id.length) * (deniedSeconds * 0.055 + 0.25)
    const forwardDrift = deniedSeconds * (features.learnedAid ? 0.035 : 0.075) + Math.sin(time * 0.17) * 0.65
    const faultScale = mountActive ? 1.9 : potholeActive ? 1.3 : 1
    const classical: Point = [reference[0] + forwardDrift * 1.8 * faultScale + deniedSeconds * 0.12, reference[1] + lateralDrift * 2.4 * faultScale]
    let hybrid: Point = [reference[0] + forwardDrift * faultScale, reference[1] + lateralDrift * faultScale]
    const mapScore = time >= 60 && time <= 80 ? 0.56 + Math.sin(time * 0.4) * 0.035 : clamp(0.94 - degraded * 0.13, 0.52, 0.98)
    if (features.mapFeedback && mapScore > 0.8 && time < scenario.outageEnd) {
      hybrid = lerpPoint(hybrid, reference, 0.28)
    }
    if (gnssState === 'REACQUIRING') hybrid = lerpPoint(hybrid, reference, 0.08 + reacquireSeconds * 0.018)
    if (gnssState === 'TRUSTED' && time >= scenario.outageEnd + 12) hybrid = lerpPoint(hybrid, reference, 0.32)
    if (jumpActive) hybrid = [hybrid[0] + 12, hybrid[1] - 8]

    const positionBound = gnssState === 'TRUSTED'
      ? 2.6 + Math.sin(time * 0.25) * 0.25
      : gnssState === 'DEGRADED'
        ? 3.4 + degraded * 1.8
        : gnssState === 'DENIED'
          ? 4.3 + deniedSeconds * 0.055 + (potholeActive ? 4.2 : 0) + (mountActive ? 2.7 : 0)
          : 8.9 - reacquireSeconds * 0.42
    const candidates: RoadCandidate[] = time >= 60 && time <= 80
      ? [
          { name: 'Aster Avenue', score: clamp(mapScore, 0, 1), color: '#47d7f2', active: false },
          { name: 'North Ramp', score: 0.37 + Math.cos(time * 0.2) * 0.02, color: '#b6a1f5', active: false },
          { name: 'Service Road', score: 0.08, color: '#8293a6', active: false },
        ]
      : [
          { name: 'Aster Avenue', score: clamp(mapScore + 0.04, 0, 1), color: '#47d7f2', active: true },
          { name: 'North Ramp', score: 0.14, color: '#b6a1f5', active: false },
          { name: 'Service Road', score: 0.05, color: '#8293a6', active: false },
        ]
    const normalized = candidates.reduce((sum, candidate) => sum + candidate.score, 0)
    const normalizedCandidates = candidates.map((candidate) => ({ ...candidate, score: candidate.score / normalized }))
    const activeCandidate = normalizedCandidates[0].score > 0.8 && normalizedCandidates[0].score - normalizedCandidates[1].score > 0.2
    normalizedCandidates.forEach((candidate, candidateIndex) => { candidate.active = activeCandidate && candidateIndex === 0 })
    const speed = 11.5 + Math.sin(time * 0.12) * 1.6 + (time > 96 ? Math.sin(time * 0.4) * 0.6 : 0)
    const virtualSigma = features.learnedAid ? (speedFault ? 1.7 : 0.28 + (mountActive ? 0.8 : 0)) : 2.4
    const gnssFix = gnssState === 'DENIED' ? null : [reference[0] + (jumpActive ? 14 : Math.sin(time * 0.9) * (gnssState === 'DEGRADED' ? 2.2 : 0.7)), reference[1] + (jumpActive ? -10 : Math.cos(time * 0.8) * (gnssState === 'DEGRADED' ? 1.7 : 0.5))] as Point
    const message = gnssState === 'TRUSTED'
      ? time >= scenario.outageEnd + 12 ? 'Reliable GNSS restored.' : 'Satellite positioning is stable.'
      : gnssState === 'DEGRADED'
        ? 'GNSS quality is falling. Inertial navigation is carrying more of the estimate.'
        : gnssState === 'DENIED'
          ? potholeActive ? 'Shock detected. Confidence is adapting while dead reckoning continues.' : mountActive ? 'Mount shift suspected. Alignment recovery is in progress.' : 'GNSS unavailable. Continuing with dead reckoning.'
          : 'Signal returned. Checking consistency before correction.'
    const navHealth = clamp(
      (gnssState === 'TRUSTED' ? 94 : gnssState === 'DEGRADED' ? 79 : gnssState === 'REACQUIRING' ? 72 : 86)
        - (potholeActive ? 13 : 0)
        - (mountActive ? 19 : 0)
        - (speedFault ? 12 : 0)
        - deniedSeconds * 0.045,
      38,
      98,
    )
    samples.push({
      time,
      reference,
      classical,
      hybrid,
      heading,
      speed,
      gnssState,
      navMode: gnssState === 'TRUSTED' ? 'GNSS + INS' : gnssState === 'DEGRADED' ? 'DEGRADED FUSION' : gnssState === 'DENIED' ? 'DEAD RECKONING' : 'REACQUISITION',
      outageTime: deniedSeconds,
      distanceSinceOutage: deniedSeconds * speed,
      bound95: Math.max(1.8, positionBound),
      headingUncertainty: gnssState === 'TRUSTED' ? 1.4 : 2.6 + deniedSeconds * 0.05 + (mountActive ? 7 : 0),
      virtualSpeed: speed + Math.sin(time * 0.7) * (speedFault ? 1.9 : 0.12),
      virtualSpeedSigma: virtualSigma,
      alignment: mountActive ? 0.47 : features.faults.mountShift && time >= 66 && time < 78 ? 0.74 : 0.98,
      mlConfidence: features.learnedAid ? (speedFault ? 0.39 : mountActive ? 0.58 : 0.96) : 0,
      oodScore: speedFault ? 0.78 : mountActive ? 0.43 : potholeActive ? 0.31 : 0.04,
      mapConfidence: normalizedCandidates[0].score,
      navHealth,
      nhc: mountActive || potholeActive ? 'SOFTENED' : features.learnedAid ? 'ACTIVE' : 'OFF',
      shadowDisagreement: distance(classical, hybrid) * 0.08 + (speedFault ? 3.4 : mountActive ? 2.2 : 0.4),
      thermal: time > 86 && time < 104 ? 'WARM' : 'STABLE',
      candidates: normalizedCandidates,
      gnssFix,
      gnssRejected: jumpActive,
      message,
    })
  }
  return samples
}

export function calculateMetrics(samples: NavigationSnapshot[], scenario: ScenarioDefinition): RunMetrics {
  const start = samples[Math.round(scenario.outageStart * 10)]
  const end = samples[Math.round(scenario.outageEnd * 10)]
  const hybridError = distance(end.hybrid, end.reference)
  const classicalError = distance(end.classical, end.reference)
  const rawError = distance(end.classical, end.reference) * 0.74
  const blackoutDistance = Math.max(1, end.distanceSinceOutage)
  const coverageSamples = samples.filter((sample) => sample.time >= scenario.outageStart && sample.time <= scenario.outageEnd)
  const covered = coverageSamples.filter((sample) => distance(sample.hybrid, sample.reference) <= sample.bound95).length
  const recoveryStart = samples.find((sample) => sample.time >= scenario.outageEnd + 12) ?? end
  return {
    hybridError,
    classicalError,
    rawError,
    hybridDrift: (100 * hybridError) / blackoutDistance,
    classicalDrift: (100 * classicalError) / blackoutDistance,
    reacquisitionDelay: 12,
    correctionJump: distance(recoveryStart.hybrid, end.hybrid),
    boundCoverage: (100 * covered) / Math.max(1, coverageSamples.length),
    blackoutDistance,
  }
}

function statusLabel(state: NavState) {
  return state === 'TRUSTED' ? 'Trusted' : state === 'DEGRADED' ? 'Degraded' : state === 'DENIED' ? 'Denied' : 'Reacquiring'
}

function statusClass(state: NavState) {
  return state.toLowerCase()
}

function IconButton({ label, onClick, children, active = false, className = '' }: { label: string; onClick?: () => void; children: React.ReactNode; active?: boolean; className?: string }) {
  return <button className={`icon-button ${active ? 'active' : ''} ${className}`} aria-label={label} title={label} onClick={onClick}>{children}</button>
}

function StatusPill({ state }: { state: NavState }) {
  return <span className={`status-pill ${statusClass(state)}`}><span className="status-dot" />{statusLabel(state)}</span>
}

function App() {
  const [tab, setTab] = useState<TabKey>('navigate')
  const [expert, setExpert] = useState(true)
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id)
  const scenario = SCENARIOS.find((item) => item.id === scenarioId) ?? SCENARIOS[0]
  const [features, setFeatures] = useState<FeatureFlags>({ learnedAid: true, mapFeedback: true, faults: scenario.defaultFaults })
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({ reference: true, classical: true, hybrid: true, map: true, gnss: true, uncertainty: true })
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [guided, setGuided] = useState(true)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [mobileMenu, setMobileMenu] = useState(false)

  const samples = useMemo(() => buildSamples(scenario, features), [scenario, features])
  const events = useMemo(() => buildEvents(scenario, features.faults), [scenario, features.faults])
  const metrics = useMemo(() => calculateMetrics(samples, scenario), [samples, scenario])
  const current = samples[Math.min(samples.length - 1, Math.round(time * 10))]
  const visibleEvents = events.filter((event) => event.time <= current.time + 0.05)
  const chartSamples = samples.filter((sample) => sample.time <= current.time + 0.001).filter((_, index, list) => index % Math.max(1, Math.floor(list.length / 90)) === 0)

  useEffect(() => {
    setTime(0)
    setPlaying(false)
    setSelectedEventId(null)
  }, [scenarioId, features.learnedAid, features.mapFeedback, features.faults.gnssJump, features.faults.pothole, features.faults.mountShift, features.faults.badSpeed])

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      setTime((previous) => {
        const next = Math.min(scenario.duration, previous + 0.1 * speed)
        if (next >= scenario.duration) setPlaying(false)
        return next
      })
    }, 100)
    return () => window.clearInterval(timer)
  }, [playing, scenario.duration, speed])

  const setFault = (fault: keyof FaultFlags) => {
    setFeatures((previous) => ({ ...previous, faults: { ...previous.faults, [fault]: !previous.faults[fault] } }))
  }

  const resetRun = () => {
    setTime(0)
    setPlaying(false)
    setSelectedEventId(null)
  }

  const downloadRun = (format: 'json' | 'csv') => {
    const payload = {
      provenance: { product: 'AstraNav-IDR', mode: 'synthetic simulation', scenario: scenario.title, seed: scenario.id, generatedAt: new Date().toISOString() },
      configuration: { features, duration: scenario.duration, blackout: [scenario.outageStart, scenario.outageEnd] },
      metrics,
      events,
      snapshots: samples,
    }
    let content = ''
    let filename = `astranav-${scenario.id}-synthetic.${format}`
    if (format === 'json') content = JSON.stringify(payload, null, 2)
    else {
      filename = `astranav-${scenario.id}-telemetry.csv`
      content = ['time,reference_x,reference_y,hybrid_x,hybrid_y,classical_x,classical_y,gnss_state,bound95,nav_health,map_confidence', ...samples.map((sample) => [sample.time.toFixed(1), sample.reference[0].toFixed(3), sample.reference[1].toFixed(3), sample.hybrid[0].toFixed(3), sample.hybrid[1].toFixed(3), sample.classical[0].toFixed(3), sample.classical[1].toFixed(3), sample.gnssState, sample.bound95.toFixed(3), sample.navHealth.toFixed(1), sample.mapConfidence.toFixed(3)].join(','))].join('\n')
    }
    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/csv' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  const selectEvent = (event: NavigationEvent) => {
    setTime(event.time)
    setSelectedEventId(event.id)
    setPlaying(false)
    setTab('navigate')
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? 'mobile-open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><span /><span /><span /><span /></div>
          <div><div className="brand-name">AstraNav</div><div className="brand-sub">IDR / 26168</div></div>
          <button className="sidebar-close" onClick={() => setMobileMenu(false)} aria-label="Close navigation"><X size={18} /></button>
        </div>
        <div className="sidebar-section-label">Instrument</div>
        <nav className="primary-nav" aria-label="Primary navigation">
          <NavItem active={tab === 'navigate'} icon={<Navigation size={17} />} label="Navigate" onClick={() => { setTab('navigate'); setMobileMenu(false) }} />
          <NavItem active={tab === 'replay'} icon={<History size={17} />} label="Replay Lab" onClick={() => { setTab('replay'); setMobileMenu(false) }} />
          <NavItem active={tab === 'evidence'} icon={<ShieldCheck size={17} />} label="Evidence" onClick={() => { setTab('evidence'); setMobileMenu(false) }} />
          <NavItem active={tab === 'system'} icon={<Settings2 size={17} />} label="System" onClick={() => { setTab('system'); setMobileMenu(false) }} />
        </nav>
        <div className="sidebar-bottom">
          <div className="offline-note"><span className="live-dot" />Offline-ready demo</div>
          <div className="sidebar-identity"><span className="avatar">R</span><div><strong>Team Recalibrate</strong><span>SIH 2026</span></div><ChevronDown size={14} /></div>
        </div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <IconButton label="Open navigation" className="mobile-menu-button" onClick={() => setMobileMenu(true)}><Menu size={18} /></IconButton>
            <div className="breadcrumb"><span className="muted-label">SCENARIO</span><span className="breadcrumb-chevron">/</span><strong>{scenario.title}</strong></div>
            <span className="simulation-badge"><span className="status-dot" />Simulation demo</span>
          </div>
          <div className="topbar-right">
            <span className="clock-label"><Activity size={14} /> 10 Hz simulation</span>
            <div className="mode-switch" role="group" aria-label="Display mode"><button className={!expert ? 'selected' : ''} onClick={() => setExpert(false)}>Basic</button><button className={expert ? 'selected' : ''} onClick={() => setExpert(true)}>Expert</button></div>
          </div>
        </header>

        {tab === 'navigate' || tab === 'replay' ? (
          <div className="content-grid">
            <ScenarioPanel scenario={scenario} tab={tab} onPlayDemo={() => { setTime(0); setPlaying(true); setTab('navigate') }} playing={playing} onReset={resetRun} onScenarioChange={(id) => { setScenarioId(id); const next = SCENARIOS.find((item) => item.id === id); if (next) setFeatures((previous) => ({ ...previous, faults: next.defaultFaults })) }} speed={speed} setSpeed={setSpeed} features={features} setFault={setFault} setFeature={(key, value) => setFeatures((previous) => ({ ...previous, [key]: value }))} guided={guided} setGuided={setGuided} />
            <div className="map-column">
              <div className="map-toolbar"><div className="map-title"><MapPinned size={16} /><span>Synthetic test district</span><span className="map-mode-chip">LOCAL ENU</span></div><div className="map-toolbar-actions"><IconButton label="Center on vehicle" onClick={() => setTime(time)}><LocateFixed size={16} /></IconButton><IconButton label="Map layers" active={Object.values(layers).some(Boolean)}><Layers3 size={16} /></IconButton></div></div>
              <MapScene snapshot={current} samples={samples} layers={layers} setLayer={(layer) => setLayers((previous) => ({ ...previous, [layer]: !previous[layer] }))} selectedEventId={selectedEventId} />
              <Timeline scenario={scenario} current={current} playing={playing} speed={speed} setPlaying={setPlaying} setTime={setTime} events={events} visibleEvents={visibleEvents} selectedEventId={selectedEventId} onSelectEvent={selectEvent} onReset={resetRun} />
            </div>
            <InstrumentPanel expert={expert} snapshot={current} metrics={metrics} tab={tab} features={features} setFeature={(key, value) => setFeatures((previous) => ({ ...previous, [key]: value }))} onDownload={downloadRun} guided={guided} />
          </div>
        ) : tab === 'evidence' ? (
          <EvidenceView scenario={scenario} current={current} samples={samples} metrics={metrics} chartSamples={chartSamples} onDownload={downloadRun} />
        ) : (
          <SystemView />
        )}
      </main>
    </div>
  )
}

function NavItem({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>{icon}<span>{label}</span>{active && <span className="nav-active-dot" />}</button>
}

function ScenarioPanel({ scenario, tab, onPlayDemo, playing, onReset, onScenarioChange, speed, setSpeed, features, setFault, setFeature, guided, setGuided }: { scenario: ScenarioDefinition; tab: TabKey; onPlayDemo: () => void; playing: boolean; onReset: () => void; onScenarioChange: (id: string) => void; speed: number; setSpeed: (value: number) => void; features: FeatureFlags; setFault: (fault: keyof FaultFlags) => void; setFeature: (key: 'learnedAid' | 'mapFeedback', value: boolean) => void; guided: boolean; setGuided: (value: boolean) => void }) {
  return <section className="scenario-panel">
    <div className="panel-eyebrow"><span className="eyebrow-line" />REPLAY CONTROL</div>
    <div className="scenario-heading"><div><h1>{tab === 'replay' ? 'Replay Lab' : 'Navigation'}</h1><p>{tab === 'replay' ? 'Test the estimator against controlled failures.' : 'A trust-aware view of the current journey.'}</p></div><IconButton label="Panel settings"><SlidersHorizontal size={16} /></IconButton></div>
    <button className="demo-cta" onClick={onPlayDemo}><span className="demo-cta-icon">{playing ? <Pause size={16} /> : <Play size={16} fill="currentColor" />}</span><span><strong>{playing ? 'Demo playing' : 'Play 2-minute demo'}</strong><small>Walk through the full blackout</small></span><ArrowUpRight size={16} /></button>
    <div className="field-label">SCENARIO</div>
    <div className="select-wrap"><select value={scenario.id} onChange={(event) => onScenarioChange(event.target.value)} aria-label="Choose a scenario">{SCENARIOS.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><ChevronDown size={16} /></div>
    <p className="scenario-description">{scenario.description}</p>
    <div className="scenario-meta"><div><span>BLACKOUT</span><strong>{formatTime(scenario.outageEnd - scenario.outageStart)}</strong></div><div><span>OUTPUT</span><strong>10 Hz</strong></div><div><span>MAP</span><strong>Offline</strong></div></div>
    <div className="panel-divider" />
    <div className="control-heading"><span>Simulation aids</span><span className="small-mono">LIVE</span></div>
    <ToggleRow icon={<BrainCircuit size={15} />} label="Virtual odometer" detail="Learned speed + sigma" value={features.learnedAid} onChange={() => setFeature('learnedAid', !features.learnedAid)} />
    <ToggleRow icon={<Route size={15} />} label="Road hypotheses" detail="Probabilistic map feedback" value={features.mapFeedback} onChange={() => setFeature('mapFeedback', !features.mapFeedback)} />
    <div className="control-heading faults-heading"><span>Inject a fault</span><CircleHelp size={14} /></div>
    <FaultRow label="GNSS jump" active={features.faults.gnssJump} onClick={() => setFault('gnssJump')} color="coral" />
    <FaultRow label="Pothole impulse" active={features.faults.pothole} onClick={() => setFault('pothole')} color="amber" />
    <FaultRow label="Mount rotation" active={features.faults.mountShift} onClick={() => setFault('mountShift')} color="lavender" />
    <FaultRow label="Bad learned speed" active={features.faults.badSpeed} onClick={() => setFault('badSpeed')} color="coral" />
    <div className="panel-divider" />
    <div className="control-heading"><span>Playback</span><span className="playback-time">{speed}×</span></div>
    <div className="speed-row">{[0.5, 1, 2, 4].map((value) => <button key={value} className={speed === value ? 'selected' : ''} onClick={() => setSpeed(value)}>{value}×</button>)}</div>
    <ToggleRow icon={<Info size={15} />} label="Guided annotations" detail="Explain each state change" value={guided} onChange={() => setGuided(!guided)} />
    <button className="reset-button" onClick={onReset}><RotateCcw size={14} /> Reset run</button>
    <div className="panel-footnote"><span className="status-dot mint" /> Synthetic data stays local to this browser</div>
  </section>
}

function ToggleRow({ icon, label, detail, value, onChange }: { icon: React.ReactNode; label: string; detail: string; value: boolean; onChange: () => void }) {
  return <button className="toggle-row" onClick={onChange} aria-pressed={value}><span className={`toggle-icon ${value ? 'on' : ''}`}>{icon}</span><span className="toggle-copy"><strong>{label}</strong><small>{detail}</small></span><span className={`switch ${value ? 'on' : ''}`}><span /></span></button>
}

function FaultRow({ label, active, onClick, color }: { label: string; active: boolean; onClick: () => void; color: string }) {
  return <button className={`fault-row ${active ? 'active' : ''}`} onClick={onClick}><span className={`fault-dot ${color}`} />{label}<span className="fault-state">{active ? 'ON' : 'OFF'}</span></button>
}

function MapScene({ snapshot, samples, layers, setLayer, selectedEventId }: { snapshot: NavigationSnapshot; samples: NavigationSnapshot[]; layers: Record<LayerKey, boolean>; setLayer: (layer: LayerKey) => void; selectedEventId: string | null }) {
  const upto = samples.filter((sample) => sample.time <= snapshot.time + 0.001)
  const sampled = upto.filter((_, index) => index % 4 === 0)
  const gnssSamples = upto.filter((sample) => sample.gnssFix && Math.round(sample.time * 10) % 18 === 0)
  const ellipseScale = 2.15
  const markerRotation = ((snapshot.heading % 360) + 360) % 360 - 90
  const layerKeys: LayerKey[] = ['reference', 'classical', 'hybrid', 'map', 'gnss', 'uncertainty']
  return <div className="map-scene">
    <svg viewBox="0 0 1000 650" role="img" aria-label="Synthetic road map showing reference, classical and AstraNav trajectories">
      <defs>
        <linearGradient id="mapWash" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stopColor="#0d1b27" /><stop offset="100%" stopColor="#09131d" /></linearGradient>
        <filter id="routeGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1b2d3d" strokeWidth="1" opacity="0.35" /></pattern>
      </defs>
      <rect width="1000" height="650" fill="url(#mapWash)" />
      <rect width="1000" height="650" fill="url(#grid)" opacity="0.32" />
      <path d={pathString(BRANCH_POINTS)} fill="none" stroke="#203746" strokeWidth="66" strokeLinecap="round" />
      <path d={pathString(PARALLEL_POINTS)} fill="none" stroke="#203746" strokeWidth="58" strokeLinecap="round" />
      <path d={pathString(ROUTE_POINTS)} fill="none" stroke="#203746" strokeWidth="70" strokeLinecap="round" />
      <path d={pathString(BRANCH_POINTS)} fill="none" stroke="#365260" strokeWidth="42" strokeLinecap="round" />
      <path d={pathString(PARALLEL_POINTS)} fill="none" stroke="#334b59" strokeWidth="35" strokeLinecap="round" />
      <path d={pathString(ROUTE_POINTS)} fill="none" stroke="#385461" strokeWidth="44" strokeLinecap="round" />
      <path d={pathString(ROUTE_POINTS)} fill="none" stroke="#9ab0b8" strokeWidth="1.3" strokeDasharray="7 9" opacity="0.6" />
      <path d={pathString(ROUTE_POINTS.slice(4, 9))} fill="none" stroke="#121d28" strokeWidth="72" strokeLinecap="round" opacity="0.95" />
      <path d={pathString(ROUTE_POINTS.slice(4, 9))} fill="none" stroke="#233441" strokeWidth="54" strokeLinecap="round" opacity="0.98" />
      <g opacity="0.62" fill="#132531" stroke="#244251" strokeWidth="1">
        <rect x="58" y="60" width="130" height="72" rx="8" /><rect x="215" y="74" width="102" height="86" rx="8" /><rect x="355" y="44" width="125" height="92" rx="8" /><rect x="525" y="62" width="110" height="82" rx="8" /><rect x="690" y="54" width="152" height="95" rx="8" />
        <rect x="48" y="252" width="142" height="82" rx="8" /><rect x="222" y="252" width="92" height="112" rx="8" /><rect x="719" y="372" width="132" height="80" rx="8" /><rect x="866" y="338" width="86" height="110" rx="8" /><rect x="72" y="600" width="160" height="28" rx="8" /><rect x="766" y="548" width="150" height="36" rx="8" />
      </g>
      <g className="map-labels"><text x="110" y="212">ASTER DISTRICT</text><text x="438" y="324">TUNNEL 04</text><text x="716" y="530">PARKING STRUCTURE</text><text x="720" y="174">NORTH RAMP</text></g>
      {layers.reference && <path d={pathString(samples.filter((_, index) => index % 4 === 0).map((sample) => sample.reference))} fill="none" stroke="#aab9c5" strokeWidth="2" strokeDasharray="4 8" opacity="0.72" />}
      {layers.classical && <path d={pathString(sampled.map((sample) => sample.classical))} fill="none" stroke="#ff7e79" strokeWidth="2.1" opacity="0.78" />}
      {layers.hybrid && <path d={pathString(sampled.map((sample) => sample.hybrid))} fill="none" stroke="#47d7f2" strokeWidth="10" opacity="0.14" filter="url(#routeGlow)" />}
      {layers.hybrid && <path d={pathString(sampled.map((sample) => sample.hybrid))} fill="none" stroke="#47d7f2" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />}
      {layers.map && <path d={pathString(sampled.map((sample) => sample.hybrid))} fill="none" stroke="#b6a1f5" strokeWidth="1.2" strokeDasharray="2 6" opacity="0.9" />}
      {layers.gnss && gnssSamples.map((sample) => <circle key={sample.time} cx={sample.gnssFix![0]} cy={sample.gnssFix![1]} r={sample.gnssRejected ? 5 : 3} fill={sample.gnssRejected ? '#ff7e79' : '#50dba5'} opacity={sample.gnssRejected ? 0.85 : 0.7} />)}
      {layers.uncertainty && <ellipse cx={snapshot.hybrid[0]} cy={snapshot.hybrid[1]} rx={snapshot.bound95 * ellipseScale} ry={snapshot.bound95 * ellipseScale * 0.55} transform={`rotate(${snapshot.heading} ${snapshot.hybrid[0]} ${snapshot.hybrid[1]})`} fill="#47d7f2" fillOpacity="0.08" stroke="#47d7f2" strokeWidth="1.4" strokeDasharray="5 5" />}
      {snapshot.candidates.map((candidate, index) => <g key={candidate.name} opacity={candidate.score > 0.18 ? 0.9 : 0.35}><circle cx={index === 0 ? 555 : index === 1 ? 612 : 666} cy={index === 0 ? 350 : index === 1 ? 257 : 214} r={candidate.active ? 8 : 5} fill={candidate.color} fillOpacity={candidate.active ? 0.16 : 0.08} stroke={candidate.color} strokeWidth="1.4" /><text x={index === 0 ? 570 : index === 1 ? 627 : 681} y={index === 0 ? 354 : index === 1 ? 261 : 218} className="candidate-label">{candidate.name} · {(candidate.score * 100).toFixed(0)}%</text></g>)}
      <g transform={`translate(${snapshot.hybrid[0]} ${snapshot.hybrid[1]}) rotate(${markerRotation})`} className="vehicle-marker"><path d="M 0 -22 L 8 -5 L 7 17 Q 0 24 -7 17 L -8 -5 Z" fill="#47d7f2" fillOpacity="0.23" stroke="#8ceafa" strokeWidth="1.5" /><path d="M 0 -15 L 4 -3 L -4 -3 Z" fill="#eff6fc" /><circle r="3" fill="#071018" stroke="#8ceafa" strokeWidth="1.4" /></g>
      <g className="compass" transform="translate(925 76)"><circle r="25" fill="#0c1924" fillOpacity="0.8" stroke="#2b4553" /><path d="M 0 -16 L 4 0 L 0 16 L -4 0 Z" fill="#47d7f2" opacity="0.9" /><text x="-4" y="-29">N</text></g>
    </svg>
    <div className="map-overlay top-left"><span className="overlay-kicker">NAVIGATION MODE</span><strong>{snapshot.navMode}</strong><StatusPill state={snapshot.gnssState} /></div>
    <div className="map-overlay bottom-left"><span className="road-key"><i className="legend-line cyan" />AstraNav</span><span className="road-key"><i className="legend-line coral" />Classical</span><span className="road-key"><i className="legend-line dashed" />Reference</span></div>
    <div className="map-layer-popover"><div className="layer-popover-title"><Layers3 size={14} /> Layers</div>{layerKeys.map((layer) => <button key={layer} className={`layer-toggle ${layers[layer] ? 'on' : ''}`} onClick={() => setLayer(layer)}><span className={`layer-swatch ${layer}`} /><span>{LAYER_LABELS[layer]}</span><span className="layer-check">{layers[layer] ? <Check size={12} /> : ''}</span></button>)}</div>
    {selectedEventId && <div className="selected-event-pin"><span className="status-dot coral" />Event selected on timeline</div>}
  </div>
}

function Timeline({ scenario, current, playing, speed, setPlaying, setTime, events, visibleEvents, selectedEventId, onSelectEvent, onReset }: { scenario: ScenarioDefinition; current: NavigationSnapshot; playing: boolean; speed: number; setPlaying: (value: boolean) => void; setTime: (value: number) => void; events: NavigationEvent[]; visibleEvents: NavigationEvent[]; selectedEventId: string | null; onSelectEvent: (event: NavigationEvent) => void; onReset: () => void }) {
  return <div className="timeline-panel">
    <div className="timeline-topline"><div className="timeline-label"><span className="timeline-live" />REPLAY TIMELINE</div><span className="timeline-current">{formatTime(current.time)} <span>/ {formatTime(scenario.duration)}</span></span></div>
    <div className="timeline-track-wrap"><div className="timeline-track-base"><div className="timeline-progress" style={{ width: `${(current.time / scenario.duration) * 100}%` }} /><div className="timeline-window blackout" style={{ left: `${(scenario.outageStart / scenario.duration) * 100}%`, width: `${((scenario.outageEnd - scenario.outageStart) / scenario.duration) * 100}%` }} /><div className="timeline-window degraded" style={{ left: `${((scenario.outageStart - 10) / scenario.duration) * 100}%`, width: `${(10 / scenario.duration) * 100}%` }} />{events.map((event) => <button key={event.id} className={`timeline-marker ${event.severity} ${selectedEventId === event.id ? 'selected' : ''}`} style={{ left: `${(event.time / scenario.duration) * 100}%` }} onClick={() => onSelectEvent(event)} title={`${event.title} at ${formatTime(event.time)}`} aria-label={`${event.title} at ${formatTime(event.time)}`} />)}<input type="range" min="0" max={scenario.duration} step="0.1" value={current.time} onChange={(event) => setTime(Number(event.target.value))} aria-label="Replay position" /></div></div>
    <div className="timeline-controls"><div className="timeline-buttons"><IconButton label="Reset replay" onClick={onReset}><RotateCcw size={15} /></IconButton><button className="play-button" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause replay' : 'Play replay'}>{playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</button><span className="timeline-speed">{speed}×</span></div><div className="timeline-legend"><span><i className="state-bar trusted" />Trusted</span><span><i className="state-bar degraded" />Degraded</span><span><i className="state-bar denied" />Denied</span><span><i className="state-bar reacquiring" />Reacquiring</span></div><div className="timeline-event-count"><strong>{visibleEvents.length}</strong> events</div></div>
  </div>
}

function InstrumentPanel({ expert, snapshot, metrics, tab, features, setFeature, onDownload, guided }: { expert: boolean; snapshot: NavigationSnapshot; metrics: RunMetrics; tab: TabKey; features: FeatureFlags; setFeature: (key: 'learnedAid' | 'mapFeedback', value: boolean) => void; onDownload: (format: 'json' | 'csv') => void; guided: boolean }) {
  return <section className={`instrument-panel ${expert ? 'expert' : 'basic'}`}>
    <div className="instrument-head"><div><div className="panel-eyebrow"><span className="eyebrow-line" />LIVE INSTRUMENT</div><h2>{tab === 'replay' ? 'Replay state' : 'Navigation health'}</h2></div><div className={`health-ring ${snapshot.navHealth < 60 ? 'low' : snapshot.navHealth < 80 ? 'medium' : ''}`}><span>{Math.round(snapshot.navHealth)}</span><small>HEALTH</small></div></div>
    <div className={`trust-hero ${statusClass(snapshot.gnssState)}`}><div className="trust-hero-top"><StatusPill state={snapshot.gnssState} /><span className="trust-mode">{snapshot.navMode}</span></div><h3>{snapshot.message}</h3><div className="trust-meta"><span><Timer size={14} />{snapshot.gnssState === 'DENIED' ? formatTime(snapshot.outageTime) : snapshot.gnssState === 'REACQUIRING' ? 'Checking' : 'Live'}</span><span><Gauge size={14} />{snapshot.speed.toFixed(1)} m/s</span></div></div>
    <div className="key-stat-grid"><Stat label="95% position bound" value={`${snapshot.bound95.toFixed(1)} m`} tone={snapshot.bound95 > 8 ? 'amber' : 'cyan'} /><Stat label="Distance since outage" value={`${snapshot.distanceSinceOutage.toFixed(0)} m`} /><Stat label="Heading" value={`${(((snapshot.heading % 360) + 360) % 360).toFixed(0)}°`} /><Stat label="Virtual speed" value={`${(snapshot.virtualSpeed * 3.6).toFixed(1)} km/h`} /></div>
    {expert && <>
      <div className="instrument-divider" />
      <div className="instrument-section-title"><span>Trust signals</span><span className="small-mono">NOW</span></div>
      <SignalRow label="Alignment" value={`${Math.round(snapshot.alignment * 100)}%`} meter={snapshot.alignment} tone={snapshot.alignment < 0.7 ? 'amber' : 'mint'} />
      <SignalRow label="Learned aid confidence" value={features.learnedAid ? `${Math.round(snapshot.mlConfidence * 100)}%` : 'Off'} meter={features.learnedAid ? snapshot.mlConfidence : 0} tone={snapshot.oodScore > 0.5 ? 'amber' : 'cyan'} />
      <SignalRow label="Map candidate" value={`${Math.round(snapshot.mapConfidence * 100)}%`} meter={snapshot.mapConfidence} tone="lavender" />
      <SignalRow label="ML OOD score" value={snapshot.oodScore.toFixed(2)} meter={1 - snapshot.oodScore} tone={snapshot.oodScore > 0.5 ? 'coral' : 'mint'} />
      <div className="signal-pair"><span><i className="signal-icon"><Compass size={14} /></i>Heading sigma <strong>±{snapshot.headingUncertainty.toFixed(1)}°</strong></span><span><i className="signal-icon"><SquareActivity size={14} /></i>NHC <strong className={snapshot.nhc.toLowerCase()}>{snapshot.nhc}</strong></span></div>
      <div className="instrument-divider" />
      <div className="instrument-section-title"><span>Integrity ledger</span><span className={`ledger-badge ${snapshot.gnssRejected ? 'coral' : 'mint'}`}>{snapshot.gnssRejected ? 'REJECTED' : 'CONSISTENT'}</span></div>
      <div className="ledger-row"><span><Satellite size={14} />GNSS input</span><strong>{snapshot.gnssRejected ? 'Rejected' : snapshot.gnssState === 'DENIED' ? 'Unavailable' : 'Accepted'}</strong></div>
      <div className="ledger-row"><span><BrainCircuit size={14} />Virtual odometer</span><strong>{features.learnedAid ? `±${snapshot.virtualSpeedSigma.toFixed(1)} m/s` : 'Disabled'}</strong></div>
      <div className="ledger-row"><span><Route size={14} />Road feedback</span><strong>{features.mapFeedback && snapshot.mapConfidence > 0.8 ? 'Applied' : 'Display only'}</strong></div>
      <div className="ledger-row"><span><Activity size={14} />Shadow disagreement</span><strong>{snapshot.shadowDisagreement.toFixed(1)} m</strong></div>
      <div className="instrument-divider" />
      <div className="quick-actions"><button onClick={() => setFeature('learnedAid', !features.learnedAid)} className={features.learnedAid ? 'active' : ''}><BrainCircuit size={14} />AI aid</button><button onClick={() => setFeature('mapFeedback', !features.mapFeedback)} className={features.mapFeedback ? 'active' : ''}><Route size={14} />Map feedback</button></div>
    </>}
    {!expert && <div className="basic-explain"><div className="basic-explain-icon"><ShieldCheck size={17} /></div><div><strong>Trust follows the journey</strong><p>Open Expert mode to inspect why each sensor is accepted, softened, or rejected.</p></div></div>}
    <div className="instrument-footer"><span><span className="status-dot mint" />{guided ? 'Guided view on' : 'Guided view off'}</span><div className="download-actions"><button onClick={() => onDownload('json')} title="Download JSON"><Download size={13} />JSON</button><button onClick={() => onDownload('csv')} title="Download CSV">CSV</button></div></div>
  </section>
}

function Stat({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return <div className="stat-block"><span>{label}</span><strong className={tone}>{value}</strong></div>
}

function SignalRow({ label, value, meter, tone }: { label: string; value: string; meter: number; tone: string }) {
  return <div className="signal-row"><div><span>{label}</span><strong>{value}</strong></div><div className="meter"><span className={tone} style={{ width: `${clamp(meter, 0, 1) * 100}%` }} /></div></div>
}

function EvidenceView({ scenario, current, samples, metrics, chartSamples, onDownload }: { scenario: ScenarioDefinition; current: NavigationSnapshot; samples: NavigationSnapshot[]; metrics: RunMetrics; chartSamples: NavigationSnapshot[]; onDownload: (format: 'json' | 'csv') => void }) {
  const chartData = chartSamples.map((sample) => ({ time: sample.time, hybrid: Number(distance(sample.hybrid, sample.reference).toFixed(2)), classical: Number(distance(sample.classical, sample.reference).toFixed(2)), bound: Number(sample.bound95.toFixed(2)) }))
  const latestError = distance(current.hybrid, current.reference)
  return <div className="evidence-view page-view"><div className="page-heading"><div><div className="panel-eyebrow"><span className="eyebrow-line" />EXPERIMENTAL EVIDENCE</div><h1>Evidence from the current run</h1><p>Metrics are calculated from the synthetic trajectory, not prefilled claims.</p></div><div className="export-buttons"><button onClick={() => onDownload('json')}><Download size={15} />Export JSON</button><button onClick={() => onDownload('csv')}>Export CSV</button></div></div>
    <div className="evidence-banner"><div className="evidence-banner-icon"><Database size={18} /></div><div><strong>Simulation results · {scenario.title}</strong><span>Use this view to explain the metric shape. Real IO-VNBD and own-phone evidence remain on the validation roadmap.</span></div><span className="synthetic-stamp">SYNTHETIC</span></div>
    <div className="evidence-metric-grid"><EvidenceMetric label="Hybrid final error" value={`${metrics.hybridError.toFixed(1)} m`} detail="At blackout end" tone="cyan" /><EvidenceMetric label="Classical final error" value={`${metrics.classicalError.toFixed(1)} m`} detail="At blackout end" tone="coral" /><EvidenceMetric label="Hybrid drift" value={`${metrics.hybridDrift.toFixed(2)}%`} detail="100 × error / distance" tone="mint" /><EvidenceMetric label="Blackout distance" value={`${metrics.blackoutDistance.toFixed(0)} m`} detail={`${formatTime(scenario.outageEnd - scenario.outageStart)} without GNSS`} tone="lavender" /><EvidenceMetric label="Reacquisition delay" value={`${metrics.reacquisitionDelay.toFixed(0)} s`} detail="Consistency gate" tone="amber" /><EvidenceMetric label="Bound coverage" value={`${metrics.boundCoverage.toFixed(0)}%`} detail="Observed 95% bound" tone={metrics.boundCoverage >= 90 ? 'mint' : 'amber'} /></div>
    <div className="evidence-chart-card"><div className="chart-card-head"><div><h2>Position error during blackout</h2><p>Raw error is evaluated against the hidden reference path.</p></div><div className="chart-legend"><span><i className="legend-line cyan" />AstraNav</span><span><i className="legend-line coral" />Classical</span><span><i className="legend-line bound" />95% bound</span></div></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 10, right: 14, bottom: 4, left: -18 }}><CartesianGrid stroke="#213645" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="time" type="number" domain={[0, scenario.duration]} tickFormatter={(value) => `${Math.round(value)}s`} tick={{ fill: '#8094a8', fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#8094a8', fontSize: 11 }} axisLine={false} tickLine={false} width={40} /><Tooltip contentStyle={{ background: '#101c28', border: '1px solid #2b4553', borderRadius: 10, color: '#eff6fc' }} labelFormatter={(value) => `${Number(value).toFixed(0)} s`} formatter={(value, name) => [`${value} m`, name === 'hybrid' ? 'AstraNav' : name === 'classical' ? 'Classical' : '95% bound']} /><ReferenceArea x1={scenario.outageStart} x2={scenario.outageEnd} fill="#ff7e79" fillOpacity={0.06} /><Line type="monotone" dataKey="bound" stroke="#b6a1f5" strokeDasharray="4 5" dot={false} strokeWidth={1.5} /><Line type="monotone" dataKey="classical" stroke="#ff7e79" dot={false} strokeWidth={2} /><Line type="monotone" dataKey="hybrid" stroke="#47d7f2" dot={false} strokeWidth={2.7} /></LineChart></ResponsiveContainer></div></div>
    <div className="evidence-bottom-grid"><div className="road-result-card"><div className="card-kicker"><Route size={14} />TRAJECTORY COMPARISON</div><div className="trajectory-row"><span><i className="legend-line coral" />Classical INS</span><strong>{metrics.classicalError.toFixed(1)} m</strong><small>{metrics.classicalDrift.toFixed(2)}% drift</small></div><div className="trajectory-row"><span><i className="legend-line cyan" />AstraNav hybrid</span><strong>{metrics.hybridError.toFixed(1)} m</strong><small>{metrics.hybridDrift.toFixed(2)}% drift</small></div><div className="trajectory-row"><span><i className="legend-line dashed" />Reference</span><strong>0.0 m</strong><small>Hidden from estimator</small></div><div className="metric-footnote">Raw and map-assisted trajectories stay separate so map geometry cannot hide a weak inertial estimate.</div></div><div className="roadmap-card"><div className="card-kicker"><ShieldCheck size={14} />VALIDATION ROADMAP</div><RoadmapItem label="IO-VNBD replay" status="Pending" /><RoadmapItem label="Trip-disjoint test split" status="Pending" /><RoadmapItem label="Own-phone drive" status="Pending" /><RoadmapItem label="Android latency + RAM" status="Pending" /><RoadmapItem label="External high-rate IMU" status="Compatible" /></div></div>
    <div className="formula-strip"><span>Drift (%)</span><code>100 × final blackout position error / reference distance travelled</code><span className="formula-note">Zero-distance runs report “Not applicable”</span></div>
  </div>
}

function EvidenceMetric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return <div className={`evidence-metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
}

function RoadmapItem({ label, status }: { label: string; status: string }) {
  return <div className="roadmap-item"><span className="roadmap-check">{status === 'Compatible' ? <Check size={12} /> : <span />}</span><span>{label}</span><small className={status === 'Compatible' ? 'compatible' : ''}>{status}</small></div>
}

function SystemView() {
  const [selected, setSelected] = useState('Sensors')
  const stages = [
    { name: 'Sensors', icon: <Smartphone size={18} />, color: 'cyan', description: 'Phone IMU and GNSS observations arrive with timestamps, quality flags, and a common packet shape.', prototype: 'Bundled synthetic observations drive the deterministic simulator.', production: 'Android SensorManager callbacks and optional external IMU packets.' },
    { name: 'Calibration + alignment', icon: <Compass size={18} />, color: 'mint', description: 'Bias, scale, and phone-to-vehicle frame errors are estimated before the filter trusts motion.', prototype: 'Alignment confidence changes under the mount-shift fault.', production: 'Device profiles, stationary initialization, and mount-integrity residuals.' },
    { name: 'Virtual measurements', icon: <BrainCircuit size={18} />, color: 'lavender', description: 'A temporal model supplies a vehicle-speed-like measurement, uncertainty, and context.', prototype: 'The learned aid is emulated with configurable noise and OOD behavior.', production: 'PyTorch training, ONNX/LiteRT export, and output-parity tests.' },
    { name: 'Physical fusion', icon: <SquareActivity size={18} />, color: 'amber', description: 'Strapdown propagation and error-state fusion keep the navigation state physically consistent.', prototype: 'The simulator exposes the same state ideas and integrity transitions.', production: 'Deterministic C++ navigation core with ES-EKF, NHC, ZUPT, and covariance reset.' },
    { name: 'Road hypotheses', icon: <Route size={18} />, color: 'cyan', description: 'Connected road candidates provide a probabilistic map sensor instead of nearest-road snapping.', prototype: 'Three bundled candidates update from distance, heading, and connectivity.', production: 'OSM-derived graph with HMM/Viterbi candidate tracking.' },
    { name: 'Navigation + trust', icon: <ShieldCheck size={18} />, color: 'mint', description: 'The app publishes position together with health, uncertainty, source trust, and recovery state.', prototype: 'Live instrument panel, event ledger, exports, and Evidence view.', production: 'Shared NavSolution contract for replay, Android, external IMU, and logging.' },
  ]
  const item = stages.find((stage) => stage.name === selected) ?? stages[0]
  return <div className="system-view page-view"><div className="page-heading"><div><div className="panel-eyebrow"><span className="eyebrow-line" />SYSTEM MAP</div><h1>From raw motion to trusted position</h1><p>Each layer solves a different class of failure. Select a stage to inspect the prototype boundary.</p></div><span className="architecture-chip"><Zap size={14} />Common engine contract</span></div><div className="architecture-flow">{stages.map((stage, index) => <button key={stage.name} className={`architecture-stage ${stage.color} ${selected === stage.name ? 'selected' : ''}`} onClick={() => setSelected(stage.name)}><span className="stage-icon">{stage.icon}</span><span className="stage-index">0{index + 1}</span><strong>{stage.name}</strong>{index < stages.length - 1 && <ArrowUpRight className="stage-arrow" size={17} />}</button>)}</div><div className="system-detail"><div className={`detail-icon ${item.color}`}>{item.icon}</div><div className="detail-copy"><div className="card-kicker">SELECTED LAYER · {item.name.toUpperCase()}</div><h2>{item.description}</h2><div className="detail-cols"><div><span>In this prototype</span><p>{item.prototype}</p></div><div><span>Production path</span><p>{item.production}</p></div></div></div></div><div className="glossary-grid"><GlossaryItem term="GNSS" definition="Satellite positioning sources such as GPS, Galileo, and NavIC." /><GlossaryItem term="IMU" definition="Accelerometer and gyroscope measurements sampled at high rate." /><GlossaryItem term="Virtual odometry" definition="A learned speed or velocity measurement that enters fusion with uncertainty." /><GlossaryItem term="NHC" definition="A soft vehicle constraint that lateral and vertical velocity stay near zero." /><GlossaryItem term="Covariance" definition="The estimator’s representation of how uncertain its current state is." /><GlossaryItem term="Reacquisition" definition="A guarded return to trusted GNSS after several consistent fixes." /></div></div>
}

function GlossaryItem({ term, definition }: { term: string; definition: string }) {
  return <div className="glossary-item"><strong>{term}</strong><p>{definition}</p></div>
}

export default App
