<template>
  <div class="table-editor">
    <!-- 工具栏 -->
    <div class="editor-toolbar" v-if="showToolbar">
      <el-button-group>
        <el-button size="small" @click="handleMergeCells" :disabled="!canMerge">
          <el-icon><Connection /></el-icon>
          合并单元格
        </el-button>
        <el-button size="small" @click="handleSplitCell" :disabled="!canSplit">
          <el-icon><Scissor /></el-icon>
          拆分单元格
        </el-button>
      </el-button-group>

      <el-divider direction="vertical" />

      <el-button-group>
        <el-button size="small" @click="handleInsertRow(true)" :disabled="!selectedCell">
          <el-icon><Top /></el-icon>
          插入行(上)
        </el-button>
        <el-button size="small" @click="handleInsertRow(false)" :disabled="!selectedCell">
          <el-icon><Bottom /></el-icon>
          插入行(下)
        </el-button>
        <el-button size="small" @click="handleDeleteRow" :disabled="!selectedCell || tableData.rows <= 1">
          <el-icon><DeleteFilled /></el-icon>
          删除行
        </el-button>
      </el-button-group>

      <el-divider direction="vertical" />

      <el-button-group>
        <el-button size="small" @click="handleInsertColumn(true)" :disabled="!selectedCell">
          <el-icon><Back /></el-icon>
          插入列(左)
        </el-button>
        <el-button size="small" @click="handleInsertColumn(false)" :disabled="!selectedCell">
          <el-icon><Right /></el-icon>
          插入列(右)
        </el-button>
        <el-button size="small" @click="handleDeleteColumn" :disabled="!selectedCell || tableData.cols <= 1">
          <el-icon><DeleteFilled /></el-icon>
          删除列
        </el-button>
      </el-button-group>

      <el-divider direction="vertical" />

      <el-button-group>
        <el-button size="small" @click="undo" :disabled="!canUndo">
          撤销
        </el-button>
        <el-button size="small" @click="redo" :disabled="!canRedo">
          重做
        </el-button>
      </el-button-group>

      <el-divider direction="vertical" />

      <el-button size="small" @click="manualSave">
        保存
      </el-button>

      <el-divider direction="vertical" />

      <el-button size="small" @click="toggleMode">
        <el-icon><Switch /></el-icon>
        {{ mode === 'visual' ? '源码模式' : '可视化模式' }}
      </el-button>
    </div>

    <!-- 编辑区域 -->
    <div class="editor-content">
      <!-- 可视化模式 -->
      <div v-if="mode === 'visual'" class="visual-editor">
        <div class="table-wrapper">
          <table class="editable-table" @mousedown="handleTableMouseDown" @mouseleave="handleTableMouseLeave">
            <tr v-for="(row, rowIndex) in tableData.cells" :key="rowIndex">
              <template v-for="(cell, colIndex) in row" :key="`${rowIndex}-${colIndex}`">
                <td
                  v-if="!cell.isVirtual"
                  :rowspan="cell.rowspan"
                  :colspan="cell.colspan"
                  :class="getCellClass(rowIndex, colIndex)"
                  :data-row="rowIndex"
                  :data-col="colIndex"
                  @click="selectCell(rowIndex, colIndex)"
                  @dblclick="startEdit(rowIndex, colIndex)"
                  @mousedown.stop="handleCellMouseDown(rowIndex, colIndex, $event)"
                  @mouseenter="handleCellMouseEnter(rowIndex, colIndex)"
                  @mouseup="handleCellMouseUp"
                  style="user-select: text;"
                >
                  <div v-if="isEditing(rowIndex, colIndex)" class="cell-editor">
                    <input
                      v-model="editingContent"
                      type="text"
                      class="cell-input"
                      @blur="finishEdit"
                      @keyup.enter.prevent="handleEnterKey"
                      @keydown.esc.prevent="cancelEdit"
                      :id="`cell-input-${rowIndex}-${colIndex}`"
                      placeholder="输入内容..."
                    />
                    <div class="edit-hint">Enter 保存 | Esc 取消</div>
                  </div>
                  <div v-else class="cell-content" v-html="cell.content || '&nbsp;'"></div>
                </td>
              </template>
            </tr>
          </table>
        </div>

        <!-- 提示信息 -->
        <div class="editor-tips">
          <el-text type="info" size="small">
            提示：单击选择单元格，双击编辑内容，按住鼠标拖拽选择多个单元格进行合并
          </el-text>
        </div>
      </div>

      <!-- 源码模式 -->
      <div v-else-if="mode === 'source'" class="source-editor">
        <el-input
          v-model="sourceHTML"
          type="textarea"
          :rows="15"
          placeholder="输入HTML表格代码..."
          @change="handleSourceChange"
        />
      </div>

      <!-- 预览模式 -->
      <div v-else-if="mode === 'preview'" class="preview-editor">
        <div class="preview-content" v-html="currentHTML"></div>
      </div>
    </div>

    <!-- 状态栏 -->
    <div class="editor-status">
      <el-text size="small">
        表格: {{ tableData.rows }} 行 × {{ tableData.cols }} 列
        <template v-if="selectedCell">
          | 选中: [{{ selectedCell.row + 1 }}, {{ selectedCell.col + 1 }}]
        </template>
        <template v-if="selectedRange">
          | 范围: {{ getRangeDescription() }}
        </template>
        <template v-if="validationStatus">
          | 状态: <span :class="{ 'text-success': validationStatus.valid, 'text-danger': !validationStatus.valid }">
            {{ validationStatus.valid ? '有效' : '无效' }}
          </span>
        </template>
        <template v-if="lastAutoSaveTime">
          | 自动保存: {{ formatAutoSaveTime(lastAutoSaveTime) }}
        </template>
        <template v-if="history.length > 0">
          | 历史: {{ historyIndex + 1 }}/{{ history.length }}
        </template>
      </el-text>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Connection, Scissor, Top, Bottom, Back, Right, DeleteFilled, Switch } from '@element-plus/icons-vue'
import { TableParser } from '@/utils/tableParser'
import { TableDataEnhancer } from '@/utils/tableDataEnhancer'
import type { TableData, CellPosition, CellRange, TableEditorMode, TableHistoryAction, TableValidationResult } from '@/types/table'

const props = withDefaults(defineProps<{
  html: string
  showToolbar?: boolean
  editable?: boolean
}>(), {
  editable: true
})

const emit = defineEmits<{
  update: [html: string]
}>()

// 编辑器模式
const mode = ref<TableEditorMode>('visual')

// 表格数据
const tableData = ref<TableData>({ rows: 0, cols: 0, cells: [] })

// 源码模式的HTML
const sourceHTML = ref('')

// 选中的单元格
const selectedCell = ref<CellPosition | null>(null)

// 选中的范围
const selectedRange = ref<CellRange | null>(null)

// 编辑状态
const editingCell = ref<CellPosition | null>(null)
const editingContent = ref('')

// 拖拽选择状态
const isDragging = ref(false)
const dragStart = ref<CellPosition | null>(null)
const dragEnd = ref<CellPosition | null>(null)

// 数据可靠性增强相关状态
const history = ref<TableHistoryAction[]>([])
const historyIndex = ref(-1)
const validationStatus = ref<TableValidationResult | null>(null)
const lastAutoSaveTime = ref<Date | null>(null)
const autoSaveInterval = ref<number | null>(null)
const maxHistoryLength = 30
const saveStorageKey = ref(`table-editor-${Date.now()}`) // 使用时间戳确保唯一性

// 计算属性
  const currentHTML = computed(() => {
    return TableParser.generateHTMLFromTableData(tableData.value)
  })

  const canMerge = computed(() => {
    if (!selectedRange.value) return false
    const { start, end } = selectedRange.value
    // 至少选择2个单元格才能合并
    return !(start.row === end.row && start.col === end.col)
  })

  const canUndo = computed(() => {
    return historyIndex.value >= 0
  })

  const canRedo = computed(() => {
    return historyIndex.value < history.value.length - 1
  })



const canSplit = computed(() => {
  if (!selectedCell.value) return false
  const cell = tableData.value.cells[selectedCell.value.row][selectedCell.value.col]
  return !cell.isVirtual && (cell.rowspan > 1 || cell.colspan > 1)
})

// 方法
const parseHTML = (html: string) => {
  try {
    if (!html || html.trim() === '') {
      // 如果没有HTML，创建一个默认的空表格
      tableData.value = {
        rows: 3,
        cols: 3,
        cells: Array(3).fill(null).map(() =>
          Array(3).fill(null).map(() => ({
            content: '',
            rowspan: 1,
            colspan: 1,
            isVirtual: false
          }))
        )
      }
    } else {
      // 尝试修复可能的问题
      try {
        tableData.value = TableParser.parseHTMLToTableData(html, { handleSuperscript: true })
      } catch (parseError) {
        console.warn('初始解析失败，尝试修复HTML:', parseError)
        // 简单的HTML修复尝试
        const fixedHtml = html
          .replace(/<table[^>]*>/i, '<table>')
          .replace(/<\/?tbody>/gi, '')
          .replace(/<\/?thead>/gi, '')
          .replace(/<\/?tr[^>]*>/gi, (match) => match.replace(/[^>]*>/, '>'))
          .replace(/<\/?td[^>]*>/gi, (match) => {
            // 只保留rowspan和colspan属性
            const rowspan = match.match(/rowspan="(\d+)"/i)?.[1] || '1'
            const colspan = match.match(/colspan="(\d+)"/i)?.[1] || '1'
            return match.startsWith('</') ? '</td>' : `<td rowspan="${rowspan}" colspan="${colspan}">`
          })
        
        // 再次尝试解析
        tableData.value = TableParser.parseHTMLToTableData(fixedHtml, { handleSuperscript: true })
      }
    }
    
    // 验证解析后的数据
    validateTableData()
    
    sourceHTML.value = html
  } catch (error) {
    console.error('解析HTML失败:', error)
    ElMessage.error('表格解析失败，创建默认表格')
    // 创建默认表格
    tableData.value = {
      rows: 3,
      cols: 3,
      cells: Array(3).fill(null).map(() =>
        Array(3).fill(null).map(() => ({
          content: '',
          rowspan: 1,
          colspan: 1,
          isVirtual: false
        }))
      )
    }
    validateTableData()
  }
}

const emitUpdate = () => {
  // 验证数据后再更新
  if (!validateTableData()) {
    // 数据无效时尝试修复
    const repairedData = TableDataEnhancer.tryRepairTableData(tableData.value)
    if (repairedData) {
      tableData.value = repairedData
      validateTableData()
    }
  }
  
  const html = TableParser.generateHTMLFromTableData(tableData.value)
  emit('update', html)
  
  // 触发自动保存
  scheduleAutoSave()
}

const selectCell = (row: number, col: number) => {
  // 如果不是在拖拽，清除范围选择
  if (!isDragging.value) {
    selectedCell.value = { row, col }
    selectedRange.value = null
  }
}

/**
 * 格式化自动保存时间
 */
const formatAutoSaveTime = (date: Date | null): string => {
  if (!date) return ''
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
}

const startEdit = async (row: number, col: number) => {
  if (props.editable === false) return

  const cell = tableData.value.cells[row][col]
  if (cell.isVirtual) return

  editingCell.value = { row, col }
  editingContent.value = cell.content

  // 使用nextTick确保DOM更新后再聚焦
  await nextTick()
  const input = document.getElementById(`cell-input-${row}-${col}`) as HTMLInputElement
  if (input) {
    // 自动调整输入框大小以适应内容
    adjustInputSize(input, cell.content)
    input.focus()
    input.select()
  }
}

// 自动调整输入框大小以适应内容
const adjustInputSize = (input: HTMLInputElement, content: string) => {
  // 创建临时元素来测量文本宽度
  const tempSpan = document.createElement('span')
  tempSpan.style.visibility = 'hidden'
  tempSpan.style.position = 'absolute'
  tempSpan.style.whiteSpace = 'nowrap'
  tempSpan.style.fontSize = getComputedStyle(input).fontSize
  tempSpan.style.fontFamily = getComputedStyle(input).fontFamily
  tempSpan.textContent = content
  
  document.body.appendChild(tempSpan)
  const width = tempSpan.offsetWidth + 20 // 增加一些边距
  document.body.removeChild(tempSpan)
  
  // 设置最小和最大宽度
  input.style.width = `${Math.max(60, Math.min(500, width))}px`
}

// 添加防抖函数
const debounce = <T extends (...args: unknown[]) => unknown>(func: T, wait: number) => {
  let timeout: ReturnType<typeof setTimeout> | null = null
  return function(this: unknown, ...args: Parameters<T>) {
    if (timeout) {
      clearTimeout(timeout)
    }
    timeout = setTimeout(() => {
      func.apply(this, args)
      timeout = null
    }, wait)
  }
}

/**
 * 验证表格数据
 * @returns 数据是否有效
 */
const validateTableData = (): boolean => {
  try {
    const result = TableDataEnhancer.validateTableData(tableData.value)
    validationStatus.value = result
    
    if (!result.valid && result.errors?.length) {
      console.warn('表格数据验证失败:', result.errors)
      // 只显示第一条错误
      ElMessage({ 
        message: `表格验证警告: ${result.errors[0]}`, 
        type: 'warning',
        duration: 5000
      })
    } else if (result.warnings?.length) {
      console.warn('表格数据验证警告:', result.warnings)
      // 可以选择是否显示警告
    }
    
    return result.valid
  } catch (error) {
    console.error('验证表格数据失败:', error)
    validationStatus.value = { valid: false, errors: ['验证过程出错'] }
    return false
  }
}

/**
 * 执行表格操作并记录历史
 * @param operation 操作函数
 * @param type 操作类型
 * @param metadata 操作元数据
 */
const executeTableOperation = (
  operation: (data: TableData) => TableData,
  type: string,
  metadata: Record<string, unknown> = {}
): boolean => {
  try {
    // 保存操作前的状态
    const beforeState = TableDataEnhancer.createSnapshot(tableData.value)
    
    // 执行操作
    const result = TableDataEnhancer.executeBatchOperations(tableData.value, [operation])
    
    if (!result.success) {
      ElMessage.error(`操作失败: ${result.error}`)
      return false
    }
    
    // 更新表格数据
    tableData.value = result.data
    
    // 添加历史记录
    const action = TableDataEnhancer.createHistoryAction(
      type,
      beforeState,
      TableDataEnhancer.createSnapshot(tableData.value),
      metadata
    )
    
    // 添加到历史记录
    if (historyIndex.value < history.value.length - 1) {
      history.value.splice(historyIndex.value + 1)
    }
    history.value.push(action)
    historyIndex.value++
    
    // 限制历史记录长度
    if (history.value.length > maxHistoryLength) {
      history.value.shift()
      historyIndex.value--
    }
    
    return true
  } catch (err) {
      console.error(`执行${type}操作失败:`, err)
      ElMessage.error(`执行操作失败: ${err instanceof Error ? err.message : '未知错误'}`)
      return false
    }
}

/**
 * 撤销操作
 */
const undo = (): void => {
  if (!canUndo.value) return
  
  try {
    const action = history.value[historyIndex.value]
    tableData.value = TableDataEnhancer.executeHistoryAction(action, 'undo')
    historyIndex.value--
    emitUpdate()
    ElMessage.success('已撤销操作')
  } catch (error) {
    console.error('撤销操作失败:', error)
    ElMessage.error('撤销操作失败')
  }
}

/**
 * 重做操作
 */
const redo = (): void => {
  if (!canRedo.value) return
  
  try {
    historyIndex.value++
    const action = history.value[historyIndex.value]
    tableData.value = TableDataEnhancer.executeHistoryAction(action, 'redo')
    emitUpdate()
    ElMessage.success('已重做操作')
  } catch (error) {
    console.error('重做操作失败:', error)
    ElMessage.error('重做操作失败')
  }
}

/**
 * 自动保存
 */
const autoSave = (): void => {
  try {
    const saveData = TableDataEnhancer.exportTableData(tableData.value)
    localStorage.setItem(saveStorageKey.value, saveData)
    lastAutoSaveTime.value = new Date()
    console.log('表格数据已自动保存')
  } catch (error) {
    console.error('自动保存失败:', error)
  }
}

/**
 * 计划自动保存
 */
const scheduleAutoSave = (): void => {
  if (autoSaveInterval.value) {
    clearTimeout(autoSaveInterval.value)
  }
  
  // 5秒后自动保存
  autoSaveInterval.value = window.setTimeout(() => {
    autoSave()
  }, 5000)
}

/**
 * 手动保存
 */
const manualSave = async (): Promise<void> => {
  try {
    await ElMessageBox.confirm(
      '确定要保存当前表格数据吗？\n保存后可在下次打开时恢复。',
      '保存确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'info'
      }
    )
    
    autoSave()
    ElMessage.success('表格数据已保存')
  } catch {
    // 用户取消保存
  }
}
        
const finishEdit = () => {
  if (editingCell.value) {
    const { row, col } = editingCell.value
    tableData.value.cells[row][col].content = editingContent.value
    editingCell.value = null
    editingContent.value = ''
    emitUpdate()
    
  }
}

const handleEnterKey = () => {
  // 添加显式的日志，帮助调试
  console.log('Enter key pressed, finishing edit')
  finishEdit()
}

const cancelEdit = () => {
  editingCell.value = null
  editingContent.value = ''
}

const isEditing = (row: number, col: number) => {
  return editingCell.value?.row === row && editingCell.value?.col === col
}

const getCellClass = (row: number, col: number) => {
  const classes = ['table-cell']

  // 单选中
  if (selectedCell.value?.row === row && selectedCell.value?.col === col && !selectedRange.value) {
    classes.push('selected')
  }

  // 范围选中
  if (isInSelectedRange(row, col)) {
    classes.push('in-range')
  }

  // 拖拽中的范围
  if (isDragging.value && isInDragRange(row, col)) {
    classes.push('dragging')
  }

  return classes.join(' ')
}

const isInSelectedRange = (row: number, col: number) => {
  if (!selectedRange.value) return false

  const { start, end } = selectedRange.value
  const minRow = Math.min(start.row, end.row)
  const maxRow = Math.max(start.row, end.row)
  const minCol = Math.min(start.col, end.col)
  const maxCol = Math.max(start.col, end.col)

  return row >= minRow && row <= maxRow && col >= minCol && col <= maxCol
}

const isInDragRange = (row: number, col: number) => {
  if (!dragStart.value || !dragEnd.value) return false

  const minRow = Math.min(dragStart.value.row, dragEnd.value.row)
  const maxRow = Math.max(dragStart.value.row, dragEnd.value.row)
  const minCol = Math.min(dragStart.value.col, dragEnd.value.col)
  const maxCol = Math.max(dragStart.value.col, dragEnd.value.col)

  return row >= minRow && row <= maxRow && col >= minCol && col <= maxCol
}

// 鼠标拖拽处理
const handleCellMouseDown = (row: number, col: number, event: MouseEvent) => {
  // 如果是右键，不处理
  if (event.button !== 0) return

  // 忽略虚拟单元格的拖拽
  const cell = tableData.value.cells[row][col]
  if (cell.isVirtual) {
    return
  }

  // 开始拖拽
  isDragging.value = true
  dragStart.value = { row, col }
  dragEnd.value = { row, col }

  // 阻止文本选择和默认行为
  event.preventDefault()
  event.stopPropagation()
}

const handleCellMouseEnter = (row: number, col: number) => {
  if (isDragging.value && dragStart.value) {
    // 确保拖拽范围在有效单元格内
    const cell = tableData.value.cells[row][col]
    if (!cell.isVirtual) {
      dragEnd.value = { row, col }
    }
  }
}

const handleCellMouseUp = () => {
  if (isDragging.value && dragStart.value && dragEnd.value) {
    // 设置选择范围
    selectedRange.value = {
      start: dragStart.value,
      end: dragEnd.value
    }

    // 设置选中的单元格为起始单元格
    selectedCell.value = dragStart.value
  }

  // 重置拖拽状态
  isDragging.value = false
  dragStart.value = null
  dragEnd.value = null
}

const handleTableMouseDown = (event: MouseEvent) => {
  // 如果点击的不是单元格，清除选择
  const target = event.target as HTMLElement
  if (target.tagName !== 'TD' && target.tagName !== 'TH') {
    selectedCell.value = null
    selectedRange.value = null
  }
}

const handleTableMouseLeave = () => {
  // 如果鼠标离开表格，结束拖拽
  if (isDragging.value) {
    handleCellMouseUp()
  }
}

const handleMergeCells = () => {
    if (!selectedRange.value) return

    const { start, end } = selectedRange.value
    
    // 验证合并操作是否有效
    const canMerge = validateMergeOperation(tableData.value, start, end)
    if (!canMerge) {
      ElMessage.warning('无法合并包含不可合并单元格的区域')
      return
    }

    const success = executeTableOperation(
      (data) => TableParser.mergeCells(
        data,
        start.row,
        start.col,
        end.row,
        end.col
      ),
      'merge_cells',
      {
        range: {
          startRow: start.row,
          startCol: start.col,
          endRow: end.row,
          endCol: end.col
        }
      }
    )
    
    if (success) {
      selectedRange.value = null
      emitUpdate()
      ElMessage.success('单元格已合并')
    }
  }

// 验证合并操作是否有效
const validateMergeOperation = (tableData: TableData, start: CellPosition, end: CellPosition): boolean => {
  const minRow = Math.min(start.row, end.row)
  const maxRow = Math.max(start.row, end.row)
  const minCol = Math.min(start.col, end.col)
  const maxCol = Math.max(start.col, end.col)

  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const cell = tableData.cells[r][c]
      // 如果范围内包含合并单元格，则无法合并
      if (!cell.isVirtual && (cell.rowspan > 1 || cell.colspan > 1)) {
        return false
      }
    }
  }
  return true
}

const handleSplitCell = () => {
    if (!selectedCell.value) return

    const { row, col } = selectedCell.value
    const cell = tableData.value.cells[row][col]

    if (cell.isVirtual) {
      ElMessage.warning('无法拆分虚拟单元格')
      return
    }

    const success = executeTableOperation(
      (data) => TableParser.splitCell(data, row, col),
      'split_cell',
      {
        position: { row, col },
        original: { rowspan: cell.rowspan, colspan: cell.colspan }
      }
    )
    
    if (success) {
      emitUpdate()
      ElMessage.success('单元格已拆分')
    }
  }

const handleInsertRow = (before: boolean) => {
    if (!selectedCell.value) return

    const position = selectedCell.value.row
    
    const success = executeTableOperation(
      (data) => TableParser.insertRow(data, position, before),
      'insert_row',
      { position, before }
    )
    
    if (success) {
      emitUpdate()
      ElMessage.success(`已在${before ? '上方' : '下方'}插入行`)
    }
  }

const handleDeleteRow = () => {
    if (!selectedCell.value) return

    if (tableData.value.rows <= 1) {
      ElMessage.warning('不能删除最后一行')
      return
    }

    const { row } = selectedCell.value
    
    const success = executeTableOperation(
      (data) => TableParser.deleteRow(data, row),
      'delete_row',
      { position: row }
    )
    
    if (success) {
      selectedCell.value = null
      selectedRange.value = null
      emitUpdate()
      ElMessage.success('行已删除')
    }
  }

const handleInsertColumn = (before: boolean) => {
    if (!selectedCell.value) return

    const position = selectedCell.value.col
    
    const success = executeTableOperation(
      (data) => TableParser.insertColumn(data, position, before),
      'insert_column',
      { position, before }
    )
    
    if (success) {
      emitUpdate()
      ElMessage.success(`已在${before ? '左侧' : '右侧'}插入列`)
    }
  }

const handleDeleteColumn = () => {
    if (!selectedCell.value) return

    if (tableData.value.cols <= 1) {
      ElMessage.warning('不能删除最后一列')
      return
    }

    const { col } = selectedCell.value
    
    const success = executeTableOperation(
      (data) => TableParser.deleteColumn(data, col),
      'delete_column',
      { position: col }
    )
    
    if (success) {
      selectedCell.value = null
      selectedRange.value = null
      emitUpdate()
      ElMessage.success('列已删除')
    }
  }

const toggleMode = () => {
  if (mode.value === 'visual') {
    sourceHTML.value = currentHTML.value
    mode.value = 'source'
  } else {
    // 从源码模式切换回来时，重新解析
    parseHTML(sourceHTML.value)
    mode.value = 'visual'
  }
}

const handleSourceChange = () => {
  parseHTML(sourceHTML.value)
  emitUpdate()
}

const getRangeDescription = () => {
  if (!selectedRange.value) return ''

  const { start, end } = selectedRange.value
  const rows = Math.abs(end.row - start.row) + 1
  const cols = Math.abs(end.col - start.col) + 1

  return `${rows} 行 × ${cols} 列`
}

// 键盘快捷键
const handleKeyboard = (e: KeyboardEvent) => {
  // 如果正在编辑，只处理特定按键
  if (editingCell.value) {
    return
  }

  // 检查是否是快捷键组合
  if (e.ctrlKey || e.metaKey) {
    switch (e.key.toLowerCase()) {
      case 'z':
        // Ctrl+Z 撤销
        e.preventDefault()
        undo()
        return
      case 'y':
        // Ctrl+Y 重做
        e.preventDefault()
        redo()
        return
      case 's':
        // Ctrl+S 保存
        e.preventDefault()
        manualSave()
        return
    }
  }

  if (!selectedCell.value) {
    // 如果没有选中单元格，按下Enter键选中第一个单元格
    if (e.key === 'Enter' && tableData.value.rows > 0 && tableData.value.cols > 0) {
      selectCell(0, 0)
      e.preventDefault()
    }
    return
  }

  const { row, col } = selectedCell.value
  const { rows, cols } = tableData.value

  switch (e.key) {
    case 'ArrowUp':
      // 支持循环导航到最后一行
      if (e.shiftKey && row === 0) {
        selectCell(rows - 1, col)
      } else if (row > 0) {
        selectCell(row - 1, col)
      }
      e.preventDefault()
      break
    case 'ArrowDown':
      // 支持循环导航到第一行
      if (e.shiftKey && row === rows - 1) {
        selectCell(0, col)
      } else if (row < rows - 1) {
        selectCell(row + 1, col)
      }
      e.preventDefault()
      break
    case 'ArrowLeft':
      // 支持循环导航到最后一列
      if (e.shiftKey && col === 0) {
        selectCell(row, cols - 1)
      } else if (col > 0) {
        selectCell(row, col - 1)
      }
      e.preventDefault()
      break
    case 'ArrowRight':
      // 支持循环导航到第一列
      if (e.shiftKey && col === cols - 1) {
        selectCell(row, 0)
      } else if (col < cols - 1) {
        selectCell(row, col + 1)
      }
      e.preventDefault()
      break
    case 'Enter':
      if (!editingCell.value) {
        startEdit(row, col)
        e.preventDefault()
      }
      break
    case 'Delete':
    case 'Backspace':
      if (!editingCell.value && selectedCell.value) {
        // 使用executeTableOperation来记录历史
        executeTableOperation(
          (data) => {
            const newData = TableDataEnhancer.createSnapshot(data)
            newData.cells[row][col].content = ''
            return newData
          },
          'clear_cell',
          { position: { row, col } }
        )
        e.preventDefault()
      }
      break
    case 'Escape':
      // 取消选择
      if (selectedCell.value || selectedRange.value) {
        selectedCell.value = null
        selectedRange.value = null
        e.preventDefault()
      }
      break
  }
}

// 全局鼠标事件处理
const handleGlobalMouseUp = () => {
  if (isDragging.value) {
    handleCellMouseUp()
  }
}

// 生命周期
onMounted(() => {
  parseHTML(props.html || '')
  document.addEventListener('keydown', handleKeyboard)
  document.addEventListener('mouseup', handleGlobalMouseUp)
  
  // 尝试从自动保存恢复数据
  try {
      const savedData = localStorage.getItem(saveStorageKey.value)
      if (savedData) {
        ElMessageBox.confirm(
          '检测到上次的自动保存数据，是否恢复？',
          '恢复数据',
          {
            confirmButtonText: '恢复',
            cancelButtonText: '跳过',
            type: 'info'
          }
        ).then(() => {
          const restoredData = TableDataEnhancer.importTableData(savedData)
          tableData.value = restoredData
          emitUpdate()
          ElMessage.success('已从自动保存恢复表格数据')
        }).catch(() => {
          // 用户选择跳过恢复
        })
      }
    } catch (error) {
      console.error('尝试恢复自动保存数据时出错:', error)
    }
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyboard)
  document.removeEventListener('mouseup', handleGlobalMouseUp)
  
  // 清除自动保存定时器
  if (autoSaveInterval.value) {
    clearTimeout(autoSaveInterval.value)
  }
  
  // 执行最终的自动保存
  autoSave()
})

// 监听HTML变化
  watch(() => props.html, (newHTML) => {
    if (newHTML !== currentHTML.value && newHTML) {
      try {
        const parsedData = TableParser.parseHTMLToTableData(newHTML, { handleSuperscript: true })
        if (parsedData) {
          // 验证解析的数据
          const validationResult = TableDataEnhancer.validateTableData(parsedData)
          
          if (validationResult.valid) {
            // 创建快照并添加历史记录
            const beforeState = TableDataEnhancer.createSnapshot(tableData.value)
            tableData.value = parsedData
            
            // 添加HTML更新的历史记录
            const action = TableDataEnhancer.createHistoryAction(
              'html_update',
              beforeState,
              TableDataEnhancer.createSnapshot(tableData.value),
              { source: 'external' }
            )
            
            history.value = [action] // 重置历史记录
            historyIndex.value = 0
            
            // 重置选择和编辑状态
            selectedCell.value = null
            selectedRange.value = null
            editingCell.value = null
            editingContent.value = ''
            
            validateTableData()
            sourceHTML.value = newHTML
          } else {
            // 数据无效时尝试修复
            const repairedData = TableDataEnhancer.tryRepairTableData(parsedData)
            if (repairedData) {
              tableData.value = repairedData
              validateTableData()
              selectedCell.value = null
              selectedRange.value = null
              editingCell.value = null
              editingContent.value = ''
              sourceHTML.value = newHTML
              ElMessage.warning('HTML解析后的数据已自动修复')
            } else {
              console.error('解析的HTML数据无效，无法修复:', validationResult.errors)
              ElMessage.error('解析HTML数据失败：数据格式无效')
            }
          }
        }
      } catch (error) {
        console.error('解析HTML失败:', error)
        ElMessage.error(`解析HTML失败：${error instanceof Error ? error.message : '未知错误'}`)
      }
    }
  })
</script>

<style lang="scss" scoped>
.table-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;

  .editor-toolbar {
    padding: 10px;
    background: #f5f7fa;
    border: 1px solid #e4e7ed;
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;

    .el-divider--vertical {
      height: 20px;
    }
  }

  .editor-content {
    flex: 1;
    overflow: auto;
    border: 1px solid #e4e7ed;
    border-radius: 4px;
    background: white;

    .visual-editor {
      padding: 20px;

      .table-wrapper {
        overflow: auto;

        .editable-table {
          border-collapse: collapse;
          width: 100%;
          user-select: none;

          td {
            border: 1px solid #dcdfe6;
            padding: 10px 12px;
            min-width: 80px;
            min-height: 40px;
            position: relative;
            cursor: pointer;
            transition: all 0.2s;
            user-select: text;
            font-size: 14px;

            &.selected {
              background-color: #ecf5ff !important;
              border-color: #409eff;
              box-shadow: inset 0 0 0 1px #409eff;
            }

            &.in-range {
              background-color: #f0f9ff;
              border-color: #66b1ff;
            }

            &.dragging {
              background-color: #e6f7ff;
              border-color: #40a9ff;
            }

            &:hover {
              background-color: #f5f7fa;
            }

            .cell-content {
              min-height: 20px;
              word-break: break-word;
              white-space: pre-wrap;

              :deep(sup) {
                vertical-align: super;
                font-size: smaller;
              }

              &:empty::before {
                content: '\00a0';
              }
            }

            .cell-editor {
              position: relative;

              .cell-input {
                width: 100%;
                padding: 4px 6px;
                border: 2px solid #409eff;
                border-radius: 2px;
                outline: none;
                font-size: 14px;
                background: white;
                box-shadow: 0 2px 8px rgba(64, 158, 255, 0.3);
                min-height: 28px;
              }

              .edit-hint {
                position: absolute;
                bottom: -22px;
                left: 0;
                font-size: 11px;
                color: #909399;
                white-space: nowrap;
                background: white;
                padding: 2px 4px;
                border: 1px solid #e4e7ed;
                border-radius: 2px;
                z-index: 10;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              }
            }
          }
        }
      }

      .editor-tips {
        margin-top: 10px;
        padding: 8px;
        background: #f5f7fa;
        border-radius: 4px;
      }
    }

    .source-editor {
      padding: 10px;
      height: 100%;

      :deep(.el-textarea) {
        height: 100%;

        .el-textarea__inner {
          height: 100%;
          font-family: 'Courier New', monospace;
        }
      }
    }

    .preview-editor {
      padding: 20px;

      .preview-content {
        :deep(table) {
          border-collapse: collapse;
          width: 100%;

          td, th {
            border: 1px solid #dcdfe6;
            padding: 8px;
          }

          th {
            background: #f5f7fa;
            font-weight: bold;
          }
        }
      }
    }
  }

  .editor-status {
    padding: 5px 10px;
    background: #f5f7fa;
    border: 1px solid #e4e7ed;
    border-radius: 4px;
  }
}
</style>
