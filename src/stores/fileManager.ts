import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Sample } from '@/types'
import { parseJSONL } from '@/utils/markdown'

export interface DatasetFile {
  id: string
  name: string
  samples: Sample[]
  uploadTime: Date
  modifiedTime: Date
  totalCount: number
  currentIndex: number
}

export const useFileManagerStore = defineStore('fileManager', () => {
  // 状态
  const files = ref<Map<string, DatasetFile>>(new Map())
  const currentFileId = ref<string | null>(null)
  const fileListVisible = ref(false)

  // 计算属性
  const fileList = computed(() => Array.from(files.value.values()))
  const currentFile = computed(() =>
    currentFileId.value ? files.value.get(currentFileId.value) : null
  )
  const hasFiles = computed(() => files.value.size > 0)

  // 生成唯一ID
  function generateId(): string {
    return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  // 添加文件
  function addFile(name: string, content: string): string {
    const { samples } = parseJSONL(content)

    if (samples.length === 0) {
      throw new Error('文件中没有有效数据')
    }

    // 检查是否存在同名文件
    const hasDuplicate = Array.from(files.value.values()).some(file =>
      file.name === name
    )

    if (hasDuplicate) {
      throw new Error('文件名已存在，请先重命名后再上传')
    }

    const id = generateId()
    const file: DatasetFile = {
      id,
      name,
      samples,
      uploadTime: new Date(),
      modifiedTime: new Date(),
      totalCount: samples.length,
      currentIndex: 0
    }

    files.value.set(id, file)
    currentFileId.value = id
    saveToLocalStorage()

    return id
  }

  // 切换文件
  function switchFile(fileId: string) {
    if (files.value.has(fileId)) {
      // 保存当前文件的索引
      if (currentFile.value) {
        currentFile.value.modifiedTime = new Date()
      }

      currentFileId.value = fileId
      saveToLocalStorage()
    }
  }

  // 删除文件
  function removeFile(fileId: string) {
    files.value.delete(fileId)

    // 如果删除的是当前文件，切换到第一个文件
    if (currentFileId.value === fileId) {
      const firstFile = fileList.value[0]
      currentFileId.value = firstFile ? firstFile.id : null
    }

    saveToLocalStorage()
  }

  // 重命名文件
  function renameFile(fileId: string, newName: string) {
    const file = files.value.get(fileId)
    if (file) {
      file.name = newName
      file.modifiedTime = new Date()
      saveToLocalStorage()
    }
  }

  // 复制文件
  function duplicateFile(fileId: string): string {
    const file = files.value.get(fileId)
    if (!file) {
      throw new Error('文件不存在')
    }

    // 深拷贝文件内容
    const newSamples = JSON.parse(JSON.stringify(file.samples))
    const newName = `复制_${file.name}`
    const id = generateId()

    const newFile: DatasetFile = {
      id,
      name: newName,
      samples: newSamples,
      uploadTime: new Date(),
      modifiedTime: new Date(),
      totalCount: newSamples.length,
      currentIndex: 0
    }

    files.value.set(id, newFile)
    saveToLocalStorage()

    return id
  }

  // 更新当前文件的样本
  function updateCurrentFileSamples(samples: Sample[]) {
    if (currentFile.value) {
      currentFile.value.samples = samples
      currentFile.value.modifiedTime = new Date()
      saveToLocalStorage()
    }
  }

  // 更新当前文件的索引
  function updateCurrentFileIndex(index: number) {
    if (currentFile.value) {
      currentFile.value.currentIndex = index
    }
  }

  // 本地存储
  function saveToLocalStorage() {
    try {
      const data = {
        files: Array.from(files.value.entries()).map(([id, file]) => ({
          id,
          name: file.name,
          samples: file.samples,
          uploadTime: file.uploadTime,
          modifiedTime: file.modifiedTime,
          totalCount: file.totalCount,
          currentIndex: file.currentIndex
        })),
        currentFileId: currentFileId.value
      }

      localStorage.setItem('ocr_workspace', JSON.stringify(data))
    } catch (e) {
      console.error('保存工作区失败:', e)
    }
  }

  // 从本地存储加载
  function loadFromLocalStorage() {
    try {
      const stored = localStorage.getItem('ocr_workspace')
      if (!stored) return

      const data = JSON.parse(stored)

      // 恢复文件列表
      files.value.clear()
      data.files.forEach((file: Omit<DatasetFile, 'uploadTime' | 'modifiedTime'> & {uploadTime: string; modifiedTime: string}) => {
        files.value.set(file.id, {
          ...file,
          uploadTime: new Date(file.uploadTime),
          modifiedTime: new Date(file.modifiedTime)
        })
      })

      // 恢复当前文件
      currentFileId.value = data.currentFileId

      // 通知datasetStore加载当前文件数据
      // 这里通过返回值或其他机制让datasetStore知道要加载数据
    } catch (e) {
      console.error('加载工作区失败:', e)
    }
  }

  // 清空工作区
  function clearWorkspace() {
    files.value.clear()
    currentFileId.value = null
    localStorage.removeItem('ocr_workspace')
  }

  // 切换文件列表显示
  function toggleFileList() {
    fileListVisible.value = !fileListVisible.value
  }

  // 初始化时加载本地存储
  loadFromLocalStorage()

  return {
    // 状态
    files,
    currentFileId,
    currentFile,
    fileList,
    hasFiles,
    fileListVisible,

    // 方法
    addFile,
    switchFile,
    removeFile,
    renameFile,
    duplicateFile,
    updateCurrentFileSamples,
    updateCurrentFileIndex,
    saveToLocalStorage,
    loadFromLocalStorage,
    clearWorkspace,
    toggleFileList
  }
})
