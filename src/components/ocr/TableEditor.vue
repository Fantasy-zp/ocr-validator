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
                      @keydown.enter.prevent="handleEnterKey"
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
      </el-text>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Connection,
  Scissor,
  Top,
  Bottom,
  Back,
  Right,
  DeleteFilled,
  Switch
} from '@element-plus/icons-vue'
import { TableParser } from '@/utils/tableParser'
import type { TableData, CellPosition, CellRange, TableEditorMode } from '@/types/table'

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
      tableData.value = TableParser.parseHTMLToTableData(html, { handleSuperscript: true })
    }
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
  }
}

const emitUpdate = () => {
  const html = TableParser.generateHTMLFromTableData(tableData.value)
  emit('update', html)
}

const selectCell = (row: number, col: number) => {
  // 如果不是在拖拽，清除范围选择
  if (!isDragging.value) {
    selectedCell.value = { row, col }
    selectedRange.value = null
  }
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
    input.focus()
    input.select()
  }
}

const finishEdit = () => {
  if (editingCell.value) {
    const { row, col } = editingCell.value
    tableData.value.cells[row][col].content = editingContent.value
    editingCell.value = null
    editingContent.value = ''
    emitUpdate()
    // 强制触发更新，确保父组件能接收到变化
    tableData.value = { ...tableData.value }
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

  // 开始拖拽
  isDragging.value = true
  dragStart.value = { row, col }
  dragEnd.value = { row, col }

  // 阻止文本选择
  event.preventDefault()
}

const handleCellMouseEnter = (row: number, col: number) => {
  if (isDragging.value && dragStart.value) {
    dragEnd.value = { row, col }
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
  tableData.value = TableParser.mergeCells(
    tableData.value,
    start.row,
    start.col,
    end.row,
    end.col
  )

  selectedRange.value = null
  emitUpdate()
  ElMessage.success('单元格已合并')
}

const handleSplitCell = () => {
  if (!selectedCell.value) return

  const { row, col } = selectedCell.value
  const cell = tableData.value.cells[row][col]

  if (cell.isVirtual) {
    ElMessage.warning('无法拆分虚拟单元格')
    return
  }

  tableData.value = TableParser.splitCell(tableData.value, row, col)
  emitUpdate()
  ElMessage.success('单元格已拆分')
}

const handleInsertRow = (before: boolean) => {
  if (!selectedCell.value) return

  const position = selectedCell.value.row
  tableData.value = TableParser.insertRow(tableData.value, position, before)
  emitUpdate()
  ElMessage.success(`已在${before ? '上方' : '下方'}插入行`)
}

const handleDeleteRow = () => {
  if (!selectedCell.value) return

  if (tableData.value.rows <= 1) {
    ElMessage.warning('不能删除最后一行')
    return
  }

  tableData.value = TableParser.deleteRow(tableData.value, selectedCell.value.row)
  selectedCell.value = null
  selectedRange.value = null
  emitUpdate()
  ElMessage.success('行已删除')
}

const handleInsertColumn = (before: boolean) => {
  if (!selectedCell.value) return

  const position = selectedCell.value.col
  tableData.value = TableParser.insertColumn(tableData.value, position, before)
  emitUpdate()
  ElMessage.success(`已在${before ? '左侧' : '右侧'}插入列`)
}

const handleDeleteColumn = () => {
  if (!selectedCell.value) return

  if (tableData.value.cols <= 1) {
    ElMessage.warning('不能删除最后一列')
    return
  }

  tableData.value = TableParser.deleteColumn(tableData.value, selectedCell.value.col)
  selectedCell.value = null
  selectedRange.value = null
  emitUpdate()
  ElMessage.success('列已删除')
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
  // 如果正在编辑，不处理导航键
  if (editingCell.value) return

  if (!selectedCell.value) return

  const { row, col } = selectedCell.value

  switch (e.key) {
    case 'ArrowUp':
      if (row > 0) {
        selectCell(row - 1, col)
        e.preventDefault()
      }
      break
    case 'ArrowDown':
      if (row < tableData.value.rows - 1) {
        selectCell(row + 1, col)
        e.preventDefault()
      }
      break
    case 'ArrowLeft':
      if (col > 0) {
        selectCell(row, col - 1)
        e.preventDefault()
      }
      break
    case 'ArrowRight':
      if (col < tableData.value.cols - 1) {
        selectCell(row, col + 1)
        e.preventDefault()
      }
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
        // 清空单元格内容
        tableData.value.cells[row][col].content = ''
        emitUpdate()
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
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyboard)
  document.removeEventListener('mouseup', handleGlobalMouseUp)
})

// 监听HTML变化
watch(() => props.html, (newHTML) => {
  if (newHTML !== currentHTML.value) {
    parseHTML(newHTML)
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
