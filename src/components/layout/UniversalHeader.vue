<template>
  <header class="universal-header">
    <div class="header-left">
      <!-- 功能切换按钮 -->
      <div v-if="showModeSwitch" class="mode-switch">
        <router-link
          :to="currentMode === 'merge' ? '/ocr-validation' : '/merge-validation'"
          :title="currentMode === 'merge' ? '切换到OCR校验' : '切换到合并校验'"
        >
          <el-button :icon="Switch">
            {{ currentMode === 'merge' ? '切换到OCR校验' : '切换到合并校验' }}
          </el-button>
        </router-link>
        <el-divider direction="vertical" />
      </div>

      <!-- 主要上传按钮 -->
      <el-upload
        v-if="showUpload"
        :show-file-list="false"
        :before-upload="handleMainUpload"
        :accept="uploadAccept"
        :multiple="uploadMultiple"
      >
        <el-button type="primary" :icon="UploadFilled">
          {{ uploadText }}
        </el-button>
      </el-upload>

      <!-- 额外的操作按钮 -->
      <slot name="extra-actions" />

      <!-- 导航栏 -->
      <UniversalNavigationBar
        v-if="showNavigation && hasData"
        :current-index="currentIndex"
        :total-items="totalItems"
        :is-modified="isModified"
        :language="language"
        :keyboard-hint="keyboardHint"
        @previous="$emit('previous')"
        @next="$emit('next')"
        @navigate="$emit('navigate', $event)"
      />
    </div>

    <div class="header-right">
      <!-- 状态指示器 -->
      <div v-if="showStats" class="stats-section">
        <el-tag v-if="extraStats" type="success">
          {{ extraStats }}
        </el-tag>
      </div>

      <!-- 历史操作按钮 -->
      <div v-if="showHistory" class="history-actions">
        <el-button
          @click="$emit('undo')"
          :disabled="!canUndo"
          :icon="RefreshLeft"
          size="small"
        >
          撤销
        </el-button>
        <el-button
          @click="$emit('redo')"
          :disabled="!canRedo"
          :icon="RefreshRight"
          size="small"
        >
          重做
        </el-button>
      </div>

      <!-- 保存按钮 -->
      <el-button
        v-if="showSave"
        @click="$emit('save')"
        :disabled="!isModified"
        type="success"
        :icon="Select"
      >
        保存当前
      </el-button>

      <!-- 导出按钮 -->
      <el-button
        @click="$emit('export')"
        :disabled="!hasData"
        :type="exportType"
        :icon="Download"
      >
        {{ exportText }}
        <el-badge
          v-if="modifiedCount > 0"
          :value="modifiedCount"
          class="modified-badge"
        />
      </el-button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  UploadFilled,
  Download,
  Select,
  RefreshLeft,
  RefreshRight,
  Switch
} from '@element-plus/icons-vue'
import UniversalNavigationBar from './UniversalNavigationBar.vue'

// Props 接口定义
interface Props {
  // 基础配置
  showModeSwitch?: boolean
  showUpload?: boolean
  showNavigation?: boolean
  showStats?: boolean
  showHistory?: boolean
  showSave?: boolean

  // 上传配置
  uploadText?: string
  uploadAccept?: string
  uploadMultiple?: boolean

  // 导航数据
  hasData?: boolean
  currentIndex?: number
  totalItems?: number
  isModified?: boolean
  language?: string
  keyboardHint?: string

  // 历史操作
  canUndo?: boolean
  canRedo?: boolean

  // 导出配置
  exportText?: string
  exportType?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
  modifiedCount?: number

  // 额外状态
  extraStats?: string
}

const props = withDefaults(defineProps<Props>(), {
  showModeSwitch: true,
  showUpload: true,
  showNavigation: true,
  showStats: false,
  showHistory: false,
  showSave: false,
  uploadText: '上传文件',
  uploadAccept: '.jsonl',
  uploadMultiple: false,
  hasData: false,
  currentIndex: 0,
  totalItems: 0,
  isModified: false,
  language: '',
  keyboardHint: '使用 A/D 键导航',
  canUndo: false,
  canRedo: false,
  exportText: '导出数据',
  exportType: 'primary',
  modifiedCount: 0,
  extraStats: ''
})

// Emits 定义
interface Emits {
  'main-upload': [file: File]
  'previous': []
  'next': []
  'navigate': [index: number]
  'undo': []
  'redo': []
  'save': []
  'export': []
}

const emit = defineEmits<Emits>()

// 路由信息
const route = useRoute()

// 计算当前模式
const currentMode = computed(() => {
  if (route.path.includes('merge')) return 'merge'
  if (route.path.includes('ocr')) return 'ocr'
  return 'home'
})

// 处理主上传
const handleMainUpload = async (file: File) => {
  try {
    emit('main-upload', file)
  } catch (error: any) {
    ElMessage.error('文件上传失败: ' + error.message)
  }
  return false
}
</script>

<style lang="scss" scoped>
.universal-header {
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
  z-index: 100;

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex: 1;

    .mode-switch {
      display: flex;
      align-items: center;
      gap: 10px;
    }
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;

    .stats-section {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .history-actions {
      display: flex;
      gap: 5px;
    }

    .modified-badge {
      margin-left: 5px;
    }
  }

  .el-divider {
    height: 20px;
  }

  // 响应式设计
  @media (max-width: 768px) {
    padding: 0 10px;
    height: auto;
    min-height: 60px;
    flex-wrap: wrap;
    gap: 10px;

    .header-left,
    .header-right {
      flex-wrap: wrap;
      gap: 8px;
    }

    .header-right {
      width: 100%;
      justify-content: flex-end;
    }
  }
}
</style>
