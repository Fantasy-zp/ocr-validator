<template>
  <div
    class="element-card"
    :class="{
      'selected': isSelected,
      [`type-${element.category_type}`]: true
    }"
    @click="$emit('click')"
  >
    <div class="card-header">
      <div class="header-left">
        <span class="element-index">[{{ index }}]</span>
        <el-tag :type="getTypeTagColor(element.category_type)" size="small">
          {{ element.category_type }}
        </el-tag>
        <span class="element-order">顺序: {{ element.order }}</span>
      </div>

      <div class="header-actions">
        <el-button
          text
          :icon="Edit"
          size="small"
          @click.stop="handleEdit"
        />
        <el-button
          text
          :icon="Delete"
          size="small"
          type="danger"
          @click.stop="$emit('delete')"
        />
      </div>
    </div>

    <div class="card-content">
      <!-- 渲染模式 -->
      <div v-if="viewMode === 'rendered'" class="content-rendered">
        <div v-if="element.html" v-html="element.html" class="html-content"></div>
        <div v-else-if="element.text" class="text-content">{{ element.text }}</div>
        <div v-else class="empty-content">（无内容）</div>
      </div>

      <!-- 原始模式 -->
      <div v-else-if="viewMode === 'original'" class="content-original">
        <pre class="original-text">{{ element.text || element.html || '（无内容）' }}</pre>
      </div>

      <!-- JSON模式 -->
      <div v-else-if="viewMode === 'json'" class="content-json">
        <pre class="json-text">{{ JSON.stringify(element, null, 2) }}</pre>
      </div>
    </div>

    <div class="card-footer">
      <span class="coord-info">
        坐标: [{{ element.poly.join(', ') }}]
      </span>
    </div>
  </div>

  <!-- 编辑对话框 -->
  <el-dialog
    v-model="editDialogVisible"
    title="编辑元素"
    width="600px"
  >
    <el-form :model="editForm" label-width="100px">
      <el-form-item label="类型">
        <el-select v-model="editForm.category_type" placeholder="选择类型">
          <el-option label="文本" value="text" />
          <el-option label="表格" value="table" />
          <el-option label="表格标题" value="table_caption" />
          <el-option label="表格脚注" value="table_footnote" />
          <el-option label="标题" value="title" />
          <el-option label="图片" value="figure" />
          <el-option label="公式" value="formula" />
        </el-select>
      </el-form-item>

      <el-form-item label="顺序">
        <el-input-number v-model="editForm.order" :min="0" />
      </el-form-item>

      <el-form-item label="内容" v-if="editForm.category_type === 'table'">
        <el-input
          v-model="editForm.html"
          type="textarea"
          :rows="6"
          placeholder="输入HTML内容"
        />
      </el-form-item>

      <el-form-item label="内容" v-else>
        <el-input
          v-model="editForm.text"
          type="textarea"
          :rows="6"
          placeholder="输入文本内容"
        />
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
import type { LayoutElement, OCRViewMode, ElementType } from '@/types/ocr'

const props = defineProps<{
  element: LayoutElement
  index: number
  viewMode: OCRViewMode
  isSelected: boolean
}>()

const emit = defineEmits<{
  click: []
  edit: [element: Partial<LayoutElement>]
  delete: []
}>()

// 编辑对话框
const editDialogVisible = ref(false)
const editForm = reactive<Partial<LayoutElement>>({
  category_type: 'text',
  text: '',
  html: '',
  order: 0
})

// 获取类型标签颜色
const getTypeTagColor = (type: ElementType) => {
  const colorMap: Record<ElementType, string> = {
    text: '',
    table: 'success',
    table_caption: 'warning',
    table_footnote: 'warning',
    title: 'danger',
    figure: 'info',
    formula: 'warning'
  }
  return colorMap[type] || ''
}

// 处理编辑
const handleEdit = () => {
  editForm.category_type = props.element.category_type
  editForm.text = props.element.text || ''
  editForm.html = props.element.html || ''
  editForm.order = props.element.order
  editDialogVisible.value = true
}

// 确认编辑
const confirmEdit = () => {
  const updates: Partial<LayoutElement> = {
    category_type: editForm.category_type as ElementType,
    order: editForm.order
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

  &.type-table {
    border-left: 4px solid #67c23a;
  }

  &.type-table_caption,
  &.type-table_footnote {
    border-left: 4px solid #e6a23c;
  }

  &.type-title {
    border-left: 4px solid #f56c6c;
  }

  &.type-figure {
    border-left: 4px solid #909399;
  }

  &.type-formula {
    border-left: 4px solid #b88230;
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

          th, td {
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
}
</style>
