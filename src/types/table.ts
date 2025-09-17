/*
表格编辑器相关类型定义
*/

// 单元格数据结构
export interface TableCell {
  content: string           // 单元格内容（支持HTML，如<sup>）
  rowspan: number          // 行合并数，默认1
  colspan: number          // 列合并数，默认1
  isVirtual?: boolean      // 是否为被合并的虚拟单元格
  virtualSourceRow?: number // 虚拟单元格的源单元格行索引
  virtualSourceCol?: number // 虚拟单元格的源单元格列索引
}

// 表格数据结构
export interface TableData {
  rows: number             // 总行数
  cols: number             // 总列数
  cells: TableCell[][]     // 二维单元格数组
}

// 单元格位置
export interface CellPosition {
  row: number
  col: number
}

// 单元格范围（用于选择多个单元格）
export interface CellRange {
  start: CellPosition
  end: CellPosition
}

// 表格操作类型
export type TableOperation =
  | 'merge'      // 合并单元格
  | 'split'      // 拆分单元格
  | 'insertRow'  // 插入行
  | 'deleteRow'  // 删除行
  | 'insertCol'  // 插入列
  | 'deleteCol'  // 删除列
  | 'editCell'   // 编辑单元格

// 表格编辑器模式
export type TableEditorMode = 'visual' | 'source' | 'preview'

// 表格编辑器配置
export interface TableEditorConfig {
  mode?: TableEditorMode
  editable?: boolean
  showToolbar?: boolean
  maxRows?: number
  maxCols?: number
}

// 表格解析选项
export interface TableParseOptions {
  preserveStyles?: boolean    // 是否保留样式
  preserveClasses?: boolean   // 是否保留CSS类
  handleSuperscript?: boolean // 是否处理上标
}

// 表格生成选项
export interface TableGenerateOptions {
  compact?: boolean           // 是否生成紧凑的HTML
  includeColgroup?: boolean   // 是否包含colgroup
}

// 表格验证结果
export interface TableValidationResult {
  valid: boolean
  errors?: string[]
  warnings?: string[]
}

// 表格历史记录操作
export interface TableHistoryAction {
  type: string
  before: TableData
  after: TableData
  timestamp: number
  metadata?: Record<string, unknown>
}
