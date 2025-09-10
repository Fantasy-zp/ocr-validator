/*
数据集样本类型
*/
export interface Sample {
  pdf_name_1: string
  pdf_name_2: string
  language: string
  md_elem_list_1: string[]
  md_elem_list_2: string[]
  merging_idx_pairs: number[][]
  original_pairs?: number[][]
}

// 视图模式类型
export type ViewMode = 'raw' | 'rendered'

// 编辑器状态类型
export interface EditorState {
  selectedLeft: number | null
  selectedRight: number | null
  leftViewMode: ViewMode
  rightViewMode: ViewMode
}

// 合并对类型
export type MergingPair = [number, number]
