export interface WaveformData {
  time: number[]
  bhz: number[]
  bhn: number[]
  bhe: number[]
  samplingRate: number
}

export interface PhasePick {
  id: string
  type: 'P' | 'S'
  time: number
  confidence: number
  method: string
}

export interface Station {
  id: string
  name: string
  latitude: number
  longitude: number
  elevation: number
}

export interface SeismicEvent {
  id: string
  magnitude: number
  depth: number
  originTime: string
  location: string
}

export interface EventSummary {
  id: string
  magnitude: number
  depth: number
  originTime: string
  location: string
  filename: string
  pickCount: number
}

export interface EventDetail extends SeismicEvent {
  waveform: WaveformData
  picks: PhasePick[]
  filename: string
}
