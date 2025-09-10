/*
内容面板组件
用于显示样本的内容和元数据
包括渲染效果和原始文本两种视图模式
*/
<template>
  <div class="content-panel" :class="`panel-${side}`">
    <div class="panel-header">
      <el-radio-group
        :model-value="viewMode"
        @update:model-value="$emit('update:view-mode', $event)"
        size="small"
      >
        <el-radio-button label="rendered">渲染效果</el-radio-button>
        <el-radio-button label="raw">原始文本</el-radio-button>
      </el-radio-group>

      <el-tag size="small" type="info">
        {{ side === 'left' ? '第一页' : '第二页' }} ({{ elements.length }}个元素)
      </el-tag>
    </div>

    <div class="elements-container" v-if="elements.length > 0">
      <ElementCard
        v-for="(elem, idx) in elements"
        :key="idx"
        :element="elem"
        :index="idx"
        :view-mode="viewMode"
        :is-selected="selected === idx"
        :is-connected="checkConnected(idx)"
        :side="side"
        @click="handleElementClick(idx)"
      />
    </div>

    <el-empty v-else description="暂无数据" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ViewMode } from '@/types'
import { useDatasetStore } from '@/stores/dataset'
import ElementCard from './ElementCard.vue'

const props = defineProps<{
  elements: string[]
  side: 'left' | 'right'
  viewMode: ViewMode
  selected: number | null
}>()

const emit = defineEmits<{
  'update:view-mode': [mode: ViewMode]
  'element-click': [index: number]
}>()

const datasetStore = useDatasetStore()

const handleElementClick = (index: number) => {
  emit('element-click', index)
}

const checkConnected = (index: number) => {
  return datasetStore.isConnected(props.side, index)
}
</script>

<style lang="scss" scoped>
.content-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #f5f7fa;

  &.panel-left {
    border-right: 1px solid #e4e7ed;
  }

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
    padding: 20px;

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
