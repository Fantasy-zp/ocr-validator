/*
管理编辑器状态
包括选中元素、视图模式等
*/

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ViewMode } from '@/types'

export const useEditorStore = defineStore('editor', () => {
  // 状态
  const selectedLeft = ref<number | null>(null)
  const selectedRight = ref<number | null>(null)
  const leftViewMode = ref<ViewMode>('rendered')
  const rightViewMode = ref<ViewMode>('rendered')

  // 计算属性
  // 检查是否有选中元素
  const hasSelection = computed(() =>
    selectedLeft.value !== null && selectedRight.value !== null
  )

  // 获取选中元素对
  const selectionPair = computed(() =>
    hasSelection.value ? [selectedLeft.value, selectedRight.value] as [number, number] : null
  )

  // 选择左侧元素
  function selectLeftElement(index: number) {
    selectedLeft.value = selectedLeft.value === index ? null : index
  }

  // 选择右侧元素
  function selectRightElement(index: number) {
    selectedRight.value = selectedRight.value === index ? null : index
  }

  // 清除选择
  function clearSelection() {
    selectedLeft.value = null
    selectedRight.value = null
  }

  // 设置左侧视图模式
  function setLeftViewMode(mode: ViewMode) {
    leftViewMode.value = mode
  }

  // 设置右侧视图模式
  function setRightViewMode(mode: ViewMode) {
    rightViewMode.value = mode
  }

  // 切换左侧视图模式
  function toggleLeftViewMode() {
    leftViewMode.value = leftViewMode.value === 'raw' ? 'rendered' : 'raw'
  }

  // 切换右侧视图模式
  function toggleRightViewMode() {
    rightViewMode.value = rightViewMode.value === 'raw' ? 'rendered' : 'raw'
  }

  return {
    // 状态
    selectedLeft,
    selectedRight,
    leftViewMode,
    rightViewMode,

    // 计算属性
    hasSelection,
    selectionPair,

    // 方法
    selectLeftElement,
    selectRightElement,
    clearSelection,
    setLeftViewMode,
    setRightViewMode,
    toggleLeftViewMode,
    toggleRightViewMode
  }
})
