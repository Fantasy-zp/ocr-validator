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

  // 编辑历史状态 - 按样本隔离
  const sampleHistories = ref<Map<number, { history: EditAction[], index: number }>>(new Map())
  const maxHistorySize = ref(50) // 限制历史记录大小

  // 修改追踪
  const modifiedSamples = ref<Set<number>>(new Set())

  // 持久化键名
  const STORAGE_KEY = 'ocr_validation_data'

  // ===== 计算属性 =====
  const currentSample = computed(() => samples.value[currentIndex.value] || null)
  const totalSamples = computed(() => samples.value.length)
  const hasData = computed(() => samples.value.length > 0)

  // 当前样本的编辑历史
  const currentHistory = computed(() => {
    if (!sampleHistories.value.has(currentIndex.value)) {
      sampleHistories.value.set(currentIndex.value, { history: [], index: -1 })
    }
    return sampleHistories.value.get(currentIndex.value)!
  })

  // 历史操作状态
  const canUndo = computed(() => {
    const history = currentHistory.value
    return history && history.index >= 0
  })
  const canRedo = computed(() => {
    const history = currentHistory.value
    return history && history.index < history.history.length - 1
  })

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
      // 准备要保存的数据
      const dataToSave = {
        samples: samples.value,
        currentIndex: currentIndex.value,
        selectedElementIndex: selectedElementIndex.value,
        currentFileName: currentFileName.value,
        pdfFileNames: Array.from(pdfFiles.value.keys()),
        modifiedSamples: Array.from(modifiedSamples.value),
        viewMode: viewMode.value,
        sampleHistories: Array.from(sampleHistories.value.entries()),
        hasSelectedPDFDirectory: !!pdfDirectoryHandle.value,
        lastSavedTimestamp: Date.now()
      }

      // 保存到localStorage
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave))

      // 尝试将文件夹句柄保存到IndexedDB（这是一个异步操作）
      if (pdfDirectoryHandle.value) {
        try {
          await fileSystemDB.saveHandle(pdfDirectoryHandle.value)
          console.log('PDF文件夹句柄已保存到IndexedDB')
        } catch (dbError) {
          console.warn('保存文件夹句柄到IndexedDB失败，但不影响主要功能:', dbError)
          // 不抛出错误，继续执行
        }
      }

      console.log('数据已成功保存到localStorage')
      return true
    } catch (error) {
      console.error('保存数据到localStorage失败:', error)
      // 提供更详细的错误信息
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        console.error('localStorage存储空间已满，请清除部分数据后重试')
      } else if (error instanceof Error && error.message.includes('JSON')) {
        console.error('数据序列化失败，请检查数据格式')
      }
      return false
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
      clearAllHistories() // 清除所有历史记录

      // 恢复样本历史记录
      if (data.sampleHistories && Array.isArray(data.sampleHistories)) {
        sampleHistories.value = new Map(data.sampleHistories)
      }

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

    const history = currentHistory.value
    const action = history.history[history.index]
    history.index--

    try {
      executeHistoryAction(action, 'undo')
      // 更新修改状态
      updateModificationStatus(currentIndex.value)
      return true
    } catch (error) {
      console.error('撤销操作失败:', error)
      history.index++ // 恢复索引
      return false
    }
  }

  /**
   * 重做操作
   */
  function redo() {
    if (!canRedo.value || !currentSample.value) return false

    const history = currentHistory.value
    history.index++
    const action = history.history[history.index]

    try {
      executeHistoryAction(action, 'redo')
      // 更新修改状态
      updateModificationStatus(currentIndex.value)
      return true
    } catch (error) {
      console.error('重做操作失败:', error)
      history.index-- // 恢复索引
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
    // 清除所有历史记录
    clearAllHistories()
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
   * 更新元素 - 完全重写的健壮版本，解决所有order属性相关问题
   */
  async function updateElement(index: number, updates: Partial<LayoutElement>) {
    console.log('索引:', index)

    if (!currentSample.value || index < 0 || index >= currentSample.value.layout_dets.length) {
      return false
    }

    try {
      // 增强类型检查
      if (updates && typeof updates !== 'object') {
        console.error('更新数据必须是对象类型')
        return false
      }

      // 创建所有元素的深拷贝，避免直接修改原数组
      const originalElements = DataUtils.deepClone(currentSample.value.layout_dets);
      const oldElement = originalElements[index];

      // 特殊处理order属性更新
      if ('order' in updates && typeof updates.order === 'number') {
        console.log('执行order属性更新逻辑，目标order值:', updates.order);
        
        // 确保所有元素都有有效的order值
        originalElements.forEach((elem, idx) => {
          if (elem.order === undefined) {
            elem.order = idx;
            console.log(`元素${idx}的order值未定义，已初始化为${idx}`);
          }
        });
        
        // 保存原始元素order值
        const originalElementOrder = oldElement.order;
        
        // 计算有效的新order值（确保在有效范围内）
        const targetOrder = Math.max(0, Math.min(Math.floor(updates.order), originalElements.length - 1));
        
        console.log(`元素${index}原始order: ${originalElementOrder}，目标order: ${targetOrder}`);
        
        // 如果order值没有变化，仅更新当前元素的属性
        if (originalElementOrder === targetOrder) {
          console.log('order值未变化，仅更新元素属性');
          const newElement = { ...oldElement, ...updates };
          currentSample.value.layout_dets[index] = newElement;
          
          // 记录编辑历史
          addToHistory({
            type: 'modify',
            elementIndex: index,
            oldValue: oldElement,
            newValue: newElement,
            timestamp: Date.now()
          });
        } else {
          console.log('执行元素顺序调整');
          // 创建一个新的元素数组，用于重新排序
          const newElementsArray = [...originalElements];
          
          // 从新数组中移除要移动的元素
          const elementToMove = newElementsArray.splice(index, 1)[0];
          
          // 应用所有更新到要移动的元素
          const updatedElement = { ...elementToMove, ...updates };
          
          // 在新位置插入元素
          newElementsArray.splice(targetOrder, 0, updatedElement);
          
          // 关键改进：根据数组中的实际位置重新分配所有元素的order值
          // 这确保了order值始终与数组索引完全对应
          const finalElements = newElementsArray.map((elem, idx) => ({
            ...elem,
            order: idx
          }));
          
          console.log('重新分配order值后的元素列表:', finalElements);
          
          // 保存更新前的完整状态用于历史记录
          const oldState = DataUtils.deepClone(originalElements);
          
          // 更新原始数组的元素
          currentSample.value.layout_dets = finalElements;
          
          // 更新选中元素索引（如果需要）
          if (selectedElementIndex.value !== null) {
            // 查找原选中元素在新数组中的位置
            if (selectedElementIndex.value === index) {
              // 如果选中的是当前正在移动的元素，则更新索引到新位置
              selectedElementIndex.value = targetOrder;
            } else if (originalElementOrder < targetOrder && 
                      selectedElementIndex.value > originalElementOrder && 
                      selectedElementIndex.value <= targetOrder) {
              // 如果选中的元素在移动路径上（向后移动的情况），则索引减1
              selectedElementIndex.value--;
            } else if (originalElementOrder > targetOrder && 
                      selectedElementIndex.value >= targetOrder && 
                      selectedElementIndex.value < originalElementOrder) {
              // 如果选中的元素在移动路径上（向前移动的情况），则索引加1
              selectedElementIndex.value++;
            }
          }
          
          // 记录编辑历史 - 作为整体重排序操作
          addToHistory({
            type: 'reorder',
            oldValue: oldState,
            newValue: DataUtils.deepClone(finalElements),
            timestamp: Date.now()
          });
        }
      } else {
        // 非order属性更新的情况
        const newElement = { ...oldElement, ...updates };
        currentSample.value.layout_dets[index] = newElement;
        
        // 强制响应式更新
        if (currentSample.value.layout_dets.length > 0) {
          currentSample.value.layout_dets = [...currentSample.value.layout_dets];
        }
        
        // 记录编辑历史
        addToHistory({
          type: 'modify',
          elementIndex: index,
          oldValue: oldElement,
          newValue: newElement,
          timestamp: Date.now()
        });
      }
      
      modifiedSamples.value.add(currentIndex.value);
      console.log('更新后:', currentSample.value.layout_dets[index]);
      // 自动保存数据
      await saveToLocalStorage();

      // 强制响应式更新，确保所有组件都能正确响应顺序变化
      if (currentSample.value.layout_dets.length > 0) {
        currentSample.value.layout_dets = [...currentSample.value.layout_dets];
      }

      return true
    } catch (error) {
      console.error('更新元素失败:', error)
      return false
    }
  }

  /**
   * 添加元素 - 支持按指定order值插入的改进版本
   */
  async function addElement(element: LayoutElement) {
    if (!currentSample.value) return false

    try {
      // 增强类型检查
      if (!element || typeof element !== 'object' || Array.isArray(element) || !('category_type' in element)) {
        console.error('无效的元素数据:', element)
        return false
      }

      // 确保poly属性存在且格式正确
      if (!element.poly || !Array.isArray(element.poly) || element.poly.length !== 4) {
        element.poly = [0, 0, 100, 100] // 设置默认值
      }

      // 深拷贝以避免修改传入的元素
      const newElement = { ...element }
      
      // 创建当前元素列表的副本并确保所有元素都有order值
      const elementsCopy = DataUtils.deepClone(currentSample.value.layout_dets)
      elementsCopy.forEach((elem, idx) => {
        if (elem.order === undefined) {
          elem.order = idx
        }
      })

      // 检查是否提供了有效的order值
      if (element.order !== undefined && typeof element.order === 'number' && element.order >= 0) {
        // 使用用户指定的order值，但确保在有效范围内
        const targetOrder = Math.min(
          Math.max(0, Math.floor(element.order)),
          elementsCopy.length
        )
        newElement.order = targetOrder
        
        // 找到插入位置
        const insertIndex = elementsCopy.findIndex(elem => elem.order >= targetOrder)
        
        // 调整其他元素的order值
        elementsCopy.forEach(elem => {
          if (elem.order >= targetOrder) {
            elem.order += 1
          }
        })
        
        // 插入新元素
        if (insertIndex === -1) {
          elementsCopy.push(newElement)
        } else {
          elementsCopy.splice(insertIndex, 0, newElement)
        }
        
        // 重新分配所有元素的order值以确保连续
        elementsCopy.sort((a, b) => a.order - b.order)
        elementsCopy.forEach((elem, idx) => {
          elem.order = idx
        })
        
        // 更新原始数组
        currentSample.value.layout_dets = elementsCopy
      } else {
        // 如果没有有效的order值，使用当前逻辑（添加到末尾）
        const maxOrder = Math.max(
          0,
          ...elementsCopy.map(e => e.order || 0)
        )
        newElement.order = maxOrder + 1
        
        // 添加元素
        currentSample.value.layout_dets.push(newElement)
      }

      // 记录编辑历史
      addToHistory({
        type: 'add',
        newValue: newElement,
        timestamp: Date.now()
      })

      modifiedSamples.value.add(currentIndex.value)

      // 自动保存数据
      await saveToLocalStorage()

      // 强制响应式更新
      if (currentSample.value.layout_dets.length > 0) {
        currentSample.value.layout_dets = [...currentSample.value.layout_dets]
      }

      return true
    } catch (error) {
      console.error('添加元素失败:', error)
      return false
    }
  }

  /**
   * 删除元素 - 修复元素查找逻辑版本
   */
  async function deleteElement(index: number) {
    if (!currentSample.value || index < 0 || index >= currentElements.value.length) {
      return false
    }

    try {
      // 获取排序后索引对应的原始元素
      const elementToDelete = currentElements.value[index]

      // 改进元素查找逻辑，使用更可靠的方式
      // 创建一个唯一标识符来查找元素
      const findOriginalElement = () => {
        // 首先尝试精确匹配引用
        const exactMatchIndex = currentSample.value.layout_dets.findIndex(el => el === elementToDelete)
        if (exactMatchIndex !== -1) return exactMatchIndex

        // 如果引用不匹配，使用多字段组合匹配
        return currentSample.value.layout_dets.findIndex(el =>
          el.category_type === elementToDelete.category_type &&
          el.order === elementToDelete.order &&
          el.poly.join(',') === elementToDelete.poly.join(',') &&
          ((el.text && elementToDelete.text && el.text === elementToDelete.text) ||
           (el.html && elementToDelete.html && el.html === elementToDelete.html))
        )
      }

      const originalIndex = findOriginalElement()

      if (originalIndex === -1) {
        console.error('未找到要删除的元素:', elementToDelete)
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
    } catch (error) {
      console.error('删除元素失败:', error)
      return false
    }
  }

  /**
   * 重新排序元素 - 支持无参数调用
   */
  async function reorderElements(newOrder?: number[]) {
    if (!currentSample.value) {
      return false
    }

    try {
      const oldOrder = DataUtils.deepClone(currentSample.value.layout_dets)

      if (newOrder && Array.isArray(newOrder)) {
        // 检查新顺序是否有效
        if (newOrder.length !== currentSample.value.layout_dets.length) {
          console.error('新顺序数组长度不匹配')
          return false
        }

        // 检查是否包含所有索引
        const hasAllIndexes = newOrder.every((value, index) =>
          newOrder.includes(index)
        )
        if (!hasAllIndexes) {
          console.error('新顺序数组包含无效索引')
          return false
        }

        // 应用新顺序
        const reorderedElements = newOrder.map(idx => currentSample.value.layout_dets[idx])
        // 更新每个元素的order属性，保持数据一致性
        reorderedElements.forEach((elem, i) => {
          elem.order = i
        })
        currentSample.value.layout_dets = reorderedElements
      } else {
        // 按order属性排序（无参数调用时的默认行为）
        currentSample.value.layout_dets.sort((a, b) => a.order - b.order)
        currentSample.value.layout_dets.forEach((elem, i) => {
          elem.order = i
        })
      }

      modifiedSamples.value.add(currentIndex.value)

      // 记录编辑历史
      addToHistory({
        type: 'reorder',
        oldValue: oldOrder,
        newValue: DataUtils.deepClone(currentSample.value.layout_dets),
        timestamp: Date.now()
      })

      // 自动保存数据
      await saveToLocalStorage()

      // 强制响应式更新，确保所有组件都能正确响应顺序变化
      if (currentSample.value.layout_dets.length > 0) {
        currentSample.value.layout_dets = [...currentSample.value.layout_dets];
      }

      return true
    } catch (error) {
      console.error('重新排序元素失败:', error)
      return false
    }
  }

  // ===== 历史操作 =====

  /**
   * 添加到历史记录
   */
  function addToHistory(action: EditAction) {
    const history = currentHistory.value

    // 如果不在历史记录的最后，删除后面的历史
    if (history.index < history.history.length - 1) {
      history.history.splice(history.index + 1)
    }

    // 添加新动作
    history.history.push(action)
    history.index = history.history.length - 1

    // 限制历史记录大小
    if (history.history.length > maxHistorySize.value) {
      history.history.shift()
      history.index--
    }
  }

  /**
   * 执行历史动作 - 增强类型检查和错误处理版本
   */
  function executeHistoryAction(action: EditAction, direction: 'undo' | 'redo') {
    if (!currentSample.value) return

    try {
      switch (action.type) {
        case 'modify':
          if (action.elementIndex !== undefined && action.elementIndex >= 0) {
            // 处理元素修改
            const targetElement = direction === 'undo' ? action.oldValue : action.newValue
            // 增强类型检查
            if (
              targetElement &&
              typeof targetElement === 'object' &&
              !Array.isArray(targetElement) &&
              'category_type' in targetElement &&
              'poly' in targetElement &&
              Array.isArray((targetElement as LayoutElement).poly)
            ) {
              currentSample.value.layout_dets[action.elementIndex] = targetElement as LayoutElement
            } else {
              console.warn('无效的元素数据类型:', targetElement)
            }
          } else if (action.elementIndex === -1) {
            // 处理页面信息修改
            const targetPageInfo = direction === 'undo' ? action.oldValue : action.newValue
            // 增强类型检查
            if (
              targetPageInfo &&
              typeof targetPageInfo === 'object' &&
              !Array.isArray(targetPageInfo) &&
              'language' in targetPageInfo
            ) {
              currentSample.value.page_info = targetPageInfo as PageInfo
            } else {
              console.warn('无效的页面信息数据类型:', targetPageInfo)
            }
          }
          break

        case 'add':
          if (direction === 'undo') {
            // 撤销添加 = 删除元素
            if (
              action.newValue &&
              typeof action.newValue === 'object' &&
              !Array.isArray(action.newValue) &&
              'category_type' in action.newValue
            ) {
              const layoutElement = action.newValue as LayoutElement
              // 使用改进的查找方法
              const index = currentSample.value.layout_dets.findIndex(
                elem => elem.order === layoutElement.order && elem.poly.join(',') === layoutElement.poly.join(',')
              )
              if (index !== -1) {
                currentSample.value.layout_dets.splice(index, 1)
              }
            }
          } else {
            // 重做添加 = 重新添加元素
            if (
              action.newValue &&
              typeof action.newValue === 'object' &&
              !Array.isArray(action.newValue) &&
              'category_type' in action.newValue
            ) {
              currentSample.value.layout_dets.push(action.newValue as LayoutElement)
            }
          }
          break

        case 'delete':
          if (
            action.elementIndex !== undefined &&
            action.oldValue &&
            typeof action.oldValue === 'object' &&
            !Array.isArray(action.oldValue) &&
            'category_type' in action.oldValue
          ) {
            if (direction === 'undo') {
              // 撤销删除 = 重新插入元素
              currentSample.value.layout_dets.splice(action.elementIndex, 0, action.oldValue as LayoutElement)
            } else {
              // 重做删除 = 再次删除元素
              currentSample.value.layout_dets.splice(action.elementIndex, 1)
            }
          }
          break

        case 'reorder':
          if (direction === 'undo' && action.oldValue && Array.isArray(action.oldValue)) {
            // 撤销重排 = 恢复旧顺序
            currentSample.value.layout_dets = action.oldValue as LayoutElement[]
          } else if (direction === 'redo' && action.newValue && Array.isArray(action.newValue)) {
            // 重做重排 = 应用新顺序
            currentSample.value.layout_dets = action.newValue as LayoutElement[]
          }
          break
      }
    } catch (error) {
      console.error('执行历史操作失败:', error, 'Action:', action, 'Direction:', direction)
    }
  }

  /**
   * 清除当前样本的历史记录
   */
  function clearHistory() {
    sampleHistories.value.set(currentIndex.value, { history: [], index: -1 })
  }

  /**
   * 清除所有样本的历史记录
   */
  function clearAllHistories() {
    sampleHistories.value.clear()
  }

  // ===== 导航操作 =====

  /**
   * 导航到指定样本 - 修复异步保存问题
   */
  async function navigateTo(index: number) {
    if (index >= 0 && index < totalSamples.value) {
      // 在导航前确保数据已保存
      await saveToLocalStorage()
      currentIndex.value = index
      selectedElementIndex.value = null
      return true
    }
    return false
  }

  /**
   * 下一个样本 - 修复异步保存问题
   */
  async function nextSample() {
    if (currentIndex.value < totalSamples.value - 1) {
      // 在导航前确保数据已保存
      await saveToLocalStorage()
      currentIndex.value++
      selectedElementIndex.value = null
      return true
    }
    return false
  }

  /**
   * 上一个样本 - 修复异步保存问题
   */
  async function prevSample() {
    if (currentIndex.value > 0) {
      // 在导航前确保数据已保存
      await saveToLocalStorage()
      currentIndex.value--
      selectedElementIndex.value = null
      return true
    }
    return false
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
   * 更新页面信息 - 修复异步保存问题
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

    try {
      // 更新页面信息
      currentSample.value.page_info = newPageInfo
      modifiedSamples.value.add(currentIndex.value)

      // 自动保存数据（添加await）
      await saveToLocalStorage()
      return true
    } catch (error) {
      console.error('更新页面信息失败:', error)
      // 发生错误时恢复原始数据
      currentSample.value.page_info = oldPageInfo
      return false
    }
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
      editHistory: DataUtils.deepClone(currentHistory.value.history),
      historyIndex: currentHistory.value.index,
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
    sampleHistories.value.set(currentIndex.value, {
      history: snapshot.editHistory || [],
      index: snapshot.historyIndex || -1
    })
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
    clearAllHistories,

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
