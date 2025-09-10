/*
导航栏组件
包含上一个样本、下一个样本、当前样本索引和总样本数
*/
<template>
  <div class="navigation-bar">
    <el-button
      :icon="ArrowLeft"
      @click="datasetStore.prevSample()"
      :disabled="datasetStore.currentIndex === 0"
      circle
      size="small"
    />

    <div class="pagination-controls">
      <el-input-number
        v-model="targetPage"
        :min="1"
        :max="datasetStore.totalSamples"
        size="small"
        :controls-position="'right'"
        @change="handlePageChange"
        @keyup.enter="navigateToPage"
      />
      <span class="page-separator">/</span>
      <span class="total-pages">{{ datasetStore.totalSamples }}</span>
      <el-button
        size="small"
        @click="navigateToPage"
        :disabled="!isValidPage || datasetStore.currentIndex + 1 === targetPage"
        type="primary"
      >
        跳转
      </el-button>
    </div>

    <el-button
      :icon="ArrowRight"
      @click="datasetStore.nextSample()"
      :disabled="datasetStore.currentIndex === datasetStore.totalSamples - 1"
      circle
      size="small"
    />

    <el-divider direction="vertical" />

    <el-tag :type="datasetStore.isModified ? 'warning' : 'info'">
      {{ datasetStore.isModified ? '已修改' : '未修改' }}
    </el-tag>

    <el-tag type="success" v-if="datasetStore.currentSample">
      {{ datasetStore.currentSample.language === 'zh' ? '中文' : '英文' }}
    </el-tag>

    <el-tooltip content="使用 A/D 键导航" placement="right">
        <el-icon size="16" class="keyboard-hint">
          <Monitor />
        </el-icon>
      </el-tooltip>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ArrowLeft, ArrowRight, Monitor } from '@element-plus/icons-vue'
import { useDatasetStore } from '@/stores/dataset'

const datasetStore = useDatasetStore()
const targetPage = ref(1)

// 监听当前页面变化，同步更新输入框的值
watch(() => datasetStore.currentIndex, (newIndex) => {
  targetPage.value = newIndex + 1
})

// 初始化时设置为当前页面
watch(() => datasetStore.hasData, (hasData) => {
  if (hasData) {
    targetPage.value = datasetStore.currentIndex + 1
  }
}, { immediate: true })

// 检查是否是有效的页面
const isValidPage = computed(() => {
  return targetPage.value >= 1 && targetPage.value <= datasetStore.totalSamples
})

// 处理页码输入变化
const handlePageChange = (value: number | null) => {
  if (value === null || value < 1) {
    targetPage.value = 1
  } else if (value > datasetStore.totalSamples) {
    targetPage.value = datasetStore.totalSamples
  }
}

// 跳转到指定页面
const navigateToPage = () => {
  if (isValidPage.value) {
    datasetStore.navigateTo(targetPage.value - 1)
  }
}
</script>

<style lang="scss" scoped>
.navigation-bar {
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
}</style>
