/*
通用工具函数库
*/
import type {
  Sample,
  OCRSample,
  LoadResult,
  ElementType
} from '@/types'
import {
  ValidationError,
  FileProcessingError
} from '@/types'

// 文件处理相关
export class FileUtils {
  /**
   * 读取文件内容为文本
   */
  static async readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const result = e.target?.result
        if (typeof result === 'string') {
          resolve(result)
        } else {
          reject(new FileProcessingError('文件读取结果格式错误', file.name))
        }
      }
      reader.onerror = () => {
        reject(new FileProcessingError('文件读取失败', file.name))
      }
      reader.readAsText(file, 'utf-8')
    })
  }

  /**
   * 检测文件类型
   */
  static detectFileType(content: string): 'merge' | 'ocr' | 'unknown' {
    try {
      const lines = content.trim().split('\n').filter(line => line.trim())
      if (lines.length === 0) return 'unknown'

      const firstSample = JSON.parse(lines[0])

      // 检查合并校验格式
      if (firstSample.pdf_name_1 && firstSample.pdf_name_2 &&
        Array.isArray(firstSample.merging_idx_pairs)) {
        return 'merge'
      }

      // 检查OCR校验格式
      if (firstSample.pdf_name && Array.isArray(firstSample.layout_dets)) {
        return 'ocr'
      }

      return 'unknown'
    } catch {
      return 'unknown'
    }
  }

  /**
   * 生成下载链接
   */
  static downloadFile(content: string, fileName: string, mimeType = 'application/jsonl') {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }
}

// JSONL解析相关
export class JSONLParser {
  /**
   * 解析合并校验JSONL
   */
  static parseMergeJSONL(text: string): LoadResult & { samples: Sample[] } {
    const lines = text.trim().split('\n').filter(line => line.trim())
    const samples: Sample[] = []
    const errors: Array<{ line: number; error: Error; lineContent?: string }> = []

    for (let i = 0; i < lines.length; i++) {
      try {
        // 尝试解析JSON行
        const sample = JSON.parse(lines[i]) as Sample

        // 验证必要字段
        if (!this.validateMergeSample(sample)) {
          throw new ValidationError('样本格式不正确，缺少必要字段', i + 1)
        }

        // 确保 merging_idx_pairs 是数组
        if (!Array.isArray(sample.merging_idx_pairs)) {
          sample.merging_idx_pairs = []
        }

        // 保存原始合并对
        sample.original_pairs = JSON.parse(JSON.stringify(sample.merging_idx_pairs))
        samples.push(sample)

      } catch (e) {
        const error = e as Error
        // 如果是JSON解析错误，提供更详细的错误信息
        if (error instanceof SyntaxError) {
          // 提取行内容的前50个字符，避免在控制台显示过长的内容
          const linePreview = lines[i].substring(0, 50) + (lines[i].length > 50 ? '...' : '')
          errors.push({
            line: i + 1,
            error: new SyntaxError(`JSON解析错误: ${error.message}。行内容预览: ${linePreview}`),
            lineContent: lines[i] // 保存完整的行内容，便于调试
          })
        } else {
          errors.push({ line: i + 1, error })
        }
      }
    }

    return {
      success: samples.length > 0,
      count: samples.length,
      errors,
      samples
    }
  }

  /**
   * 解析OCR校验JSONL
   */
  static parseOCRJSONL(text: string): LoadResult & { samples: OCRSample[] } {
    const lines = text.trim().split('\n').filter(line => line.trim())
    const samples: OCRSample[] = []
    const errors: Array<{ line: number; error: Error }> = []

    for (let i = 0; i < lines.length; i++) {
      try {
        const sample = JSON.parse(lines[i]) as OCRSample

        // 验证必要字段
        if (!this.validateOCRSample(sample)) {
          throw new ValidationError('OCR样本格式不正确', i + 1)
        }

        samples.push(sample)

      } catch (e) {
        errors.push({ line: i + 1, error: e as Error })
      }
    }

    return {
      success: samples.length > 0,
      count: samples.length,
      errors,
      samples
    }
  }

  /**
   * 验证合并样本格式
   */
  private static validateMergeSample(sample: unknown): sample is Sample {
    return !!(sample && typeof sample === 'object' && 'pdf_name_1' in sample && 'pdf_name_2' in sample && 'language' in sample && 'md_elem_list_1' in sample && 'md_elem_list_2' in sample && typeof (sample as any).pdf_name_1 === 'string' && typeof (sample as any).pdf_name_2 === 'string' && ['zh', 'en'].includes((sample as any).language) && Array.isArray((sample as any).md_elem_list_1) && Array.isArray((sample as any).md_elem_list_2))
  }

  /**
   * 验证OCR样本格式
   */
  private static validateOCRSample(sample: unknown): sample is OCRSample {
    return !!(sample && typeof sample === 'object' && 'pdf_name' in sample && 'layout_dets' in sample && 'page_info' in sample && typeof (sample as any).pdf_name === 'string' && Array.isArray((sample as any).layout_dets) && (sample as any).page_info && typeof (sample as any).page_info === 'object')
  }

  /**
   * 导出合并样本到JSONL
   */
  static exportMergeToJSONL(samples: Sample[]): string {
    return samples.map(sample => {
      const exportSample = { ...sample }
      delete exportSample.original_pairs
      return this.stringifyWithSpace(exportSample)
    }).join('\n')
  }

  /**
   * 导出OCR样本到JSONL
   */
  static exportOCRToJSONL(samples: OCRSample[]): string {
    return samples.map(sample => {
      // 创建不包含原始数据的样本副本
      const exportSample = { ...sample }
      delete exportSample.original_layout_dets
      delete exportSample.original_page_info
      return JSON.stringify(exportSample)
    }).join('\n')
  }

  /**
   * 自定义序列化函数，确保合并对格式正确
   */
  private static stringifyWithSpace(obj: unknown): string {
    if (Array.isArray(obj)) {
      if (obj.length === 2 && typeof obj[0] === 'number' && typeof obj[1] === 'number') {
        return `[${obj[0]}, ${obj[1]}]`
      }
      return `[${obj.map(item => this.stringifyWithSpace(item)).join(', ')}]`
    } else if (typeof obj === 'object' && obj !== null) {
      const keys = Object.keys(obj)
      const keyValuePairs = keys.map(key =>
        `"${key}":${this.stringifyWithSpace((obj as Record<string, unknown>)[key])}`
      )
      return `{${keyValuePairs.join(', ')}}`
    } else if (typeof obj === 'string') {
      return JSON.stringify(obj)
    } else {
      return String(obj)
    }
  }
}

// UI相关工具
export class UIUtils {
  /**
   * 获取元素类型对应的颜色
   */
  static getElementTypeColor(type: ElementType): string {
    const colorMap: Record<ElementType, string> = {
      title: '#f56c6c',
      text: '#409eff',
      footnote: '#409eff',
      chart_caption: '#909399',
      chart: '#909399',
      chart_footnote: '#909399',
      table_caption: '#e6a23c',
      table: '#67c23a',
      table_footnote: '#e6a23c',
      page_footnote: '#409eff',
      figure_caption: '#909399',
      figure: '#909399',
      figure_footnote: '#909399'
    }
    return colorMap[type] || '#909399'
  }

  /**
   * 获取Element Plus标签类型
   */
  static getElementTagType(type: ElementType): string {
    const typeMap: Record<ElementType, string> = {
      title: 'danger',
      text: '',
      footnote: 'primary',
      chart_caption: 'info',
      chart: 'info',
      chart_footnote: 'info',
      table_caption: 'warning',
      table: 'success',
      table_footnote: 'warning',
      page_footnote: 'primary',
      figure_caption: 'info',
      figure: 'info',
      figure_footnote: 'info'
    }
    return typeMap[type] || ''
  }

  /**
   * 格式化时间显示
   */
  static formatTimeAgo(date: Date): string {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / (1000 * 60))
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes}分钟前`
    if (hours < 24) return `${hours}小时前`
    if (days < 7) return `${days}天前`
    return date.toLocaleDateString()
  }

  /**
   * 防抖函数
   */
  static debounce<T extends (...args: Array<unknown>) => unknown>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: number | null = null
    return (...args: Parameters<T>) => {
      if (timeout) clearTimeout(timeout)
      timeout = window.setTimeout(() => func(...args), wait)
    }
  }

  /**
   * 节流函数
   */
  static throttle<T extends (...args: Array<unknown>) => unknown>(
    func: T,
    limit: number
  ): (...args: Parameters<T>) => void {
    let inThrottle = false
    return (...args: Parameters<T>) => {
      if (!inThrottle) {
        func(...args)
        inThrottle = true
        setTimeout(() => inThrottle = false, limit)
      }
    }
  }
}

// 数据处理工具
export class DataUtils {
  /**
   * 深拷贝对象
   */
  static deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') return obj
    if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T
    if (obj instanceof Array) return obj.map(item => this.deepClone(item)) as unknown as T
    if (typeof obj === 'object') {
      const clonedObj = {} as T
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          clonedObj[key] = this.deepClone(obj[key])
        }
      }
      return clonedObj
    }
    return obj
  }

  /**
   * 检查两个数组是否相等
   */
  static arraysEqual<T>(a: T[], b: T[]): boolean {
    if (a.length !== b.length) return false
    return a.every((val, i) => val === b[i])
  }

  /**
   * 生成唯一ID
   */
  static generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 检查样本是否被修改（合并校验）
   */
  static isSampleModified(sample: Sample): boolean {
    if (!sample.original_pairs) return false
    const current = JSON.stringify(sample.merging_idx_pairs.sort())
    const original = JSON.stringify(sample.original_pairs.sort())
    return current !== original
  }

  /**
   * 检查OCR样本是否被修改
   */
  static isOCRSampleModified(sample: OCRSample): boolean {
    // 如果没有原始数据，假设没有修改
    if (!sample.original_layout_dets || !sample.original_page_info) return false

    // 比较页面信息
    const currentPageInfo = JSON.stringify(sample.page_info)
    const originalPageInfo = JSON.stringify(sample.original_page_info)
    if (currentPageInfo !== originalPageInfo) return true

    // 比较布局元素（排序后比较）
    const currentDets = [...sample.layout_dets].sort((a, b) => a.order - b.order)
    const originalDets = [...sample.original_layout_dets].sort((a, b) => a.order - b.order)

    if (currentDets.length !== originalDets.length) return true

    // 比较每个元素
    for (let i = 0; i < currentDets.length; i++) {
      const current = currentDets[i]
      const original = originalDets[i]

      // 比较关键属性
      if (current.category_type !== original.category_type ||
        current.text !== original.text ||
        !this.arraysEqual(current.poly, original.poly)) {
        return true
      }
    }

    return false
  }
}

// 键盘快捷键管理
export class KeyboardManager {
  private handlers: Map<string, () => void> = new Map()
  private isActive = true

  constructor() {
    this.handleKeydown = this.handleKeydown.bind(this)
    document.addEventListener('keydown', this.handleKeydown)
  }

  /**
   * 注册快捷键
   */
  register(key: string, handler: () => void): void {
    this.handlers.set(key.toLowerCase(), handler)
  }

  /**
   * 注销快捷键
   */
  unregister(key: string): void {
    this.handlers.delete(key.toLowerCase())
  }

  /**
   * 启用/禁用快捷键
   */
  setActive(active: boolean): void {
    this.isActive = active
  }

  /**
   * 处理键盘事件
   */
  private handleKeydown(event: KeyboardEvent): void {
    if (!this.isActive) return

    // 如果焦点在输入框上，忽略快捷键
    if (document.activeElement instanceof HTMLInputElement ||
      document.activeElement instanceof HTMLTextAreaElement) {
      return
    }

    const key = event.key.toLowerCase()
    const handler = this.handlers.get(key)

    if (handler) {
      event.preventDefault()
      handler()
    }
  }

  /**
   * 销毁管理器
   */
  destroy(): void {
    document.removeEventListener('keydown', this.handleKeydown)
    this.handlers.clear()
  }
}

// 导出常用实例
export const keyboardManager = new KeyboardManager()
