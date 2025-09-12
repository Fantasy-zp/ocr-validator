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
          <el-select
            v-else
            v-model="editPageInfoForm.language"
            placeholder="请选择语言"
            size="small"
            style="width: 100px;"
          >
            <el-option label="中文" value="zh" />
            <el-option label="英文" value="en" />
          </el-select>
        </div>
        <div class="info-item">
          <span class="info-label">模糊扫描：</span>
          <span class="info-value" v-if="!isEditingPageInfo">
            <el-tag size="small" :type="pageInfo.fuzzy_scan ? 'warning' : ''">
              {{ pageInfo.fuzzy_scan ? '是' : '否' }}
            </el-tag>
          </span>
          <el-switch
            v-else
            v-model="editPageInfoForm.fuzzy_scan"
            size="small"
          />
        </div>
        <div class="info-item">
          <span class="info-label">水印：</span>
          <span class="info-value" v-if="!isEditingPageInfo">
            <el-tag size="small" :type="pageInfo.watermark ? 'warning' : ''">
              {{ pageInfo.watermark ? '是' : '否' }}
            </el-tag>
          </span>
          <el-switch
            v-else
            v-model="editPageInfoForm.watermark"
            size="small"
          />
        </div>
        <div class="info-item">
          <span class="info-label">旋转：</span>
          <span class="info-value" v-if="!isEditingPageInfo">
            {{ getRotateText(pageInfo.rotate) }}
          </span>
          <el-select
            v-else
            v-model="editPageInfoForm.rotate"
            placeholder="请选择旋转角度"
            size="small"
            style="width: 120px;"
          >
            <el-option label="正常" value="normal" />
            <el-option label="90" value="rotate90" />
            <el-option label="180" value="rotate180" />
            <el-option label="270" value="rotate270" />
          </el-select>
        </div>
        <div class="info-item">
          <span class="info-label">包含表格：</span>
          <span class="info-value" v-if="!isEditingPageInfo">
            <el-tag size="small" :type="pageInfo.is_table ? 'success' : ''">
              {{ pageInfo.is_table ? '是' : '否' }}
            </el-tag>
          </span>
          <el-switch
            v-else
            v-model="editPageInfoForm.is_table"
            size="small"
          />
        </div>
        <div class="info-item">
          <span class="info-label">包含图表：</span>
          <span class="info-value" v-if="!isEditingPageInfo">
            <el-tag size="small" :type="pageInfo.is_diagram ? 'success' : ''">
              {{ pageInfo.is_diagram ? '是' : '否' }}
            </el-tag>
          </span>
          <el-switch
            v-else
            v-model="editPageInfoForm.is_diagram"
            size="small"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, reactive } from 'vue'
import type { LayoutElement, OCRViewMode, PageInfo } from '@/types'
import OCRElementCard from '@/components/ocr/OCRElementCard.vue'
import { useOCRValidationStore } from '@/stores/ocrValidation'
import { ElMessage } from 'element-plus'

const ocrStore = useOCRValidationStore()

const props = defineProps<{
  elements: LayoutElement[]
  viewMode: OCRViewMode
  selectedIndex: number | null
  pageInfo?: PageInfo | null
}>()

const emit = defineEmits<{
  'update:view-mode': [mode: OCRViewMode]
  'element-click': [index: number]
  'element-edit': [index: number, element: Partial<LayoutElement>]
  'element-delete': [index: number]
}>()

const containerRef = ref<HTMLDivElement>();

// 页面信息编辑状态
const isEditingPageInfo = ref(false)
const editPageInfoForm = reactive<PageInfo>({
  language: 'zh',
  fuzzy_scan: false,
  watermark: false,
  rotate: 'normal',
  is_table: false,
  is_diagram: false
})

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

// 获取旋转状态文本
const getRotateText = (rotate: string) => {
  const rotateMap: Record<string, string> = {
    'normal': '正常',
    'rotate90': '90',
    'rotate180': '180',
    'rotate270': '270'
  }
  return rotateMap[rotate] || '未知'
}

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
    Object.assign(editPageInfoForm, props.pageInfo)
    isEditingPageInfo.value = true
  }
}

// 保存页面信息修改
const savePageInfo = () => {
  const success = ocrStore.updatePageInfo(editPageInfoForm)
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

  .page-info-panel {
    background: white;
    border-top: 1px solid #e4e7ed;
    padding: 16px 20px;

    .panel-info-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    h4 {
      margin: 0;
      color: #303133;
      font-size: 14px;
      font-weight: 500;
    }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 8px 20px;
    }

    .info-item {
      display: flex;
      align-items: center;
      font-size: 13px;

      .info-label {
        color: #909399;
        margin-right: 4px;
        min-width: 60px;
      }

      .info-value {
        color: #303133;
        font-weight: 400;
      }
    }
  }
}
</style>
