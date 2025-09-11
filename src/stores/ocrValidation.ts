/*
改进的OCR校验管理Store
统一管理OCR校验相关的状态和操作
*/

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  OCRSample,
  LayoutElement,
  EditAction,
  LoadResult,
  OCRStoreState,
  OCRViewMode,
  PageInfo
} from '@/types'
import { JSONLParser, DataUtils } from '@/utils/helpers'

export const useOCRValidationStore = defineStore('ocrValidation', () => {
  // ===== 状态管理 =====
  const samples = ref<OCRSample[]>([])
  const currentIndex = ref(0)
  const selectedElementIndex = ref<number | null>(null)
  const viewMode = ref<OCRViewMode>('rendered')

  // PDF相关状态
  const pdfFiles = ref<Map<string, File>>(new Map())
  const pdfDirectoryHandle = ref<FileSystemDirectoryHandle | null>(null)

  // 编辑历史状态
  const editHistory = ref<EditAction[]>([])
  const historyIndex = ref(-1)
  const maxHistorySize = ref(50) // 限制历史记录大小

  // 修改追踪
  const modifiedSamples = ref<Set<number>>(new Set())

  // ===== 计算属性 =====
  const currentSample = computed(() => samples.value[currentIndex.value] || null)
  const totalSamples = computed(() => samples.value.length)
  const hasData = computed(() => samples.value.length > 0)
  const isModified = computed(() => modifiedSamples.value.has(currentIndex.value))
  const modifiedCount = computed(() => modifiedSamples.value.size)

  // 当前元素列表（按order排序）
  const currentElements = computed(() => {
    if (!currentSample.value) return []
    return [...currentSample.value.layout_dets].sort((a, b) => a.order - b.order)
  })

  // 历史操作状态
  const canUndo = computed(() => historyIndex.value >= 0)
  const canRedo = computed(() => historyIndex.value < editHistory.value.length - 1)

  // 选中元素信息
  const selectedElement = computed(() => {
    if (selectedElementIndex.value === null || !currentSample.value) return null
    return currentElements.value[selectedElementIndex.value]
  })

  // PDF文件统计
  const pdfStats = computed(() => ({
    totalFiles: pdfFiles.value.size,
    loadedFiles: Array.from(pdfFiles.value.keys()),
    missingFiles: samples.value
      .map(s => s.pdf_name)
      .filter(name => !pdfFiles.value.has(name.replace('.pdf', '')))
  }))

  // ===== 核心操作方法 =====

  /**
   * 从JSONL文本加载OCR数据
   */
  function loadJSONL(text: string): LoadResult {
    const result = JSONLParser.parseOCRJSONL(text)

    if (result.success) {
      // 为每个样本保存原始数据
      samples.value = result.samples.map(sample => ({
        ...sample,
        original_layout_dets: DataUtils.deepClone(sample.layout_dets),
        original_page_info: DataUtils.deepClone(sample.page_info)
      }))
      currentIndex.value = 0
      selectedElementIndex.value = null
      modifiedSamples.value.clear()
      clearHistory()
    }

    return {
      success: result.success,
      count: result.count,
      errors: result.errors
    }
  }
  
  /**
   * 重置当前样本到原始状态
   */
  function resetCurrentSample() {
    if (!currentSample.value) return

    const originalLayoutDets = DataUtils.deepClone(currentSample.value.original_layout_dets || [])
    const originalPageInfo = DataUtils.deepClone(currentSample.value.original_page_info || { 
      language: 'zh', 
      fuzzy_scan: false, 
      watermark: false, 
      rotate: 'normal',
      is_table: false,
      is_diagram: false
    })

    // 记录编辑历史
    addToHistory({
      type: 'reorder',
      oldValue: DataUtils.deepClone(currentSample.value.layout_dets),
      newValue: originalLayoutDets,
      timestamp: Date.now()
    })

    // 更新页面信息的编辑历史
    addToHistory({
      type: 'modify',
      elementIndex: -1, // 特殊索引表示页面信息
      oldValue: DataUtils.deepClone(currentSample.value.page_info),
      newValue: originalPageInfo,
      timestamp: Date.now()
    })

    // 恢复原始数据
    currentSample.value.layout_dets = originalLayoutDets
    currentSample.value.page_info = originalPageInfo
    
    // 重新计算修改状态
    updateModificationStatus(currentIndex.value)
  }
  
  /**
   * 重新计算修改状态
   */
  function recalculateModifications() {
    modifiedSamples.value.clear()
    
    // 对每个样本检查是否被修改
    samples.value.forEach((sample, index) => {
      if (DataUtils.isOCRSampleModified(sample)) {
        modifiedSamples.value.add(index)
      }
    })
  }
  
  /**
   * 更新单个样本的修改状态
   */
  function updateModificationStatus(index: number) {
    const sample = samples.value[index]
    if (!sample) return
    
    if (DataUtils.isOCRSampleModified(sample)) {
      modifiedSamples.value.add(index)
    } else {
      modifiedSamples.value.delete(index)
    }
  }

  /**
   * 撤销操作
   */
  function undo() {
    if (!canUndo.value || !currentSample.value) return false

    const action = editHistory.value[historyIndex.value]
    historyIndex.value--

    try {
      executeHistoryAction(action, 'undo')
      // 更新修改状态
      updateModificationStatus(currentIndex.value)
      return true
    } catch (error) {
      console.error('撤销操作失败:', error)
      historyIndex.value++ // 恢复索引
      return false
    }
  }

  /**
   * 重做操作
   */
  function redo() {
    if (!canRedo.value || !currentSample.value) return false

    historyIndex.value++
    const action = editHistory.value[historyIndex.value]

    try {
      executeHistoryAction(action, 'redo')
      // 更新修改状态
      updateModificationStatus(currentIndex.value)
      return true
    } catch (error) {
      console.error('重做操作失败:', error)
      historyIndex.value-- // 恢复索引
      return false
    }
  }
  
  /**
   * 直接设置样本数据
   */
  function setSamples(newSamples: OCRSample[], index = 0) {
    // 为每个样本保存原始数据
    samples.value = newSamples.map(sample => ({
      ...sample,
      original_layout_dets: DataUtils.deepClone(sample.layout_dets),
      original_page_info: DataUtils.deepClone(sample.page_info)
    }))
    currentIndex.value = Math.min(index, newSamples.length - 1)
    selectedElementIndex.value = null
    // 重新计算所有样本的修改状态
    recalculateModifications()
  }

  // ===== PDF文件管理 =====

  /**
   * 选择PDF文件夹
   */
  async function selectPDFFolder(): Promise<number> {
    try {
      // @ts-expect-error 类型定义可能不完整
      const dirHandle = await window.showDirectoryPicker()
      pdfDirectoryHandle.value = dirHandle

      pdfFiles.value.clear()
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.pdf')) {
          const file = await entry.getFile()
          const nameWithoutExt = entry.name.replace('.pdf', '')
          pdfFiles.value.set(nameWithoutExt, file)
        }
      }

      return pdfFiles.value.size
    } catch (error) {
      console.error('PDF文件夹选择失败:', error)
      throw error
    }
  }

  /**
   * 批量上传PDF文件
   */
  function uploadPDFFiles(files: FileList): number {
    for (const file of files) {
      if (file.name.endsWith('.pdf')) {
        const nameWithoutExt = file.name.replace('.pdf', '')
        pdfFiles.value.set(nameWithoutExt, file)
      }
    }
    return pdfFiles.value.size
  }

  /**
   * 获取PDF文件
   */
  function getPDFFile(pdfName: string): File | undefined {
    const nameWithoutExt = pdfName.replace('.pdf', '')
    return pdfFiles.value.get(nameWithoutExt)
  }

  /**
   * 移除PDF文件
   */
  function removePDFFile(pdfName: string): boolean {
    const nameWithoutExt = pdfName.replace('.pdf', '')
    return pdfFiles.value.delete(nameWithoutExt)
  }

  // ===== 元素操作 =====

  /**
   * 更新元素
   */
  function updateElement(index: number, updates: Partial<LayoutElement>) {
    if (!currentSample.value || index < 0 || index >= currentSample.value.layout_dets.length) {
      return false
    }

    const oldElement = DataUtils.deepClone(currentSample.value.layout_dets[index])
    const newElement = { ...oldElement, ...updates }

    // 记录编辑历史
    addToHistory({
      type: 'modify',
      elementIndex: index,
      oldValue: oldElement,
      newValue: newElement,
      timestamp: Date.now()
    })

    // 更新元素
    currentSample.value.layout_dets[index] = newElement
    modifiedSamples.value.add(currentIndex.value)

    return true
  }

  /**
   * 添加元素
   */
  function addElement(element: LayoutElement) {
    if (!currentSample.value) return false

    // 计算新元素的order
    const maxOrder = Math.max(
      0,
      ...currentSample.value.layout_dets.map(e => e.order || 0)
    )
    const newElement = { ...element, order: maxOrder + 1 }

    // 记录编辑历史
    addToHistory({
      type: 'add',
      newValue: newElement,
      timestamp: Date.now()
    })

    // 添加元素
    currentSample.value.layout_dets.push(newElement)
    modifiedSamples.value.add(currentIndex.value)

    return true
  }

  /**
   * 删除元素
   */
  function deleteElement(index: number) {
    if (!currentSample.value || index < 0 || index >= currentElements.value.length) {
      return false
    }

    // 获取排序后索引对应的原始元素
    const elementToDelete = currentElements.value[index]
    // 找到该元素在原始数组中的位置
    const originalIndex = currentSample.value.layout_dets.findIndex(el => 
      el === elementToDelete || (el.order === elementToDelete.order && el.text === elementToDelete.text)
    )

    if (originalIndex === -1) {
      return false
    }

    const oldElement = currentSample.value.layout_dets[originalIndex]

    // 记录编辑历史
    addToHistory({
      type: 'delete',
      elementIndex: originalIndex,
      oldValue: oldElement,
      timestamp: Date.now()
    })

    // 删除元素
    currentSample.value.layout_dets.splice(originalIndex, 1)
    modifiedSamples.value.add(currentIndex.value)

    // 更新选中状态
    if (selectedElementIndex.value === index) {
      selectedElementIndex.value = null
    } else if (selectedElementIndex.value !== null && selectedElementIndex.value > index) {
      selectedElementIndex.value--
    }

    return true
  }

  /**
   * 重新排序元素
   */
  function reorderElements(newOrder?: number[]) {
    if (!currentSample.value) return false

    const elements = currentSample.value.layout_dets
    const oldElements = DataUtils.deepClone(elements)

    if (newOrder && newOrder.length === elements.length) {
      // 按指定顺序重排
      const reorderedElements = newOrder.map(index => elements[index])
      reorderedElements.forEach((elem, i) => {
        elem.order = i
      })
      currentSample.value.layout_dets = reorderedElements
    } else {
      // 按order属性排序
      elements.sort((a, b) => a.order - b.order)
      elements.forEach((elem, i) => {
        elem.order = i
      })
    }

    // 记录编辑历史
    addToHistory({
      type: 'reorder',
      oldValue: oldElements,
      newValue: DataUtils.deepClone(currentSample.value.layout_dets),
      timestamp: Date.now()
    })

    modifiedSamples.value.add(currentIndex.value)
    return true
  }

  // ===== 历史操作 =====

  /**
   * 添加到历史记录
   */
  function addToHistory(action: EditAction) {
    // 如果不在历史记录的最后，删除后面的历史
    if (historyIndex.value < editHistory.value.length - 1) {
      editHistory.value.splice(historyIndex.value + 1)
    }

    // 添加新动作
    editHistory.value.push(action)
    historyIndex.value = editHistory.value.length - 1

    // 限制历史记录大小
    if (editHistory.value.length > maxHistorySize.value) {
      editHistory.value.shift()
      historyIndex.value--
    }
  }

  /**
   * 执行历史动作
   */
  function executeHistoryAction(action: EditAction, direction: 'undo' | 'redo') {
    if (!currentSample.value) return

    switch (action.type) {
      case 'modify':
        if (action.elementIndex !== undefined && action.elementIndex >= 0) {
          // 处理元素修改
          const targetElement = direction === 'undo' ? action.oldValue : action.newValue
          if (targetElement && !Array.isArray(targetElement) && 'category_type' in targetElement) {
            currentSample.value.layout_dets[action.elementIndex] = targetElement
          }
        } else if (action.elementIndex === -1) {
          // 处理页面信息修改
          const targetPageInfo = direction === 'undo' ? action.oldValue : action.newValue
          if (targetPageInfo && !Array.isArray(targetPageInfo) && 'language' in targetPageInfo) {
            currentSample.value.page_info = targetPageInfo
          }
        }
        break

      case 'add':
        if (direction === 'undo') {
          // 撤销添加 = 删除元素
          if (action.newValue && !Array.isArray(action.newValue) && 'category_type' in action.newValue) {
            const layoutElement = action.newValue
            const index = currentSample.value.layout_dets.findIndex(
              elem => elem.order === layoutElement.order && elem.text === layoutElement.text
            )
            if (index !== -1) {
              currentSample.value.layout_dets.splice(index, 1)
            }
          }
        } else {
          // 重做添加 = 重新添加元素
          if (action.newValue && !Array.isArray(action.newValue) && 'category_type' in action.newValue) {
            currentSample.value.layout_dets.push(action.newValue)
          }
        }
        break

      case 'delete':
        if (action.elementIndex !== undefined && action.oldValue && !Array.isArray(action.oldValue) && 'category_type' in action.oldValue) {
          if (direction === 'undo') {
            // 撤销删除 = 重新插入元素
            currentSample.value.layout_dets.splice(action.elementIndex, 0, action.oldValue)
          } else {
            // 重做删除 = 再次删除元素
            currentSample.value.layout_dets.splice(action.elementIndex, 1)
          }
        }
        break

      case 'reorder':
        if (direction === 'undo' && action.oldValue && Array.isArray(action.oldValue)) {
          // 撤销重排 = 恢复旧顺序
          currentSample.value.layout_dets = action.oldValue
        } else if (direction === 'redo' && action.newValue && Array.isArray(action.newValue)) {
          // 重做重排 = 应用新顺序
          currentSample.value.layout_dets = action.newValue
        }
        break
    }
  }

  /**
   * 清除历史记录
   */
  function clearHistory() {
    editHistory.value = []
    historyIndex.value = -1
  }

  // ===== 导航操作 =====

  /**
   * 导航到指定样本
   */
  function navigateTo(index: number) {
    if (index >= 0 && index < samples.value.length) {
      currentIndex.value = index
      selectedElementIndex.value = null
    }
  }

  function nextSample() {
    if (currentIndex.value < samples.value.length - 1) {
      navigateTo(currentIndex.value + 1)
    }
  }

  function prevSample() {
    if (currentIndex.value > 0) {
      navigateTo(currentIndex.value - 1)
    }
  }

  // ===== 选择操作 =====

  /**
   * 选择元素
   */
  function selectElement(index: number | null) {
    selectedElementIndex.value = index
  }

  /**
   * 设置视图模式
   */
  function setViewMode(mode: OCRViewMode) {
    viewMode.value = mode
  }

  // ===== 数据操作 =====

  /**
   * 更新页面信息
   */
  function updatePageInfo(updates: Partial<PageInfo>) {
    if (!currentSample.value) return false

    const oldPageInfo = DataUtils.deepClone(currentSample.value.page_info)
    const newPageInfo = { ...oldPageInfo, ...updates }

    // 记录编辑历史
    addToHistory({
      type: 'modify',
      elementIndex: -1, // 特殊索引表示页面信息
      oldValue: oldPageInfo,
      newValue: newPageInfo,
      timestamp: Date.now()
    })

    // 更新页面信息
    currentSample.value.page_info = newPageInfo
    modifiedSamples.value.add(currentIndex.value)

    return true
  }

  /**
   * 导出数据
   */
  function exportData(): string {
    return JSONLParser.exportOCRToJSONL(samples.value)
  }

  /**
   * 重新计算修改状态
   */
  function recalculateModifications() {
    // OCR样本的修改状态基于编辑历史
    // 这里可以根据具体需求实现
    modifiedSamples.value.clear()
    // 简单实现：如果有编辑历史就认为已修改
    if (editHistory.value.length > 0) {
      modifiedSamples.value.add(currentIndex.value)
    }
  }

  /**
   * 获取存储状态快照
   */
  function getStateSnapshot(): OCRStoreState {
    return {
      samples: DataUtils.deepClone(samples.value),
      currentIndex: currentIndex.value,
      selectedElementIndex: selectedElementIndex.value,
      viewMode: viewMode.value,
      pdfFiles: new Map(pdfFiles.value),
      editHistory: DataUtils.deepClone(editHistory.value),
      historyIndex: historyIndex.value,
      modifiedSamples: new Set(modifiedSamples.value)
    }
  }

  /**
   * 从快照恢复状态
   */
  function restoreFromSnapshot(snapshot: OCRStoreState) {
    samples.value = snapshot.samples
    currentIndex.value = snapshot.currentIndex
    selectedElementIndex.value = snapshot.selectedElementIndex
    viewMode.value = snapshot.viewMode
    pdfFiles.value = snapshot.pdfFiles
    editHistory.value = snapshot.editHistory
    historyIndex.value = snapshot.historyIndex
    modifiedSamples.value = snapshot.modifiedSamples
  }

  // ===== 导出接口 =====
  return {
    // 状态
    samples,
    currentIndex,
    selectedElementIndex,
    viewMode,
    pdfFiles,
    pdfDirectoryHandle,
    editHistory,
    historyIndex,
    modifiedSamples,

    // 计算属性
    currentSample,
    totalSamples,
    hasData,
    isModified,
    modifiedCount,
    currentElements,
    canUndo,
    canRedo,
    selectedElement,
    pdfStats,

    // 核心操作
    loadJSONL,
    setSamples,
    updatePageInfo,
    resetCurrentSample,

    // PDF管理
    selectPDFFolder,
    uploadPDFFiles,
    getPDFFile,
    removePDFFile,

    // 元素操作
    updateElement,
    addElement,
    deleteElement,
    reorderElements,

    // 历史操作
    undo,
    redo,
    clearHistory,

    // 导航操作
    navigateTo,
    nextSample,
    prevSample,

    // 选择操作
    selectElement,
    setViewMode,

    // 数据操作
    exportData,
    recalculateModifications,
    getStateSnapshot,
    restoreFromSnapshot
  }
})
