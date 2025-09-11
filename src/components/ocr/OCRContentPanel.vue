<template>
  <div class="ocr-content-panel">
    <div class="panel-header">
      <el-radio-group
        :model-value="viewMode"
        @update:model-value="$emit('update:view-mode', $event)"
        size="small"
      >
        <el-radio-button label="rendered">渲染效果</el-radio-button>
        <el-radio-button label="original">原始内容</el-radio-button>
        <el-radio-button label="json">JSON</el-radio-button>
      </el-radio-group>

      <el-tag size="small" type="info">
        {{ elements.length }} 个元素
      </el-tag>
    </div>

    <div class="elements-container" ref="containerRef">
      <!-- 使用虚拟滚动（元素超过100个时） -->
      <div v-if="elements.length > 100" class="virtual-list">
        <el-auto-resizer>
          <template #default="{ height, width }">
            <el-table-v2
              :columns="virtualColumns"
              :data="virtualData"
              :width="width"
              :height="height"
              :row-height="100"
              fixed
            >
              <template #default="{ rowData, rowIndex }">
                <OCRElementCard
                  :element="rowData"
                  :index="rowIndex"
                  :view-mode="viewMode"
                  :is-selected="selectedIndex === rowIndex"
                  @click="handleElementClick(rowIndex)"
                  @edit="handleElementEdit(rowIndex, $event)"
                  @delete="handleElementDelete(rowIndex)"
                />
              </template>
            </el-table-v2>
          </template>
        </el-auto-resizer>
      </div>

      <!-- 普通列表（元素少于100个） -->
      <div v-else class="normal-list">
        <OCRElementCard
          v-for="(elem, idx) in elements"
          :key="idx"
          :element="elem"
          :index="idx"
          :view-mode="viewMode"
          :is-selected="selectedIndex === idx"
          @click="handleElementClick(idx)"
          @edit="handleElementEdit(idx, $event)"
          @delete="handleElementDelete(idx)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { LayoutElement, OCRViewMode } from '@/types/ocr'
import OCRElementCard from '@/components/ocr/OCRElementCard.vue'

const props = defineProps<{
  elements: LayoutElement[]
  viewMode: OCRViewMode
  selectedIndex: number | null
}>()

const emit = defineEmits<{
  'update:view-mode': [mode: OCRViewMode]
  'element-click': [index: number]
  'element-edit': [index: number, element: Partial<LayoutElement>]
  'element-delete': [index: number]
}>()

const containerRef = ref<HTMLDivElement>()

// 虚拟滚动配置
const virtualColumns = [
  {
    key: 'element',
    dataKey: 'element',
    width: '100%'
  }
]

const virtualData = computed(() =>
  props.elements.map((elem, idx) => ({
    id: idx,
    element: elem
  }))
)

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
</script>

<style lang="scss" scoped>
.ocr-content-panel {
  height: 100%;
  display: flex;
  flex-direction: column;

  .panel-header {
    padding: 16px 20px;
    background: white;
    border-bottom: 1px solid #e4e7ed;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .elements-container {
    flex: 1;
    overflow-y: auto;
    background: #f5f7fa;

    .normal-list {
      padding: 20px;
    }

    .virtual-list {
      height: 100%;
      padding: 0;
    }

    &::-webkit-scrollbar {
      width: 8px;
    }

    &::-webkit-scrollbar-track {
      background: #f1f1f1;
    }

    &::-webkit-scrollbar-thumb {
      background: #c0c4cc;
      border-radius: 4px;

      &:hover {
        background: #909399;
      }
    }
  }
}
</style>
