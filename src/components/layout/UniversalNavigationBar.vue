<template>
  <div class="universal-navigation-bar">
    <el-button
      :icon="ArrowLeft"
      @click="onPrevious"
      :disabled="currentIndex === 0"
      circle
      size="small"
    />

    <div class="pagination-controls">
      <el-input-number
        v-model="targetPage"
        :min="1"
        :max="totalItems"
        size="small"
        :controls-position="'right'"
        @change="handlePageChange"
        @keyup.enter="navigateToPage"
      />
      <span class="page-separator">/</span>
      <span class="total-pages">{{ totalItems }}</span>
      <el-button
        size="small"
        @click="navigateToPage"
        :disabled="!isValidPage || currentIndex + 1 === targetPage"
        type="primary"
      >
        跳转
      </el-button>
    </div>

    <el-button
      :icon="ArrowRight"
      @click="onNext"
      :disabled="currentIndex === totalItems - 1"
      circle
      size="small"
    />

    <el-divider direction="vertical" />

    <el-tag :type="isModified ? 'warning' : 'info'">
      {{ isModified ? '已修改' : '未修改' }}
    </el-tag>

    <el-tag type="success" v-if="language">
      {{ language === 'zh' ? '中文' : '英文' }}
    </el-tag>

    <el-tooltip :content="keyboardHint" placement="bottom">
      <el-icon size="16" class="keyboard-hint">
        <Monitor />
      </el-icon>
    </el-tooltip>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ArrowLeft, ArrowRight, Monitor } from '@element-plus/icons-vue'

// Props 定义
interface Props {
  currentIndex: number
  totalItems: number
  isModified?: boolean
  language?: string
  keyboardHint?: string
}

const props = withDefaults(defineProps<Props>(), {
  isModified: false,
  language: '',
  keyboardHint: '使用 A/D 键导航'
})

// Emits 定义
interface Emits {
  previous: []
  next: []
  navigate: [index: number]
}

const emit = defineEmits<Emits>()

// 状态
const targetPage = ref(1)

// 计算属性
const isValidPage = computed(() => {
  return targetPage.value >= 1 && targetPage.value <= props.totalItems
})

// 监听当前页面变化
watch(() => props.currentIndex, (newIndex) => {
  targetPage.value = newIndex + 1
}, { immediate: true })

// 方法
const handlePageChange = (value: number | null) => {
  if (value === null || value < 1) {
    targetPage.value = 1
  } else if (value > props.totalItems) {
    targetPage.value = props.totalItems
  }
}

const navigateToPage = () => {
  if (isValidPage.value) {
    emit('navigate', targetPage.value - 1)
  }
}

const onPrevious = () => {
  emit('previous')
}

const onNext = () => {
  emit('next')
}
</script>

<style lang="scss" scoped>
.universal-navigation-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 10px;

  .pagination-controls {
    display: flex;
    align-items: center;
    gap: 5px;

    .page-separator {
      color: #606266;
      font-size: 14px;
    }

    .total-pages {
      color: #606266;
      font-size: 14px;
      min-width: 30px;
      text-align: right;
    }
  }

  .el-divider {
    height: 20px;
  }

  .keyboard-hint {
    color: #c0c4cc;
    cursor: help;
  }
}
</style>
