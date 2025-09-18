<template>
  <div class="ocr-content-panel">
    <div class="panel-header">
      <div class="header-actions">
        <el-button type="primary" size="small" @click="sortElementsByOrder">
          按顺序排序
        </el-button>
        <el-tag size="small" type="info">
          {{ elements.length }} 个元素
        </el-tag>
      </div>
    </div>

    <div class="elements-container" ref="containerRef">
      <!-- 使用虚拟滚动（元素超过100个时） -->
      <div v-if="elements.length > 100" class="virtual-list">
        <el-auto-resizer>
          <template #default="{ height, width }">
            <el-table-v2 :columns="virtualColumns" :data="virtualData" :width="width" :height="height" :row-height="100"
              fixed>
              <template #default="{ rowData, rowIndex }">
                <OCRElementCard :element="rowData" :index="rowIndex" :view-mode="viewMode"
                  :is-selected="selectedIndex === rowIndex" @click="handleElementClick(rowIndex)"
                  @edit="handleElementEdit(rowIndex, $event)" @delete="handleElementDelete(rowIndex)" />
              </template>
            </el-table-v2>
          </template>
        </el-auto-resizer>
      </div>

      <!-- 普通列表（元素少于100个） -->
      <div v-else class="normal-list">
        <div
            v-for="(elem, idx) in elements"
            :key="`elem-${idx}-${elem.order}`"
            :data-index="idx"
            class="draggable-item"
            :draggable="true"
            @dragstart="handleDragStart(idx)"
            @dragover.prevent="handleDragOver(idx, $event)"
            @dragleave="handleDragLeave(idx)"
            @drop="handleDrop(idx)"
            @dragend="handleDragEnd()"
        >
          <OCRElementCard
            :element="elem"
            :index="idx"
            :view-mode="viewMode"
            :is-selected="selectedIndex === idx"
            @click="handleElementClick(idx)"
            @edit="handleElementEdit(idx, $event)"
            @delete="handleElementDelete(idx)"
          />
          <div class="move-controls">
            <el-button
              icon="el-icon-top"
              size="small"
              @click.stop="moveElementUp(idx)"
              :disabled="idx === 0"
            />
            <el-button
              icon="el-icon-bottom"
              size="small"
              @click.stop="moveElementDown(idx)"
              :disabled="idx === elements.length - 1"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- 页面信息显示区域 -->
    <div v-if="pageInfo" class="page-info-panel">
      <div class="panel-info-header">
        <h4>页面信息</h4>
        <div v-if="!isEditingPageInfo">
          <el-button type="primary" size="small" @click="startEditPageInfo">
            编辑
          </el-button>
        </div>
        <div v-else>
          <el-button type="primary" size="small" @click="savePageInfo" style="margin-right: 8px;">
            保存
          </el-button>
          <el-button size="small" @click="cancelEditPageInfo">
            取消
          </el-button>
        </div>
      </div>

      <div class="info-grid">
        <div class="info-item">
          <span class="info-label">语言：</span>
          <span class="info-value" v-if="!isEditingPageInfo">
            {{ pageInfo.language === 'zh' ? '中文' : '英文' }}
          </span>
          <el-select v-else v-model="editPageInfoForm.language" placeholder="请选择语言" size="small" style="width: 100px;">
            <el-option label="中文" value="zh" />
            <el-option label="英文" value="en" />
          </el-select>
        </div>
        <div class="info-item">
          <span class="info-label">模糊扫描：</span>
          <span class="info-value" v-if="!isEditingPageInfo">
            <el-tag size="small" :type="pageInfo.fuzzy_scan ? 'warning' : undefined">
              {{ pageInfo.fuzzy_scan ? '是' : '否' }}
            </el-tag>
          </span>
          <el-switch v-else v-model="editPageInfoForm.fuzzy_scan" size="small" />
        </div>
        <div class="info-item">
          <span class="info-label">水印：</span>
          <span class="info-value" v-if="!isEditingPageInfo">
            <el-tag size="small" :type="pageInfo.watermark ? 'warning' : undefined">
              {{ pageInfo.watermark ? '是' : '否' }}
            </el-tag>
          </span>
          <el-switch v-else v-model="editPageInfoForm.watermark" size="small" />
        </div>
        <div class="info-item">
          <span class="info-label">旋转：</span>
          <span class="info-value" v-if="!isEditingPageInfo">
            {{ getRotateText(pageInfo.rotate) }}
          </span>
          <el-select v-else v-model="editPageInfoForm.rotate" placeholder="请选择旋转角度" size="small" style="width: 120px;">
            <el-option label="正常" value="normal" />
            <el-option label="90" value="rotate90" />
            <el-option label="180" value="rotate180" />
            <el-option label="270" value="rotate270" />
          </el-select>
        </div>
        <div class="info-item">
          <span class="info-label">包含表格：</span>
          <span class="info-value" v-if="!isEditingPageInfo">
            <el-tag size="small" :type="pageInfo.is_table ? 'success' : undefined">
              {{ pageInfo.is_table ? '是' : '否' }}
            </el-tag>
          </span>
          <el-switch v-else v-model="editPageInfoForm.is_table" size="small" />
        </div>
        <div class="info-item">
          <span class="info-label">包含图表：</span>
          <span class="info-value" v-if="!isEditingPageInfo">
            <el-tag size="small" :type="pageInfo.is_diagram ? 'success' : undefined">
              {{ pageInfo.is_diagram ? '是' : '否' }}
            </el-tag>
          </span>
          <el-switch v-else v-model="editPageInfoForm.is_diagram" size="small" />
        </div>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElTag, ElButton, ElSwitch, ElSelect, ElOption } from 'element-plus'
import OCRElementCard from './OCRElementCard.vue'
import { useOCRValidationStore } from '@/stores/ocrValidation'
import type { LayoutElement, PageInfo } from '@/types'

const props = defineProps<{
  elements: LayoutElement[]
  pageInfo?: PageInfo
  selectedIndex: number | null
  viewMode: 'edit' | 'preview'
}>()

const emit = defineEmits<{
  'element-click': [index: number]
  'element-edit': [index: number, element: Partial<LayoutElement>]
  'element-delete': [index: number]
}>()

const ocrStore = useOCRValidationStore()
const containerRef = ref<HTMLElement>()
const isEditingPageInfo = ref(false)
const editPageInfoForm = ref<PageInfo>({
  language: props.pageInfo?.language || 'zh',
  fuzzy_scan: props.pageInfo?.fuzzy_scan || false,
  watermark: props.pageInfo?.watermark || false,
  rotate: props.pageInfo?.rotate || 'normal',
  is_table: props.pageInfo?.is_table || false,
  is_diagram: props.pageInfo?.is_diagram || false
})
const draggedElementIndex = ref<number | null>(null)

// 虚拟滚动的列定义
const virtualColumns = computed(() => [
  {
    key: 'content',
    dataKey: 'content',
    width: 1000,
    align: 'left'
  }
])

const virtualData = computed(() => props.elements)

// 处理元素点击
const handleElementClick = (index: number) => {
  emit('element-click', index)
}

// 处理元素编辑
const handleElementEdit = (index: number, element: Partial<LayoutElement>) => {
  emit('element-edit', index, element)
}

// 处理元素删除
const handleElementDelete = (index: number) => {
  emit('element-delete', index)
}

// 开始编辑页面信息
const startEditPageInfo = () => {
  if (props.pageInfo) {
    // 复制当前页面信息到编辑表单
    Object.assign(editPageInfoForm.value, props.pageInfo)
    isEditingPageInfo.value = true
  }
}

// 保存页面信息修改
const savePageInfo = async () => {
  const success = await ocrStore.updatePageInfo(editPageInfoForm.value)
  if (success) {
    ElMessage.success('页面信息已更新')
    isEditingPageInfo.value = false
  } else {
    ElMessage.error('更新页面信息失败')
  }
}

// 取消编辑页面信息
const cancelEditPageInfo = () => {
  isEditingPageInfo.value = false
}

// 获取旋转文本
const getRotateText = (rotate: string) => {
  const rotateMap: Record<string, string> = {
    normal: '0°',
    rotate90: '90°',
    rotate180: '180°',
    rotate270: '270°'
  }
  return rotateMap[rotate] || rotate
}

// 监听选中元素变化，滚动到对应位置
watch(() => props.selectedIndex, (index) => {
  if (index !== null && containerRef.value) {
    // 如果是普通列表，滚动到元素
    if (props.elements.length <= 100) {
      const element = containerRef.value.querySelector(`.element-card:nth-child(${index + 1})`)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }
})

// 排序元素
const sortElementsByOrder = async () => {
  const success = await ocrStore.reorderElements()
  if (success) {
    ElMessage.success('元素已按顺序重新排序')
  } else {
    ElMessage.error('排序失败，请重试')
  }
}

// 拖拽排序相关方法
const handleDragStart = (index: number) => {
  draggedElementIndex.value = index
  // 添加拖拽时的视觉效果
  const element = document.querySelector(`[data-index="${index}"]`)
  if (element) {
    element.classList.add('dragging')
  }
}

const handleDragOver = (index: number, e: DragEvent) => {
  // 防止默认行为以允许放置
  e.preventDefault()
  // 添加hover效果以提供视觉反馈
  const element = document.querySelector(`[data-index="${index}"]`)
  if (element && draggedElementIndex.value !== index) {
    element.classList.add('drag-over')
  }
}

const handleDragLeave = (index: number) => {
  // 移除hover效果
  const element = document.querySelector(`[data-index="${index}"]`)
  if (element) {
    element.classList.remove('drag-over')
  }
}

const handleDragEnd = () => {
  // 拖拽结束时清理所有视觉效果
  document.querySelectorAll('.dragging, .drag-over').forEach(el => {
    el.classList.remove('dragging', 'drag-over')
  })
}

const handleDrop = async (dropIndex: number) => {
  if (draggedElementIndex.value !== null && draggedElementIndex.value !== dropIndex) {
    const newOrder = [...Array(props.elements.length).keys()]
    const draggedIndex = draggedElementIndex.value

    // 移除被拖拽的元素
    newOrder.splice(draggedIndex, 1)
    // 在目标位置插入
    newOrder.splice(dropIndex, 0, draggedIndex)

    // 调用reorderElements函数应用新的顺序
    const success = await ocrStore.reorderElements(newOrder)
    if (success) {
      ElMessage.success('元素顺序已更新')
    } else {
      ElMessage.error('更新元素顺序失败')
    }
  }
  // 清理视觉效果
  document.querySelectorAll('.dragging, .drag-over').forEach(el => {
    el.classList.remove('dragging', 'drag-over')
  })
  draggedElementIndex.value = null
}

// 向上移动元素
const moveElementUp = async (index: number) => {
  if (index > 0) {
    const newOrder = [...Array(props.elements.length).keys()]
    // 交换位置
    const temp = newOrder[index - 1]
    newOrder[index - 1] = newOrder[index]
    newOrder[index] = temp

    const success = await ocrStore.reorderElements(newOrder)
    if (success) {
      ElMessage.success('元素已向上移动')
    }
  }
}

// 键盘快捷键处理函数
const handleKeyboardShortcuts = () => {
  // 向上和向下移动的快捷键已移除
}

// 在组件挂载时注册键盘快捷键
onMounted(() => {
  handleKeyboardShortcuts()
})

// 在组件卸载时清理键盘快捷键
onUnmounted(() => {
  // 向上和向下移动的快捷键清理代码已移除
})

// 向下移动元素
const moveElementDown = async (index: number) => {
  if (index < props.elements.length - 1) {
    const newOrder = [...Array(props.elements.length).keys()]
    // 交换位置
    const temp = newOrder[index]
    newOrder[index] = newOrder[index + 1]
    newOrder[index + 1] = temp

    const success = await ocrStore.reorderElements(newOrder)
    if (success) {
      ElMessage.success('元素已向下移动')
    }
  }
}
</script>

<style scoped lang="scss">
.ocr-content-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;

    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
  }

  .elements-container {
    flex: 1;
    overflow-y: auto;
    margin-bottom: 16px;

    .normal-list {
      display: flex;
      flex-direction: column;
      gap: 12px;

      .draggable-item {
        position: relative;
        cursor: move;
        transition: all 0.2s ease;

        &:hover {
          .move-controls {
            display: flex;
          }
        }

        &.dragging {
          opacity: 0.5;
          border: 2px dashed #409eff;
        }

        &.drag-over {
          border: 2px solid #409eff;
          background-color: #ecf5ff;
        }

        .move-controls {
          display: none;
          position: absolute;
          right: -40px;
          top: 50%;
          transform: translateY(-50%);
          flex-direction: column;
          gap: 4px;
          z-index: 10;
        }
      }
    }
  }

  .page-info-panel {
    padding: 16px;
    background: #f5f7fa;
    border-radius: 8px;

    .panel-info-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;

      h4 {
        margin: 0;
        font-size: 16px;
        font-weight: 500;
      }
    }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 16px;

      .info-item {
        display: flex;
        align-items: center;

        .info-label {
          font-size: 14px;
          color: #606266;
          margin-right: 8px;
          min-width: 60px;
        }

        .info-value {
          font-size: 14px;
          color: #303133;
        }
      }
    }
  }
}
</style>
