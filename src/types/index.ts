/*
统一的类型定义文件
*/

// 基础数据类型
export interface Sample {
  pdf_name_1: string
  pdf_name_2: string
  language: 'zh' | 'en'
  md_elem_list_1: string[]
  md_elem_list_2: string[]
  merging_idx_pairs: number[][]
  original_pairs?: number[][]
}

// OCR样本数据类型
export interface OCRSample {
  pdf_name: string
  layout_dets: LayoutElement[]
  page_info: PageInfo
}

// 布局元素类型
export interface LayoutElement {
  category_type: ElementType
  poly: [number, number, number, number] // [x1, y1, x2, y2]
  text?: string
  html?: string
  order: number
}

// 元素类型枚举
export type ElementType =
  | 'text'
  | 'table'
  | 'table_caption'
  | 'table_footnote'
  | 'title'
  | 'figure'
  | 'formula'

// 页面信息
export interface PageInfo {
  language: 'zh' | 'en'
  fuzzy_scan: boolean
  watermark: boolean
  rotate: 'normal' | '90' | '180' | '270'
  is_table: boolean
  is_diagram: boolean
}

// 视图模式类型
export type ViewMode = 'raw' | 'rendered'
export type OCRViewMode = 'original' | 'rendered' | 'json'

// 编辑器状态类型
export interface EditorState {
  selectedLeft: number | null
  selectedRight: number | null
  leftViewMode: ViewMode
  rightViewMode: ViewMode
}

// 合并对类型
export type MergingPair = [number, number]

// 编辑动作类型
export interface EditAction {
  type: 'modify' | 'delete' | 'add' | 'reorder'
  elementIndex?: number
  oldValue?: LayoutElement | LayoutElement[]
  newValue?: LayoutElement | LayoutElement[]
  timestamp: number
}

// 文件管理相关类型
export interface DatasetFile {
  id: string
  name: string
  samples: Sample[]
  uploadTime: Date
  modifiedTime: Date
  totalCount: number
  currentIndex: number
}

// API响应类型
export interface LoadResult {
  success: boolean
  count: number
  errors: Array<{line: number; error: Error}>
}

// 通用回调类型
export type ErrorCallback = (error: Error) => void
export type SuccessCallback<T = void> = (result: T) => void

// 组件Props类型
export interface NavigationProps {
  currentIndex: number
  totalItems: number
  isModified?: boolean
  language?: string
  keyboardHint?: string
}

export interface HeaderProps extends NavigationProps {
  showModeSwitch?: boolean
  showUpload?: boolean
  showNavigation?: boolean
  showStats?: boolean
  showHistory?: boolean
  showSave?: boolean
  uploadText?: string
  uploadAccept?: string
  uploadMultiple?: boolean
  hasData?: boolean
  canUndo?: boolean
  canRedo?: boolean
  exportText?: string
  exportType?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
  modifiedCount?: number
  extraStats?: string
}

// 事件类型
export interface AppEvents {
  'main-upload': [file: File]
  'previous': []
  'next': []
  'navigate': [index: number]
  'undo': []
  'redo': []
  'save': []
  'export': []
  'element-click': [index: number]
  'element-edit': [index: number, element: Partial<LayoutElement>]
  'element-delete': [index: number]
  'view-mode-change': [mode: ViewMode | OCRViewMode]
}

// Store状态类型
export interface DatasetStoreState {
  samples: Sample[]
  currentIndex: number
  modifiedIndices: Set<number>
}

export interface EditorStoreState {
  selectedLeft: number | null
  selectedRight: number | null
  leftViewMode: ViewMode
  rightViewMode: ViewMode
}

export interface OCRStoreState {
  samples: OCRSample[]
  currentIndex: number
  selectedElementIndex: number | null
  viewMode: OCRViewMode
  pdfFiles: Map<string, File>
  editHistory: EditAction[]
  historyIndex: number
  modifiedSamples: Set<number>
}

// 工具函数类型
export type FileProcessor = (file: File) => Promise<string>
export type DataValidator<T> = (data: T) => boolean
export type DataTransformer<T, U> = (input: T) => U

// 错误类型
export class ValidationError extends Error {
  constructor(message: string, public line?: number) {
    super(message)
    this.name = 'ValidationError'
  }
}

export class FileProcessingError extends Error {
  constructor(message: string, public fileName?: string) {
    super(message)
    this.name = 'FileProcessingError'
  }
}

// 常量定义
export const ELEMENT_TYPE_COLORS: Record<ElementType, string> = {
  text: '#409eff',
  table: '#67c23a',
  table_caption: '#e6a23c',
  table_footnote: '#e6a23c',
  title: '#f56c6c',
  figure: '#909399',
  formula: '#b88230'
}

export const VIEW_MODES: Record<string, ViewMode | OCRViewMode> = {
  RAW: 'raw',
  RENDERED: 'rendered',
  ORIGINAL: 'original',
  JSON: 'json'
}

export const KEYBOARD_SHORTCUTS = {
  PREV: 'a',
  NEXT: 'd',
  UNDO: 'z',
  REDO: 'y'
} as const
