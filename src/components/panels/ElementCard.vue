/*
元素卡片组件
用于显示单个样本的内容和元数据
*/
<template>
  <div
    :id="`${side}-${index}`"
    class="element-card"
    :class="{
      'selected': isSelected,
      'connected': isConnected
    }"
    @click="$emit('click')"
  >
    <div class="card-header">
      <span class="element-index">[{{ index }}]</span>
      <el-tag
        v-if="isConnected"
        size="small"
        type="success"
        effect="plain"
      >
        已连接
      </el-tag>
    </div>

    <div
      class="element-content"
      :class="{ 'raw': viewMode === 'raw' }"
    >
      <pre v-if="viewMode === 'raw'" class="raw-content">{{ element }}</pre>
      <div
        v-else
        class="markdown-body"
        v-html="renderedContent"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ViewMode } from '@/types'
import { renderMarkdown } from '@/utils/markdown'

const props = defineProps<{
  element: string
  index: number
  viewMode: ViewMode
  isSelected: boolean
  isConnected: boolean
  side: 'left' | 'right'
}>()

defineEmits<{
  click: []
}>()

const renderedContent = computed(() => {
  return renderMarkdown(props.element)
})
</script>

<style lang="scss" scoped>
.element-card {
  background: white;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 2px solid transparent;
  position: relative;

  &:hover {
    box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
    transform: translateY(-2px);
  }

  &.selected {
    border-color: #409eff;
    background: #ecf5ff;

    .element-index {
      background: #409eff;
    }
  }

  &.connected {
    border-color: #67c23a;

    .element-index {
      background: #67c23a;
    }
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .element-index {
    display: inline-block;
    background: #909399;
    color: white;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: bold;
    transition: background 0.3s;
  }

  .element-content {
    line-height: 1.6;

    &.raw {
      .raw-content {
        margin: 0;
        font-family: 'Courier New', Consolas, monospace;
        background: #f5f5f5;
        padding: 10px;
        border-radius: 4px;
        white-space: pre-wrap;
        word-break: break-all;
        font-size: 13px;
        color: #303133;
      }
    }
  }
}

// Markdown样式
.markdown-body {
  font-size: 14px;
  color: #303133;

  :deep(table) {
    border-collapse: collapse;
    width: 100%;
    margin: 10px 0;

    th, td {
      border: 1px solid #dcdfe6;
      padding: 8px 12px;
      text-align: left;
      font-size: 13px;
    }

    th {
      background-color: #f5f7fa;
      font-weight: 600;
      color: #303133;
    }

    tr:nth-child(even) {
      background-color: #fafafa;
    }
  }

  :deep(h1) {
    font-size: 1.5em;
    margin: 0.5em 0;
    font-weight: 600;
    color: #303133;
  }

  :deep(h2) {
    font-size: 1.3em;
    margin: 0.5em 0;
    font-weight: 600;
    color: #303133;
  }

  :deep(h3) {
    font-size: 1.1em;
    margin: 0.5em 0;
    font-weight: 600;
    color: #303133;
  }

  :deep(p) {
    margin: 0.5em 0;
  }

  :deep(ul), :deep(ol) {
    padding-left: 1.5em;
    margin: 0.5em 0;
  }

  :deep(code) {
    background-color: #f5f5f5;
    padding: 2px 4px;
    border-radius: 3px;
    font-family: 'Courier New', Consolas, monospace;
    font-size: 0.9em;
  }

  :deep(pre) {
    background-color: #f5f5f5;
    padding: 10px;
    border-radius: 4px;
    overflow-x: auto;

    code {
      background: none;
      padding: 0;
    }
  }
}
</style>
