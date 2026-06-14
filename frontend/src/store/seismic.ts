import { ref, reactive, computed } from 'vue'
import { defineStore } from 'pinia'
import type { WaveformData, PhasePick, Station, SeismicEvent, EventSummary, EventDetail } from '../types'

export const useSeismicStore = defineStore('seismic', () => {
  const waveform = ref<WaveformData | null>(null)
  const picks = ref<PhasePick[]>([])
  const selectedStation = ref<Station | null>(null)
  const staWindow = ref(1.0)
  const ltaWindow = ref(10.0)
  const threshold = ref(3.5)
  const isLoading = ref(false)
  const events = ref<SeismicEvent[]>([
    { id: '1', magnitude: 4.2, depth: 12.5, originTime: '2025-01-15T08:23:41Z', location: '四川雅安' },
    { id: '2', magnitude: 3.8, depth: 8.3, originTime: '2025-01-14T14:12:05Z', location: '云南大理' },
    { id: '3', magnitude: 5.1, depth: 25.0, originTime: '2025-01-13T02:45:33Z', location: '台湾花莲' },
  ])

  const eventList = ref<EventSummary[]>([])
  const currentEventId = ref<string | null>(null)
  const eventDetails = reactive<Record<string, EventDetail>>({})

  const stations = ref<Station[]>([
    { id: 'STA01', name: 'BJI', latitude: 39.9, longitude: 116.4, elevation: 45 },
    { id: 'STA02', name: 'SSE', latitude: 31.2, longitude: 121.5, elevation: 10 },
    { id: 'STA03', name: 'KMI', latitude: 25.0, longitude: 102.7, elevation: 1890 },
    { id: 'STA04', name: 'HIA', latitude: 49.3, longitude: 119.7, elevation: 610 },
  ])

  const currentEvent = computed<EventDetail | null>(() => {
    if (!currentEventId.value) return null
    return eventDetails[currentEventId.value] || null
  })

  function generateMockWaveform(seed: number = 42): WaveformData {
    const sr = 100
    const duration = 60
    const n = sr * duration
    const time = Array.from({ length: n }, (_, i) => i / sr)
    const bhz: number[] = [], bhn: number[] = [], bhe: number[] = []

    let seedVal = seed
    function random() {
      seedVal = (seedVal * 9301 + 49297) % 233280
      return seedVal / 233280
    }

    const pShift = 5 + random() * 10
    const sShift = pShift + 10 + random() * 5
    const pAmp = 0.8 * (0.6 + random() * 0.6)
    const sAmp = 1.5 * (0.7 + random() * 0.6)

    for (let i = 0; i < n; i++) {
      const t = time[i]
      let vz = (random() - 0.5) * 0.02
      let ns = (random() - 0.5) * 0.02
      let ew = (random() - 0.5) * 0.02

      if (t > pShift && t < pShift + 8) {
        const amp = pAmp * Math.exp(-(t - pShift - 2) * (t - pShift - 2) / 8)
        vz += amp * Math.sin(2 * Math.PI * 8 * t)
        ns += amp * 0.3 * Math.sin(2 * Math.PI * 8 * t + 0.5)
        ew += amp * 0.3 * Math.sin(2 * Math.PI * 8 * t + 1.0)
      }

      if (t > sShift && t < sShift + 18) {
        const amp = sAmp * Math.exp(-(t - sShift - 6) * (t - sShift - 6) / 30)
        vz += amp * 0.4 * Math.sin(2 * Math.PI * 4 * t)
        ns += amp * Math.sin(2 * Math.PI * 4 * t + 0.3)
        ew += amp * Math.sin(2 * Math.PI * 4 * t + 0.8)
      }

      if (t > sShift + 13 && t < sShift + 33) {
        const amp = 2.0 * Math.exp(-(t - sShift - 20) * (t - sShift - 20) / 50)
        vz += amp * Math.sin(2 * Math.PI * 1.5 * t)
        ns += amp * Math.sin(2 * Math.PI * 1.5 * t + 0.4)
        ew += amp * Math.sin(2 * Math.PI * 1.5 * t + 0.9)
      }

      bhz.push(vz)
      bhn.push(ns)
      bhe.push(ew)
    }

    return { time, bhz, bhn, bhe, samplingRate: sr }
  }

  function loadMockData() {
    waveform.value = generateMockWaveform(42)
    picks.value = [
      { id: 'p1', type: 'P', time: 10.2, confidence: 0.92, method: 'STA/LTA' },
      { id: 'p2', type: 'S', time: 22.5, confidence: 0.88, method: 'STA/LTA' },
    ]
  }

  function staLtaPicking(): PhasePick[] {
    if (!waveform.value) return []
    const data = waveform.value.bhz
    const sr = waveform.value.samplingRate
    const staLen = Math.floor(staWindow.value * sr)
    const ltaLen = Math.floor(ltaWindow.value * sr)
    const newPicks: PhasePick[] = []

    let lta = 0
    for (let i = ltaLen; i < data.length - staLen; i++) {
      let sta = 0
      for (let j = 0; j < staLen; j++) sta += data[i + j] * data[i + j]
      sta /= staLen

      lta = 0
      for (let j = 0; j < ltaLen; j++) lta += data[i - j] * data[i - j]
      lta /= ltaLen

      const ratio = lta > 0 ? sta / lta : 0
      if (ratio > threshold.value) {
        const t = waveform.value.time[i]
        const existsNear = newPicks.some(p => Math.abs(p.time - t) < 2)
        if (!existsNear) {
          newPicks.push({
            id: `pick_${Date.now()}_${i}`,
            type: newPicks.length === 0 ? 'P' : 'S',
            time: t,
            confidence: Math.min(1, ratio / 10),
            method: 'STA/LTA'
          })
        }
      }
    }
    return newPicks
  }

  function applyEventDetail(detail: EventDetail) {
    currentEventId.value = detail.id
    waveform.value = {
      time: [...detail.waveform.time],
      bhz: [...detail.waveform.bhz],
      bhn: [...detail.waveform.bhn],
      bhe: [...detail.waveform.bhe],
      samplingRate: detail.waveform.samplingRate,
    }
    picks.value = detail.picks.map(p => ({ ...p }))
  }

  async function uploadAndAnalyze(file: File) {
    isLoading.value = true
    try {
      const formData = new FormData()
      formData.append('file', file)
      const resp = await fetch('/api/waveform/upload', { method: 'POST', body: formData })
      if (resp.ok) {
        const data = await resp.json()
        waveform.value = data.waveform
        picks.value = data.picks || []
      }
    } catch {
      loadMockData()
    } finally {
      isLoading.value = false
    }
  }

  async function batchUploadAndAnalyze(files: FileList | File[]) {
    isLoading.value = true
    try {
      const formData = new FormData()
      Array.from(files).forEach(file => {
        formData.append('files', file)
      })
      const resp = await fetch('/api/waveform/batch-upload', { method: 'POST', body: formData })
      if (resp.ok) {
        const data = await resp.json()
        eventList.value = data.events || []
        Object.keys(eventDetails).forEach(k => { delete eventDetails[k] })
        if (eventList.value.length > 0) {
          await selectEvent(eventList.value[0].id)
        }
      }
    } catch {
      generateMockEvents(5)
    } finally {
      isLoading.value = false
    }
  }

  async function selectEvent(eventId: string) {
    if (eventDetails[eventId]) {
      applyEventDetail(eventDetails[eventId])
      return
    }
    isLoading.value = true
    try {
      const resp = await fetch(`/api/waveform/event/${eventId}`)
      if (resp.ok) {
        const data = await resp.json()
        const detail: EventDetail = {
          id: data.id,
          magnitude: data.magnitude,
          depth: data.depth,
          originTime: data.originTime,
          location: data.location,
          waveform: data.waveform,
          picks: data.picks || [],
          filename: data.filename || '',
        }
        eventDetails[eventId] = detail
        applyEventDetail(detail)
      }
    } catch (err) {
      console.error('Failed to load event:', err)
    } finally {
      isLoading.value = false
    }
  }

  function generateMockEvents(count: number = 5) {
    const locations = ['四川雅安', '云南大理', '台湾花莲', '新疆和田', '青海玉树', '甘肃定西']
    const newEvents: EventSummary[] = []

    Object.keys(eventDetails).forEach(k => { delete eventDetails[k] })

    for (let i = 0; i < count; i++) {
      const id = `evt_mock_${i}_${Date.now()}_${Math.floor(Math.random() * 1000)}`
      const seed = i * 100 + 7
      const wf = generateMockWaveform(seed)
      const pPickTime = 5 + (Math.sin(seed * 0.1) + 1) * 5
      const sPickTime = pPickTime + 10 + (Math.cos(seed * 0.15) + 1) * 2.5
      const eventPicks: PhasePick[] = [
        { id: `${id}_p`, type: 'P', time: Math.round(pPickTime * 100) / 100, confidence: 0.85 + Math.random() * 0.1, method: 'STA/LTA' },
        { id: `${id}_s`, type: 'S', time: Math.round(sPickTime * 100) / 100, confidence: 0.8 + Math.random() * 0.1, method: 'STA/LTA' },
      ]
      const magnitude = Math.round((3 + Math.random() * 3) * 10) / 10
      const depth = Math.round((5 + Math.random() * 30) * 10) / 10
      const now = new Date()
      const originTime = new Date(now.getTime() - Math.random() * 72 * 3600 * 1000).toISOString()
      const location = locations[i % locations.length]
      const filename = `mock_${i}.sac`

      const detail: EventDetail = {
        id,
        magnitude,
        depth,
        originTime,
        location,
        waveform: wf,
        picks: eventPicks,
        filename,
      }
      eventDetails[id] = detail
      newEvents.push({
        id,
        magnitude,
        depth,
        originTime,
        location,
        filename,
        pickCount: eventPicks.length,
      })
    }

    eventList.value = newEvents
    if (newEvents.length > 0) {
      applyEventDetail(eventDetails[newEvents[0].id])
    }
  }

  function runPickOnCurrentEvent() {
    if (!waveform.value) return
    const newPicks = staLtaPicking()
    picks.value = newPicks
    if (currentEventId.value && eventDetails[currentEventId.value]) {
      eventDetails[currentEventId.value].picks = newPicks.map(p => ({ ...p }))
      const ev = eventList.value.find(e => e.id === currentEventId.value)
      if (ev) ev.pickCount = newPicks.length
    }
  }

  return {
    waveform, picks, selectedStation, staWindow, ltaWindow, threshold,
    isLoading, events, stations, eventList, currentEventId, currentEvent,
    loadMockData, staLtaPicking, uploadAndAnalyze, batchUploadAndAnalyze,
    generateMockWaveform, selectEvent, generateMockEvents, runPickOnCurrentEvent
  }
})
