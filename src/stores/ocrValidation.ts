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
  // PDF文件缓存，用于优化性能
  const pdfFileCache = ref<Map<string, { file: File, lastAccessed: number }>>(new Map())
  const maxCacheSize = ref(50) // 限制缓存大小，可根据需要调整

  // 当前JSONL文件名
  const currentFileName = ref<string | null>(null)

  // 编辑历史状态
  const editHistory = ref<EditAction[]>([])
  const historyIndex = ref(-1)
  const maxHistorySize = ref(50) // 限制历史记录大小

  // 修改追踪
  const modifiedSamples = ref<Set<number>>(new Set())

  // 持久化键名
  const STORAGE_KEY = 'ocr_validation_data'

  // ===== 计算属性 =====
  const currentSample = computed(() => samples.value[currentIndex.value] || null)
  const totalSamples = computed(() => samples.value.length)
  const hasData = computed(() => samples.value.length > 0)

  // ===== 持久化方法 =====

  // IndexedDB 助手类，用于存储和恢复文件系统句柄
  class FileSystemDB {
    private dbName = 'ocr_validation_db'
    private db: IDBDatabase | null = null

    async init(): Promise<void> {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, 1)

        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          this.db = request.result
          resolve()
        }

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result

          // 创建对象存储来保存文件句柄
          if (!db.objectStoreNames.contains('handles')) {
            db.createObjectStore('handles', { keyPath: 'id' })
          }
        }
      })
    }

    async saveHandle(handle: FileSystemDirectoryHandle): Promise<void> {
      if (!this.db) await this.init()

      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction(['handles'], 'readwrite')
        const store = transaction.objectStore('handles')

        const request = store.put({
          id: 'pdfDirectory',
          handle: handle,
          timestamp: Date.now()
        })

        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
    }

    async getHandle(): Promise<FileSystemDirectoryHandle | null> {
      if (!this.db) await this.init()

      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction(['handles'], 'readonly')
        const store = transaction.objectStore('handles')
        const request = store.get('pdfDirectory')

        request.onsuccess = () => {
          const result = request.result
          resolve(result ? result.handle : null)
        }
        request.onerror = () => reject(request.error)
      })
    }

    async clearHandle(): Promise<void> {
      if (!this.db) await this.init()

      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction(['handles'], 'readwrite')
        const store = transaction.objectStore('handles')
        const request = store.delete('pdfDirectory')

        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
    }
  }

  // 创建FileSystemDB实例
  const fileSystemDB = new FileSystemDB()

  /**
   * 保存OCR数据到本地存储
   */
  async function saveToLocalStorage() {
    try {
      // File对象无法直接序列化，所以只保存文件名
      const pdfFileNames = Array.from(pdfFiles.value.keys())

      const data = {
        samples: samples.value,
        currentIndex: currentIndex.value,
        currentFileName: currentFileName.value,
        pdfFileNames: pdfFileNames,
        hasSelectedPDFDirectory: !!pdfDirectoryHandle.value // 记录是否已选择PDF文件夹
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))

      // 尝试持久化文件夹句柄（如果存在）
      if (pdfDirectoryHandle.value) {
        try {
          await fileSystemDB.saveHandle(pdfDirectoryHandle.value)
          console.log('PDF文件夹句柄已保存到IndexedDB')
        } catch (err) {
          console.warn('处理文件夹句柄时出错:', err)
        }
      }
    } catch (e) {
      console.error('保存OCR数据失败:', e)
    }
  }

  /**
   * 从本地存储加载OCR数据
   */
  async function loadFromLocalStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) return

      const data = JSON.parse(stored)

      // 恢复基础数据
      if (data.samples) {
        samples.value = data.samples
      }

      if (typeof data.currentIndex === 'number') {
        currentIndex.value = Math.min(data.currentIndex, samples.value.length - 1)
      }

      if (data.currentFileName) {
        currentFileName.value = data.currentFileName
      }

      // 重置其他状态
      selectedElementIndex.value = null
      modifiedSamples.value.clear()
      clearHistory()

      // 重新计算所有样本的修改状态，确保修改标记正确显示
      recalculateModifications()

      // 尝试恢复PDF文件夹句柄
      try {
        if ('showDirectoryPicker' in window && data.hasSelectedPDFDirectory) {
          // 显示提示，告知用户我们正在尝试恢复PDF文件夹访问权限
          console.log('尝试恢复PDF文件夹访问权限...');

          // 延迟执行，让页面内容先加载完成
          setTimeout(async () => {
            try {
              // 尝试从IndexedDB获取持久化的目录句柄
              const savedHandle = await fileSystemDB.getHandle()

              if (savedHandle) {
                try {
                  // 验证权限
                  // @ts-expect-error - queryPermission方法存在于现代浏览器的FileSystemDirectoryHandle实现中
                  const permission = await savedHandle.queryPermission({ mode: 'read' })

                  if (permission === 'granted') {
                    // 权限已授予，直接使用
                    pdfDirectoryHandle.value = savedHandle
                    await loadPDFsFromDirectory(savedHandle)
                    console.log('PDF文件夹自动恢复成功')
                  } else if (permission === 'prompt') {
                    // 需要重新请求权限
                    // @ts-expect-error - requestPermission方法存在于现代浏览器的FileSystemDirectoryHandle实现中
                    const newPermission = await savedHandle.requestPermission({ mode: 'read' })

                    if (newPermission === 'granted') {
                      pdfDirectoryHandle.value = savedHandle
                      await loadPDFsFromDirectory(savedHandle)
                      console.log('PDF文件夹访问权限已恢复')
                    } else {
                      console.log('用户未授权PDF文件夹访问权限')
                    }
                  }
                } catch (err) {
                  console.warn('验证或使用已保存的文件夹句柄失败:', err)
                  // 权限问题，可能需要用户重新选择
                }
              } else {
                console.log('没有找到保存的PDF文件夹句柄')
              }
            } catch (err) {
              console.warn('恢复PDF文件夹访问失败:', err)
              // 失败也没关系，用户可以重新选择
            }
          }, 1000); // 延迟1秒，让页面内容先加载完成
        }
      } catch (err) {
        console.warn('恢复PDF文件夹访问失败:', err)
        // 失败也没关系，用户可以重新选择
      }

      console.log('OCR数据从本地存储加载成功')
    } catch (e) {
      console.error('加载OCR数据失败:', e)
      // 发生错误时清空存储，避免下次加载再次失败
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  /**
   * 从目录句柄加载PDF文件
   */
  async function loadPDFsFromDirectory(dirHandle: FileSystemDirectoryHandle) {
    try {
      pdfFiles.value.clear();
      // 使用entries()方法迭代目录内容
      // @ts-expect-error - FileSystemDirectoryHandle在TypeScript定义中可能不包含entries方法
      for await (const [name, entry] of dirHandle.entries?.() || []) {
        if (entry.kind === 'file' && name.endsWith('.pdf')) {
          const file = await entry.getFile();
          const nameWithoutExt = name.replace('.pdf', '');
          pdfFiles.value.set(nameWithoutExt, file);
        }
      }
      return pdfFiles.value.size;
    } catch (error) {
      console.error('从目录加载PDF文件失败:', error);
      throw error;
    }
  }

  /**
   * 清除本地存储中的OCR数据
   */
  function clearLocalStorage() {
    localStorage.removeItem(STORAGE_KEY)
  }
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

  // 当前JSONL文件信息
  const currentFileInfo = computed(() => ({
    name: currentFileName.value,
    hasData: hasData.value,
    sampleCount: totalSamples.value
  }))

  // ===== 核心操作方法 =====

  /**
   * 加载JSONL数据
   */
  async function loadJSONL(text: string, fileName?: string): Promise<LoadResult> {
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

      // 保存文件名
      if (fileName) {
        currentFileName.value = fileName
      }

      // 保存到本地存储
      await saveToLocalStorage()
    }

    return {
      success: result.success,
      count: result.count,
      errors: result.errors
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
   * 获取PDF文件
   */
  function getPDFFile(pdfName: string): File | undefined {
    const nameWithoutExt = pdfName.replace('.pdf', '')
    return pdfFiles.value.get(nameWithoutExt)
  }

  /**
   * 获取PDF文件（带缓存机制）
   */
  async function getPDFFileWithCache(pdfName: string): Promise<File | undefined> {
    const nameWithoutExt = pdfName.replace('.pdf', '')

    // 1. 检查缓存中是否存在
    if (pdfFileCache.value.has(nameWithoutExt)) {
      const cached = pdfFileCache.value.get(nameWithoutExt)!
      cached.lastAccessed = Date.now() // 更新访问时间
      return cached.file
    }

    // 2. 检查原始存储中是否存在
    if (pdfFiles.value.has(nameWithoutExt)) {
      const file = pdfFiles.value.get(nameWithoutExt)!
      // 添加到缓存
      addToCache(nameWithoutExt, file)
      return file
    }

    // 3. 如果有目录句柄，按需加载文件
    if (pdfDirectoryHandle.value) {
      try {
        const entry = await pdfDirectoryHandle.value.getFileHandle(`${nameWithoutExt}.pdf`)
        const file = await entry.getFile()

        // 添加到缓存
        addToCache(nameWithoutExt, file)

        return file
      } catch (error) {
        console.error(`无法加载PDF文件: ${pdfName}`, error)
        return undefined
      }
    }

    return undefined
  }

  /**
   * 添加文件到缓存，管理缓存大小
   */
  function addToCache(nameWithoutExt: string, file: File) {
    // 如果缓存已满，删除最久未访问的文件
    if (pdfFileCache.value.size >= maxCacheSize.value) {
      const oldest = Array.from(pdfFileCache.value.entries())
        .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed)[0]
      if (oldest) {
        pdfFileCache.value.delete(oldest[0])
      }
    }

    // 存入缓存
    pdfFileCache.value.set(nameWithoutExt, {
      file,
      lastAccessed: Date.now()
    })
  }

  /**
   * 选择PDF文件夹
   */
  async function selectPDFFolder(): Promise<number> {
    try {
      // @ts-expect-error 类型定义可能不完整
      const dirHandle = await window.showDirectoryPicker()
      pdfDirectoryHandle.value = dirHandle

      // 将目录句柄持久化到IndexedDB
      try {
        await fileSystemDB.saveHandle(dirHandle)
        console.log('PDF文件夹句柄已保存到IndexedDB')
      } catch (err) {
        console.warn('保存文件夹句柄失败:', err)
      }

      pdfFiles.value.clear()
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.pdf')) {
          const file = await entry.getFile()
          const nameWithoutExt = entry.name.replace('.pdf', '')
          pdfFiles.value.set(nameWithoutExt, file)
        }
      }

      // 保存状态到localStorage
      await saveToLocalStorage()

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
  async function updateElement(index: number, updates: Partial<LayoutElement>) {
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

    // 自动保存数据
    await saveToLocalStorage()

    return true
  }

  /**
   * 添加元素
   */
  async function addElement(element: LayoutElement) {
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

    // 自动保存数据
    await saveToLocalStorage()

    return true
  }

  /**
   * 删除元素
   */
  async function deleteElement(index: number) {
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

    // 自动保存数据
    await saveToLocalStorage()

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
  async function updatePageInfo(updates: Partial<PageInfo>) {
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

    // 自动保存数据
    saveToLocalStorage()

    return true
  }

  /**
   * 导出数据
   */
  function exportData(): string {
    return JSONLParser.exportOCRToJSONL(samples.value)
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

  /**
   * 重新计算所有修改状态
   */
  function recalculateModifications() {
    modifiedSamples.value.clear()
    samples.value.forEach((sample, index) => {
      if (DataUtils.isOCRSampleModified(sample)) {
        modifiedSamples.value.add(index)
      }
    })
  }

  /**
   * 重置所有修改标记
   */
  function resetModificationStatus() {
    modifiedSamples.value.clear()
  }

  /**
   * 更新单个样本的修改状态
   */
  function updateModificationStatus(index: number) {
    if (index < 0 || index >= samples.value.length) return

    const sample = samples.value[index]
    if (DataUtils.isOCRSampleModified(sample)) {
      modifiedSamples.value.add(index)
    } else {
      modifiedSamples.value.delete(index)
    }
  }

  /**
   * 重置当前样本到原始状态
   */
  function resetCurrentSample() {
    if (!currentSample.value) return

    const originalLayoutDets = DataUtils.deepClone(currentSample.value.original_layout_dets || [])
    const originalPageInfo = DataUtils.deepClone(currentSample.value.original_page_info || {
      language: 'zh' as 'zh' | 'en',
      fuzzy_scan: false,
      watermark: false,
      rotate: 'normal' as 'normal' | 'rotate90' | 'rotate180' | 'rotate270',
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

    // 移除修改标记
    modifiedSamples.value.delete(currentIndex.value)
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
    currentFileName,

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
    currentFileInfo,

    // 核心操作
    loadJSONL,
    setSamples,
    updateElement,
    addElement,
    deleteElement,
    reorderElements,
    updatePageInfo,
    resetCurrentSample,

    // PDF文件管理
    selectPDFFolder,
    uploadPDFFiles,
    getPDFFile,
    getPDFFileWithCache,
    removePDFFile,

    // 编辑历史
    addToHistory,
    executeHistoryAction,
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
    resetModificationStatus,
    recalculateModifications,
    getStateSnapshot,
    restoreFromSnapshot,
    updateModificationStatus,

    // 持久化操作
    saveToLocalStorage,
    loadFromLocalStorage,
    clearLocalStorage
  }
})
