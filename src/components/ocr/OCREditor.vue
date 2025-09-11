<template>
  <div class="ocr-editor">
    <div class="editor-header">
      <div class="header-title">
        <el-icon><EditPen /></el-icon>
        <strong>元素编辑器</strong>
        <el-tag size="small" type="info" v-if="ocrStore.selectedElementIndex !== null">
          正在编辑: [{{ ocrStore.selectedElementIndex }}]
        </el-tag>
      </div>

      <div class="editor-actions">
        <el-button
          size="small"
          @click="addNewElement"
          type="primary"
          :icon="Plus"
        >
          添加元素
        </el-button>

        <el-button
          size="small"
          @click="reorderElements"
          :icon="Sort"
        >
          重新排序
        </el-button>

        <el-button
          size="small"
          @click="clearSelection"
          :disabled="ocrStore.selectedElementIndex === null"
        >
          清除选择
        </el-button>
      </div>
    </div>

    <div class="editor-content" v-if="selectedElement">
      <el-form :model="editForm" label-width="80px" size="small">
        <el-row :gutter="20">
          <el-col :span="8">
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
          </el-col>

          <el-col :span="4">
            <el-form-item label="顺序">
              <el-input-number v-model="editForm.order" :min="0" />
            </el-form-item>
          </el-col>

          <el-col :span="12">
            <el-form-item label="坐标">
              <el-input
                :value="`[${selectedElement.poly.join(', ')}]`"
                disabled
                placeholder="坐标为只读"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :span="24">
            <el-form-item :label="editForm.category_type === 'table' ? 'HTML' : '文本'">
              <el-input
                v-if="editForm.category_type === 'table'"
                v-model="editForm.html"
                type="textarea"
                :rows="3"
                placeholder="输入HTML内容"
              />
              <el-input
                v-else
                v-model="editForm.text"
                type="textarea"
                :rows="3"
                placeholder="输入文本内容"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row>
          <el-col :span="24">
            <el-form-item label=" ">
              <el-button type="primary" @click="applyChanges" :icon="Check">
                应用修改
              </el-button>
              <el-button @click="resetForm" :icon="RefreshLeft">
                重置
              </el-button>
              <el-button type="danger" @click="deleteElement" :icon="Delete">
                删除元素
              </el-button>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
    </div>

    <div v-else class="empty-state">
      <el-icon size="24" color="#909399"><Select /></el-icon>
      <p>选择一个元素开始编辑</p>
    </div>
  </div>

  <!-- 添加元素对话框 -->
  <el-dialog
    v-model="addDialogVisible"
    title="添加新元素"
    width="500px"
  >
    <el-form :model="newElementForm" label-width="100px">
      <el-form-item label="类型" required>
        <el-select v-model="newElementForm.category_type" placeholder="选择类型">
          <el-option label="文本" value="text" />
          <el-option label="表格" value="table" />
          <el-option label="表格标题" value="table_caption" />
          <el-option label="表格脚注" value="table_footnote" />
          <el-option label="标题" value="title" />
        </el-select>
      </el-form-item>

      <el-form-item label="内容" required>
        <el-input
          v-if="newElementForm.category_type === 'table'"
          v-model="newElementForm.html"
          type="textarea"
          :rows="5"
          placeholder="输入HTML内容"
        />
        <el-input
          v-else
          v-model="newElementForm.text"
          type="textarea"
          :rows="5"
          placeholder="输入文本内容"
        />
      </el-form-item>

      <el-form-item label="坐标" required>
        <el-row :gutter="10">
          <el-col :span="6">
            <el-input-number v-model="newElementForm.x1" placeholder="x1" />
          </el-col>
          <el-col :span="6">
            <el-input-number v-model="newElementForm.y1" placeholder="y1" />
          </el-col>
          <el-col :span="6">
            <el-input-number v-model="newElementForm.x2" placeholder="x2" />
          </el-col>
          <el-col :span="6">
            <el-input-number v-model="newElementForm.y2" placeholder="y2" />
          </el-col>
        </el-row>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="addDialogVisible = false">取消</el-button>
      <el-button type="primary" @click="confirmAddElement">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  EditPen,
  Plus,
  Delete,
  Check,
  RefreshLeft,
  Sort,
  Select
} from '@element-plus/icons-vue'
import { useOCRValidationStore } from '@/stores/ocrValidation'
import type { LayoutElement, ElementType } from '@/types'

const ocrStore = useOCRValidationStore()

// 选中的元素
const selectedElement = computed(() => {
  if (ocrStore.selectedElementIndex === null || !ocrStore.currentSample) {
    return null
  }
  return ocrStore.currentElements[ocrStore.selectedElementIndex]
})

// 编辑表单
const editForm = reactive<{
  category_type: ElementType
  text: string
  html: string
  order: number
}>({
  category_type: 'text',
  text: '',
  html: '',
  order: 0
})

// 新元素表单
const addDialogVisible = ref(false)
const newElementForm = reactive({
  category_type: 'text' as ElementType,
  text: '',
  html: '',
  x1: 0,
  y1: 0,
  x2: 100,
  y2: 100
})

// 监听选中元素变化
watch(selectedElement, (elem) => {
  if (elem) {
    editForm.category_type = elem.category_type
    editForm.text = elem.text || ''
    editForm.html = elem.html || ''
    editForm.order = elem.order
  }
})

// 应用修改
const applyChanges = () => {
  if (ocrStore.selectedElementIndex === null) return

  const updates: Partial<LayoutElement> = {
    category_type: editForm.category_type,
    order: editForm.order
  }

  if (editForm.category_type === 'table') {
    updates.html = editForm.html
    updates.text = undefined
  } else {
    updates.text = editForm.text
    updates.html = undefined
  }

  ocrStore.updateElement(ocrStore.selectedElementIndex, updates)
  ElMessage.success('修改已应用')
}

// 重置表单
const resetForm = () => {
  if (selectedElement.value) {
    editForm.category_type = selectedElement.value.category_type
    editForm.text = selectedElement.value.text || ''
    editForm.html = selectedElement.value.html || ''
    editForm.order = selectedElement.value.order
  }
}

// 删除元素
const deleteElement = () => {
  if (ocrStore.selectedElementIndex === null) return

  ElMessageBox.confirm(
    '确定要删除这个元素吗？',
    '删除确认',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(() => {
    ocrStore.deleteElement(ocrStore.selectedElementIndex!)
    ocrStore.selectElement(null)
    ElMessage.success('元素已删除')
  }).catch(() => {})
}

// 添加新元素
const addNewElement = () => {
  newElementForm.category_type = 'text'
  newElementForm.text = ''
  newElementForm.html = ''
  newElementForm.x1 = 0
  newElementForm.y1 = 0
  newElementForm.x2 = 100
  newElementForm.y2 = 100
  addDialogVisible.value = true
}

// 确认添加元素
const confirmAddElement = () => {
  const newElement: LayoutElement = {
    category_type: newElementForm.category_type,
    poly: [
      newElementForm.x1,
      newElementForm.y1,
      newElementForm.x2,
      newElementForm.y2
    ],
    order: ocrStore.currentElements.length
  }

  if (newElementForm.category_type === 'table') {
    newElement.html = newElementForm.html
  } else {
    newElement.text = newElementForm.text
  }

  ocrStore.addElement(newElement)
  addDialogVisible.value = false
  ElMessage.success('元素已添加')
}

// 重新排序元素
const reorderElements = () => {
  ocrStore.reorderElements()
  ElMessage.success('元素已重新排序')
}

// 清除选择
const clearSelection = () => {
  ocrStore.selectElement(null)
}
</script>

<style lang="scss" scoped>
.ocr-editor {
  background: white;
  border-top: 1px solid #e4e7ed;
  box-shadow: 0 -1px 4px rgba(0, 21, 41, 0.08);

  .editor-header {
    padding: 12px 20px;
    border-bottom: 1px solid #f0f2f5;
    display: flex;
    justify-content: space-between;
    align-items: center;

    .header-title {
      display: flex;
      align-items: center;
      gap: 8px;

      strong {
        font-size: 14px;
        color: #303133;
      }
    }

    .editor-actions {
      display: flex;
      gap: 10px;
    }
  }

  .editor-content {
    padding: 16px 20px;

    .el-form {
      margin: 0;
    }
  }

  .empty-state {
    padding: 30px;
    text-align: center;
    color: #909399;

    p {
      margin-top: 10px;
      font-size: 14px;
    }
  }
}
</style>
