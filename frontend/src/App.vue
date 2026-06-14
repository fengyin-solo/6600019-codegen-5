<template>
  <div class="flex h-screen">
    <!-- Sidebar -->
    <div class="w-72 bg-gray-900 p-4 flex flex-col gap-3 border-r border-gray-800 overflow-y-auto">
      <h1 class="text-lg font-bold text-cyan-400">地震波形 P/S 波分析</h1>

      <!-- Upload Section -->
      <div class="space-y-2">
        <label class="block bg-cyan-500 text-black text-center py-2 rounded cursor-pointer hover:bg-cyan-400 text-sm font-medium">
          批量上传波形
          <input type="file" @change="onBatchUpload" class="hidden" multiple accept=".sac,.mseed,.miniseed" />
        </label>
        <button @click="store.generateMockEvents(5)" class="w-full bg-gray-800 py-2 rounded text-sm hover:bg-gray-700">
          加载批量模拟数据
        </button>
      </div>

      <!-- Current Event Info -->
      <div v-if="store.currentEvent" class="bg-gray-800 rounded-xl p-3">
        <h3 class="text-cyan-300 font-bold text-sm mb-2">当前事件</h3>
        <div class="text-sm">
          <div class="text-white font-medium">M{{ store.currentEvent.magnitude.toFixed(1) }} {{ store.currentEvent.location }}</div>
          <div class="text-gray-400 text-xs mt-1">深度 {{ store.currentEvent.depth }}km</div>
          <div class="text-gray-400 text-xs">{{ formatTime(store.currentEvent.originTime) }}</div>
          <div class="text-gray-500 text-xs mt-1 truncate">{{ store.currentEvent.filename }}</div>
        </div>
      </div>

      <!-- STA/LTA Parameters -->
      <div class="bg-gray-800 rounded-xl p-3 space-y-2">
        <h3 class="text-cyan-300 font-bold text-sm">STA/LTA 参数</h3>
        <div>
          <label class="text-gray-400 text-xs">STA 窗口: {{ store.staWindow.toFixed(1) }}s</label>
          <input type="range" v-model.number="store.staWindow" min="0.5" max="5" step="0.1" class="w-full" />
        </div>
        <div>
          <label class="text-gray-400 text-xs">LTA 窗口: {{ store.ltaWindow.toFixed(1) }}s</label>
          <input type="range" v-model.number="store.ltaWindow" min="5" max="30" step="0.5" class="w-full" />
        </div>
        <div>
          <label class="text-gray-400 text-xs">触发阈值: {{ store.threshold.toFixed(1) }}</label>
          <input type="range" v-model.number="store.threshold" min="1" max="10" step="0.5" class="w-full" />
        </div>
        <button @click="runPick" class="w-full bg-cyan-600 py-2 rounded text-sm hover:bg-cyan-500">
          运行自动拾取
        </button>
      </div>

      <!-- Picks -->
      <div class="bg-gray-800 rounded-xl p-3">
        <h3 class="text-cyan-300 font-bold text-sm mb-2">震相拾取结果</h3>
        <div v-for="p in store.picks" :key="p.id" class="flex justify-between bg-gray-700 rounded p-2 mb-1 text-sm">
          <span :class="p.type === 'P' ? 'text-red-400' : 'text-blue-400'">{{ p.type }} 波</span>
          <span>{{ p.time.toFixed(2) }}s</span>
          <span class="text-gray-400">{{ (p.confidence * 100).toFixed(0) }}%</span>
        </div>
        <div v-if="!store.picks.length" class="text-gray-600 text-xs">加载数据后运行拾取</div>
      </div>

      <!-- Stations -->
      <div class="bg-gray-800 rounded-xl p-3">
        <h3 class="text-cyan-300 font-bold text-sm mb-2">台站分布</h3>
        <div v-for="s in store.stations" :key="s.id"
          @click="store.selectedStation = s"
          class="bg-gray-700 rounded p-2 mb-1 text-sm cursor-pointer hover:bg-gray-600"
          :class="store.selectedStation?.id === s.id ? 'ring-1 ring-cyan-500' : ''">
          {{ s.name }} <span class="text-gray-400 text-xs">({{ s.latitude.toFixed(1) }}, {{ s.longitude.toFixed(1) }})</span>
        </div>
      </div>

      <!-- Event List -->
      <div class="bg-gray-800 rounded-xl p-3">
        <h3 class="text-cyan-300 font-bold text-sm mb-2">
          事件列表
          <span v-if="store.eventList.length" class="text-gray-400 font-normal">({{ store.eventList.length }})</span>
        </h3>
        <div v-for="e in store.eventList" :key="e.id"
          @click="onSelectEvent(e.id)"
          class="bg-gray-700 rounded p-2 mb-1 text-xs cursor-pointer hover:bg-gray-600"
          :class="store.currentEventId === e.id ? 'ring-1 ring-cyan-400 bg-gray-600' : ''">
          <div class="flex justify-between items-center">
            <span class="font-medium">M{{ e.magnitude.toFixed(1) }} {{ e.location }}</span>
            <span class="text-cyan-400 text-xs">{{ e.pickCount }}个拾取</span>
          </div>
          <div class="text-gray-400 mt-1">深度 {{ e.depth }}km | {{ formatTimeShort(e.originTime) }}</div>
          <div class="text-gray-500 truncate">{{ e.filename }}</div>
        </div>
        <div v-if="!store.eventList.length" class="text-gray-600 text-xs">批量上传后生成事件列表</div>
      </div>
    </div>

    <!-- Main: Waveform Charts -->
    <div class="flex-1 flex flex-col gap-2 p-4 overflow-y-auto">
      <div v-if="store.isLoading" class="flex-1 flex items-center justify-center text-gray-600">
        <div class="text-center">
          <div class="animate-pulse mb-2">正在处理数据...</div>
          <div class="text-xs text-gray-500">请稍候</div>
        </div>
      </div>
      <template v-else>
        <WaveformChart v-if="store.waveform" />
        <div v-else class="flex-1 flex items-center justify-center text-gray-600">
          请批量上传数据或加载模拟波形
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSeismicStore } from './store/seismic'
import WaveformChart from './components/WaveformChart.vue'

const store = useSeismicStore()

function onBatchUpload(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (files && files.length > 0) {
    store.batchUploadAndAnalyze(files)
  }
}

function onSelectEvent(eventId: string) {
  store.selectEvent(eventId)
}

function runPick() {
  store.runPickOnCurrentEvent()
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('zh-CN', { timeZone: 'UTC' })
  } catch {
    return iso.slice(0, 16)
  }
}

function formatTimeShort(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ')
}
</script>
