/*
管理数据集和导航
*/

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Sample } from '@/types'
import { parseJSONL, exportToJSONL } from '@/utils/markdown'

export const useDatasetStore = defineStore('dataset', () => {
  // 状态
  const samples = ref<Sample[]>([])
  const currentIndex = ref(0)
  const modifiedIndices = ref(new Set<number>())

  // 计算属性
  const currentSample = computed(() => samples.value[currentIndex.value] || null)
  const totalSamples = computed(() => samples.value.length)
  const hasData = computed(() => samples.value.length > 0)
  const isModified = computed(() => modifiedIndices.value.has(currentIndex.value))
  const modifiedCount = computed(() => modifiedIndices.value.size)

  // 方法
  function loadJSONL(text: string): { success: boolean; count: number; errors: Array<{line: number; error: unknown}> } {
    const { samples: parsedSamples, errors } = parseJSONL(text)

    if (parsedSamples.length === 0) {
      return { success: false, count: 0, errors }
    }

    samples.value = parsedSamples
    currentIndex.value = 0
    modifiedIndices.value.clear()

    return { success: true, count: parsedSamples.length, errors }
  }

  function updateMergingPairs(pairs: number[][]) {
    if (!currentSample.value) return

    currentSample.value.merging_idx_pairs = pairs
    modifiedIndices.value.add(currentIndex.value)
  }

  function navigateTo(index: number) {
    if (index >= 0 && index < samples.value.length) {
      currentIndex.value = index
    }
  }

  function nextSample() {
    if (currentIndex.value < samples.value.length - 1) {
      currentIndex.value++
    }
  }

  function prevSample() {
    if (currentIndex.value > 0) {
      currentIndex.value--
    }
  }

  function exportData(): string {
    return exportToJSONL(samples.value)
  }

  function resetModificationStatus() {
    modifiedIndices.value.clear()
  }

  function resetCurrentSample() {
    if (!currentSample.value) return

    // 重置当前样本的合并对到原始状态
    currentSample.value.merging_idx_pairs = JSON.parse(JSON.stringify(currentSample.value.original_pairs || []))

    // 移除当前索引的修改标记
    modifiedIndices.value.delete(currentIndex.value)
  }

  function isConnected(side: 'left' | 'right', index: number): boolean {
    if (!currentSample.value) return false

    return currentSample.value.merging_idx_pairs.some(pair => {
      if (side === 'left') return pair[0] === index
      return pair[1] === index
    })
  }

  return {
    // 状态
    samples,
    currentIndex,
    currentSample,
    totalSamples,
    hasData,
    isModified,
    modifiedCount,

    // 方法
    loadJSONL,
    updateMergingPairs,
    navigateTo,
    nextSample,
    prevSample,
    exportData,
    resetModificationStatus,
    resetCurrentSample,
    isConnected
  }
})
