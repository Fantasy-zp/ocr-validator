/*
改进的数据集管理Store
统一管理合并校验相关的状态和操作
*/

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Sample, LoadResult, DatasetStoreState } from '@/types'
import { JSONLParser, DataUtils } from '@/utils/helpers'

export const useDatasetStore = defineStore('dataset', () => {
  // ===== 状态管理 =====
  const samples = ref<Sample[]>([])
  const currentIndex = ref(0)
  const modifiedIndices = ref(new Set<number>())

  // ===== 计算属性 =====
  const currentSample = computed(() => samples.value[currentIndex.value] || null)
  const totalSamples = computed(() => samples.value.length)
  const hasData = computed(() => samples.value.length > 0)
  const isModified = computed(() => modifiedIndices.value.has(currentIndex.value))
  const modifiedCount = computed(() => modifiedIndices.value.size)

  // 获取当前样本的语言标识
  const currentLanguage = computed(() => currentSample.value?.language || '')

  // 获取修改状态统计
  const modificationStats = computed(() => {
    const total = samples.value.length
    const modified = modifiedIndices.value.size
    const unmodified = total - modified

    return {
      total,
      modified,
      unmodified,
      modificationRate: total > 0 ? (modified / total * 100).toFixed(1) : '0'
    }
  })

  // ===== 核心操作方法 =====

  /**
   * 从JSONL文本加载数据
   */
  function loadJSONL(text: string): LoadResult {
    const result = JSONLParser.parseMergeJSONL(text)

    if (result.success) {
      samples.value = result.samples
      currentIndex.value = 0
      modifiedIndices.value.clear()
    }

    return {
      success: result.success,
      count: result.count,
      errors: result.errors
    }
  }

  /**
   * 直接设置样本数据（用于文件管理器）
   */
  function setSamples(newSamples: Sample[], index = 0) {
    samples.value = newSamples
    currentIndex.value = Math.min(index, newSamples.length - 1)
    // 重新计算修改状态
    recalculateModifications()
  }

  /**
   * 更新当前样本的合并对
   */
  function updateMergingPairs(pairs: number[][]) {
    if (!currentSample.value) return

    const oldPairs = [...currentSample.value.merging_idx_pairs]
    currentSample.value.merging_idx_pairs = pairs

    // 检查是否真的发生了修改
    const isReallyModified = !DataUtils.arraysEqual(
      JSON.stringify(pairs.sort()),
      JSON.stringify(currentSample.value.original_pairs?.sort() || [])
    )

    if (isReallyModified) {
      modifiedIndices.value.add(currentIndex.value)
    } else {
      modifiedIndices.value.delete(currentIndex.value)
    }

    // 发送修改事件（可用于自动保存等功能）
    emitModificationEvent(currentIndex.value, oldPairs, pairs)
  }

  /**
   * 批量更新多个样本的合并对
   */
  function batchUpdateMergingPairs(updates: Array<{ index: number; pairs: number[][] }>) {
    updates.forEach(({ index, pairs }) => {
      if (samples.value[index]) {
        samples.value[index].merging_idx_pairs = pairs

        const isModified = !DataUtils.arraysEqual(
          JSON.stringify(pairs.sort()),
          JSON.stringify(samples.value[index].original_pairs?.sort() || [])
        )

        if (isModified) {
          modifiedIndices.value.add(index)
        } else {
          modifiedIndices.value.delete(index)
        }
      }
    })
  }

  // ===== 导航操作 =====

  /**
   * 导航到指定索引
   */
  function navigateTo(index: number) {
    if (index >= 0 && index < samples.value.length) {
      currentIndex.value = index
    }
  }

  /**
   * 下一个样本
   */
  function nextSample() {
    if (currentIndex.value < samples.value.length - 1) {
      currentIndex.value++
    }
  }

  /**
   * 上一个样本
   */
  function prevSample() {
    if (currentIndex.value > 0) {
      currentIndex.value--
    }
  }

  /**
   * 跳转到第一个修改的样本
   */
  function goToFirstModified() {
    const firstModified = Math.min(...Array.from(modifiedIndices.value))
    if (firstModified !== Infinity) {
      navigateTo(firstModified)
    }
  }

  /**
   * 跳转到下一个修改的样本
   */
  function goToNextModified() {
    const current = currentIndex.value
    const modifiedArray = Array.from(modifiedIndices.value).sort((a, b) => a - b)
    const nextModified = modifiedArray.find(idx => idx > current)

    if (nextModified !== undefined) {
      navigateTo(nextModified)
    } else if (modifiedArray.length > 0) {
      // 如果没有后续修改，跳转到第一个修改
      navigateTo(modifiedArray[0])
    }
  }

  // ===== 数据操作 =====

  /**
   * 导出数据为JSONL格式
   */
  function exportData(): string {
    return JSONLParser.exportMergeToJSONL(samples.value)
  }

  /**
   * 重置所有修改标记
   */
  function resetModificationStatus() {
    modifiedIndices.value.clear()
  }

  /**
   * 重置当前样本到原始状态
   */
  function resetCurrentSample() {
    if (!currentSample.value) return

    const originalPairs = currentSample.value.original_pairs || []
    currentSample.value.merging_idx_pairs = DataUtils.deepClone(originalPairs)
    modifiedIndices.value.delete(currentIndex.value)
  }

  /**
   * 重置所有样本到原始状态
   */
  function resetAllSamples() {
    samples.value.forEach((sample, index) => {
      if (sample.original_pairs) {
        sample.merging_idx_pairs = DataUtils.deepClone(sample.original_pairs)
      }
    })
    modifiedIndices.value.clear()
  }

  // ===== 查询方法 =====

  /**
   * 检查指定元素是否已连接
   */
  function isConnected(side: 'left' | 'right', index: number): boolean {
    if (!currentSample.value) return false

    return currentSample.value.merging_idx_pairs.some(pair => {
      if (side === 'left') return pair[0] === index
      return pair[1] === index
    })
  }

  /**
   * 获取指定元素的连接对象
   */
  function getConnectedElement(side: 'left' | 'right', index: number): number | null {
    if (!currentSample.value) return null

    const pair = currentSample.value.merging_idx_pairs.find(p => {
      if (side === 'left') return p[0] === index
      return p[1] === index
    })

    if (!pair) return null
    return side === 'left' ? pair[1] : pair[0]
  }

  /**
   * 获取样本的修改摘要
   */
  function getSampleModificationSummary(index: number) {
    const sample = samples.value[index]
    if (!sample) return null

    const isCurrentlyModified = modifiedIndices.value.has(index)
    const originalCount = sample.original_pairs?.length || 0
    const currentCount = sample.merging_idx_pairs.length
    const difference = currentCount - originalCount

    return {
      isModified: isCurrentlyModified,
      originalCount,
      currentCount,
      difference,
      changeType: difference > 0 ? 'added' : difference < 0 ? 'removed' : 'modified'
    }
  }

  // ===== 工具方法 =====

  /**
   * 重新计算所有修改状态
   */
  function recalculateModifications() {
    modifiedIndices.value.clear()
    samples.value.forEach((sample, index) => {
      if (DataUtils.isSampleModified(sample)) {
        modifiedIndices.value.add(index)
      }
    })
  }

  /**
   * 发送修改事件
   */
  function emitModificationEvent(
    index: number,
    oldPairs: number[][],
    newPairs: number[][]
  ) {
    // 这里可以添加事件总线或其他通知机制
    console.debug('Sample modified:', { index, oldPairs, newPairs })
  }

  /**
   * 获取存储状态快照
   */
  function getStateSnapshot(): DatasetStoreState {
    return {
      samples: DataUtils.deepClone(samples.value),
      currentIndex: currentIndex.value,
      modifiedIndices: new Set(modifiedIndices.value)
    }
  }

  /**
   * 从快照恢复状态
   */
  function restoreFromSnapshot(snapshot: DatasetStoreState) {
    samples.value = snapshot.samples
    currentIndex.value = snapshot.currentIndex
    modifiedIndices.value = snapshot.modifiedIndices
  }

  // ===== 导出接口 =====
  return {
    // 状态
    samples,
    currentIndex,
    modifiedIndices,

    // 计算属性
    currentSample,
    totalSamples,
    hasData,
    isModified,
    modifiedCount,
    currentLanguage,
    modificationStats,

    // 核心操作
    loadJSONL,
    setSamples,
    updateMergingPairs,
    batchUpdateMergingPairs,

    // 导航操作
    navigateTo,
    nextSample,
    prevSample,
    goToFirstModified,
    goToNextModified,

    // 数据操作
    exportData,
    resetModificationStatus,
    resetCurrentSample,
    resetAllSamples,

    // 查询方法
    isConnected,
    getConnectedElement,
    getSampleModificationSummary,

    // 工具方法
    recalculateModifications,
    getStateSnapshot,
    restoreFromSnapshot
  }
})
