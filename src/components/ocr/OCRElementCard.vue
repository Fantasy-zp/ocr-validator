<template>
  <div class="element-card" :class="{
    'selected': isSelected,
    [`type-${element.category_type}`]: true
  }" @click="$emit('click')">
    <div class="card-header">
      <div class="header-left">
        <span class="element-index">[{{ index }}]</span>
        <el-tag :type="getTypeTagColor(element.category_type)" size="small">
          {{ element.category_type }}
        </el-tag>
        <span class="element-order">顺序: {{ element.order }}</span>
      </div>

      <div class="header-actions">
        <el-button text :icon="Edit" size="small" @click.stop="handleEdit" />
        <el-button text :icon="Delete" size="small" type="danger" @click.stop="$emit('delete')" />
      </div>
    </div>

    <div class="card-content">
      <!-- 预览模式 -->
      <div v-if="viewMode === 'preview'" class="content-rendered">
        <div v-if="element.html" v-html="element.html" class="html-content"></div>
        <div v-else-if="element.text" class="text-content">{{ element.text }}</div>
        <div v-else class="empty-content">（无内容）</div>
      </div>

      <!-- 编辑模式 -->
      <div v-else-if="viewMode === 'edit'" class="content-original">
        <pre class="original-text">{{ element.text || element.html || '（无内容）' }}</pre>
      </div>
    </div>

    <div class="card-footer">
      <span class="coord-info">
        坐标: [{{ element.poly.join(', ') }}]
      </span>
    </div>
  </div>

  <!-- 编辑对话框 -->
  <el-dialog v-model="editDialogVisible" title="编辑元素" width="600px">
    <el-form :model="editForm" label-width="100px">
      <el-form-item label="类型">
        <el-select v-model="editForm.category_type" placeholder="Select type">
          <el-option label="title" value="title" />
          <el-option label="text" value="text" />
          <el-option label="footnote" value="footnote" />
          <el-option label="chart_caption" value="chart_caption" />
          <el-option label="chart" value="chart" />
          <el-option label="chart_footnote" value="chart_footnote" />
          <el-option label="table_caption" value="table_caption" />
          <el-option label="table" value="table" />
          <el-option label="table_footnote" value="table_footnote" />
          <el-option label="page_footnote" value="page_footnote" />
          <el-option label="figure_caption" value="figure_caption" />
          <el-option label="figure" value="figure" />
          <el-option label="figure_footnote" value="figure_footnote" />
        </el-select>
      </el-form-item>

      <el-form-item label="顺序">
        <el-input-number v-model="editForm.order" :min="0" />
      </el-form-item>

      <el-form-item label="坐标">
        <div class="coord-pairs">
          <div class="coord-pair">
            <!-- <span class="coord-label">左上 (x1,y1):</span> -->
            <div class="coord-input-group">
              <span class="coord-input-label">x1: </span>
              <el-input-number v-model="editForm.poly[0]" :min="0" />
              <span class="coord-input-label"> y1: </span>
              <el-input-number v-model="editForm.poly[1]" :min="0" />
            </div>
          </div>
          <div class="coord-pair">
            <!-- <span class="coord-label">右下 (x2,y2):</span> -->
            <div class="coord-input-group">
              <span class="coord-input-label">x2: </span>
              <el-input-number v-model="editForm.poly[2]" :min="0" />
              <span class="coord-input-label"> y2: </span>
              <el-input-number v-model="editForm.poly[3]" :min="0" />
            </div>
          </div>
        </div>
      </el-form-item>

      <el-form-item label="内容" v-if="editForm.category_type === 'table'">
        <el-input v-model="editForm.html" type="textarea" :rows="6" placeholder="输入HTML内容" />
      </el-form-item>

      <el-form-item label="内容" v-else>
        <el-input v-model="editForm.text" type="textarea" :rows="6" placeholder="输入文本内容" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="editDialogVisible = false">取消</el-button>
      <el-button type="primary" @click="confirmEdit">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { Edit, Delete } from '@element-plus/icons-vue'
import type { LayoutElement, ElementType } from '@/types'

const props = defineProps<{
  element: LayoutElement
  index: number
  viewMode: 'edit' | 'preview'
  isSelected: boolean
}>()

const emit = defineEmits<{
  click: []
  edit: [element: Partial<LayoutElement>]
  delete: []
}>()

// 编辑对话框
const editDialogVisible = ref(false)
const editForm = reactive<{
  category_type: ElementType
  text: string
  html: string
  order: number
  poly: [number, number, number, number]
}>({
  category_type: 'text',
  text: '',
  html: '',
  order: 0,
  poly: [0, 0, 0, 0]
})

// 获取类型标签颜色
const getTypeTagColor = (type: ElementType) => {
  const colorMap: Record<ElementType, string> = {
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
  return colorMap[type] || ''
}

// 处理编辑
const handleEdit = () => {
  editForm.category_type = props.element.category_type
  editForm.text = props.element.text || ''
  editForm.html = props.element.html || ''
  editForm.order = props.element.order
  // 确保poly始终是一个包含4个数字的元组
  const originalPoly = props.element.poly || [0, 0, 0, 0]
  editForm.poly[0] = originalPoly[0] || 0
  editForm.poly[1] = originalPoly[1] || 0
  editForm.poly[2] = originalPoly[2] || 0
  editForm.poly[3] = originalPoly[3] || 0
  editDialogVisible.value = true
}

// 确认编辑
const confirmEdit = () => {
  const updates: Partial<LayoutElement> = {
    category_type: editForm.category_type as ElementType,
    order: editForm.order,
    // 确保poly是一个包含4个数字的元组
    poly: [editForm.poly[0], editForm.poly[1], editForm.poly[2], editForm.poly[3]]
  }

  if (editForm.category_type === 'table') {
    updates.html = editForm.html
    updates.text = undefined
  } else {
    updates.text = editForm.text
    updates.html = undefined
  }

  emit('edit', updates)
  editDialogVisible.value = false
}
</script>

<style lang="scss" scoped>
.element-card {
  background: white;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 2px solid transparent;

  &:hover {
    box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
    transform: translateY(-2px);
  }

  &.selected {
    border-color: #409eff;
    background: #ecf5ff;
  }

  &.type-text {
    border-left: 4px solid #409eff;
  }

  // 标题类型 - 红色系
  &.type-title {
    border-left: 4px solid #f56c6c;
    background-color: rgba(245, 108, 108, 0.05);
    border-radius: 4px;
  }

  // 正文类型 - 蓝色系
  &.type-text {
    border-left: 4px solid #409eff;
    background-color: rgba(64, 158, 255, 0.05);
    border-radius: 4px;
  }

  // 脚注类型 - 深蓝色系
  &.type-footnote,
  &.type-page-footnote {
    border-left: 4px solid #66b1ff;
    background-color: rgba(102, 177, 255, 0.05);
    border-radius: 4px;
  }

  // 图表相关类型
  &.type-chart {
    border-left: 4px solid #909399;
    background-color: rgba(144, 147, 153, 0.05);
    border-radius: 4px;
  }
  
  &.type-chart_caption,
  &.type-chart-caption {
    border-left: 4px solid #722ed1;
    background-color: rgba(114, 46, 209, 0.05);
    border-radius: 4px;
  }
  
  &.type-chart_footnote,
  &.type-chart-footnote {
    border-left: 4px solid #9254de;
    background-color: rgba(146, 84, 222, 0.05);
    border-radius: 4px;
  }

  // 表格相关类型
  &.type-table {
    border-left: 4px solid #67c23a;
    background-color: rgba(103, 194, 58, 0.05);
    border-radius: 4px;
  }
  
  &.type-table_caption,
  &.type-table-caption {
    border-left: 4px solid #e6a23c;
    background-color: rgba(230, 162, 60, 0.05);
    border-radius: 4px;
  }
  
  &.type-table_footnote,
  &.type-table-footnote {
    border-left: 4px solid #fadb14;
    background-color: rgba(250, 219, 20, 0.05);
    border-radius: 4px;
  }

  // 图片/图形相关类型
  &.type-figure {
    border-left: 4px solid #13c2c2;
    background-color: rgba(19, 194, 194, 0.05);
    border-radius: 4px;
  }
  
  &.type-figure_caption,
  &.type-figure-caption {
    border-left: 4px solid #52c41a;
    background-color: rgba(82, 196, 26, 0.05);
    border-radius: 4px;
  }
  
  &.type-figure_footnote,
  &.type-figure-footnote {
    border-left: 4px solid #fa8c16;
    background-color: rgba(250, 140, 22, 0.05);
    border-radius: 4px;
  }

  // 选中状态增强
  &.selected {
    box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.5);
    transform: translateY(-1px);
    transition: all 0.2s ease;
  }

  // 悬浮效果
  &:hover {
    box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
    transform: translateY(-1px);
    transition: all 0.2s ease;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;

    .header-left {
      display: flex;
      align-items: center;
      gap: 8px;

      .element-index {
        background: #909399;
        color: white;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 12px;
        font-weight: bold;
      }

      .element-order {
        font-size: 12px;
        color: #909399;
      }
    }

    .header-actions {
      display: flex;
      gap: 4px;
    }
  }

  .card-content {
    margin: 12px 0;

    .content-rendered {
      .html-content {
        :deep(table) {
          width: 100%;
          border-collapse: collapse;

          th,
          td {
            border: 1px solid #dcdfe6;
            padding: 6px;
            font-size: 13px;
          }

          th {
            background: #f5f7fa;
          }
        }
      }

      .text-content {
        font-size: 14px;
        line-height: 1.6;
        color: #303133;
      }

      .empty-content {
        color: #c0c4cc;
        font-style: italic;
      }
    }

    .content-original,
    .content-json {
      pre {
        margin: 0;
        padding: 8px;
        background: #f5f5f5;
        border-radius: 4px;
        font-size: 12px;
        font-family: 'Courier New', monospace;
        white-space: pre-wrap;
        word-break: break-all;
        max-height: 200px;
        overflow-y: auto;
      }
    }
  }

  .card-footer {
    font-size: 12px;
    color: #909399;

    .coord-info {
      font-family: 'Courier New', monospace;
    }
  }

  .coord-pairs {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .coord-pair {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .coord-label {
    font-size: 14px;
    color: #606266;
    min-width: 80px;
  }

  .coord-input-group {
    display: flex;
    align-items: center;
    gap: 5px;
    flex: 1;
  }

  .coord-input-label {
    font-size: 14px;
    color: #606266;
    min-width: 20px;
  }

  .coord-input-group .el-input-number {
    width: 100px;
  }
}
</style>
