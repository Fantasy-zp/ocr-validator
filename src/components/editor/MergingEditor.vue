/*
合并对编辑器组件
用于创建和管理样本元素之间的合并关系
*/
<template>
  <div class="merging-editor">
    <div class="editor-header">
      <div class="header-title">
        <el-icon><Link /></el-icon>
        <strong>合并对编辑器</strong>
        <el-tag size="small" type="info">
          {{ mergingPairs.length }} 个合并对
        </el-tag>
      </div>

      <div class="editor-actions">
        <el-button
          size="small"
          @click="addPair"
          :disabled="!editorStore.hasSelection"
          type="primary"
        >
          <el-icon><Plus /></el-icon>
          添加选中的合并对
          <span v-if="editorStore.hasSelection" class="selection-hint">
            [{{ editorStore.selectedLeft }}, {{ editorStore.selectedRight }}]
          </span>
        </el-button>

        <el-button
          size="small"
          @click="clearAll"
          :disabled="mergingPairs.length === 0"
        >
          <el-icon><Delete /></el-icon>
          清除所有
        </el-button>
        
        <el-button
          size="small"
          @click="resetToOriginal"
          :disabled="!datasetStore.isModified"
          type="default"
        >
          <el-icon><Refresh /></el-icon>
          重置
        </el-button>
      </div>
    </div>

    <div class="merge-pairs-container">
      <div v-if="mergingPairs.length === 0" class="empty-state">
        <el-icon size="32" color="#909399"><Connection /></el-icon>
        <p>暂无合并对</p>
        <p class="hint">选择左右两侧的元素后点击"添加"创建合并对</p>
      </div>

      <transition-group v-else name="list" tag="div" class="pairs-list">
        <div
          v-for="(pair, idx) in mergingPairs"
          :key="`${pair[0]}-${pair[1]}`"
          class="merge-pair-item"
        >
          <span class="pair-index">{{ idx + 1 }}</span>
          <span class="pair-content">
            左侧 [{{ pair[0] }}] ↔ 右侧 [{{ pair[1] }}]
          </span>
          <el-button
            text
            type="danger"
            size="small"
            @click="removePair(idx)"
          >
            <el-icon><Close /></el-icon>
          </el-button>
        </div>
      </transition-group>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete, Close, Link, Connection, Refresh } from '@element-plus/icons-vue'
import { useDatasetStore } from '@/stores/dataset'
import { useEditorStore } from '@/stores/editor'

const datasetStore = useDatasetStore()
const editorStore = useEditorStore()

const mergingPairs = computed(() =>
  datasetStore.currentSample?.merging_idx_pairs || []
)

const addPair = () => {
  if (!editorStore.hasSelection) return

  const pair = editorStore.selectionPair!

  // 检查是否已存在
  const exists = mergingPairs.value.some(
    p => p[0] === pair[0] && p[1] === pair[1]
  )

  if (exists) {
    ElMessage.warning('该合并对已存在')
    return
  }

  // 检查是否有冲突（一个元素被多次合并）
  const leftConflict = mergingPairs.value.find(p => p[0] === pair[0])
  const rightConflict = mergingPairs.value.find(p => p[1] === pair[1])

  if (leftConflict || rightConflict) {
    ElMessageBox.confirm(
      `检测到冲突：${leftConflict ? `左侧元素[${pair[0]}]已有合并` : ''} ${rightConflict ? `右侧元素[${pair[1]}]已有合并` : ''}。是否继续添加？`,
      '合并冲突',
      {
        confirmButtonText: '继续添加',
        cancelButtonText: '取消',
        type: 'warning'
      }
    ).then(() => {
      const newPairs = [...mergingPairs.value, pair]
      datasetStore.updateMergingPairs(newPairs)
      editorStore.clearSelection()
      ElMessage.success('添加成功')
    }).catch(() => {})
  } else {
    const newPairs = [...mergingPairs.value, pair]
    datasetStore.updateMergingPairs(newPairs)
    editorStore.clearSelection()
    ElMessage.success('添加成功')
  }
}

const removePair = (index: number) => {
  const newPairs = mergingPairs.value.filter((_, i) => i !== index)
  datasetStore.updateMergingPairs(newPairs)
  ElMessage.success('删除成功')
}

const clearAll = () => {
  ElMessageBox.confirm(
    `确定要清除所有 ${mergingPairs.value.length} 个合并对吗？`,
    '清除确认',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(() => {
    datasetStore.updateMergingPairs([])
    ElMessage.success('已清除所有合并对')
  }).catch(() => {})
}

const resetToOriginal = () => {
  ElMessageBox.confirm(
    '确定要重置为原始合并对吗？当前的修改将会丢失。',
    '重置确认',
    {
      confirmButtonText: '确定重置',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(() => {
    datasetStore.resetCurrentSample()
    ElMessage.success('已重置为原始状态')
  }).catch(() => {})
}
</script>

<style lang="scss" scoped>
.merging-editor {
  background: white;
  border-top: 1px solid #e4e7ed;
  box-shadow: 0 -1px 4px rgba(0, 21, 41, 0.08);

  .editor-header {
    padding: 16px 20px;
    border-bottom: 1px solid #f0f2f5;
    display: flex;
    justify-content: space-between;
    align-items: center;

    .header-title {
      display: flex;
      align-items: center;
      gap: 8px;

      strong {
        font-size: 16px;
        color: #303133;
      }
    }

    .editor-actions {
      display: flex;
      gap: 10px;

      .selection-hint {
        margin-left: 5px;
        color: #409eff;
        font-weight: bold;
      }
    }
  }

  .merge-pairs-container {
    max-height: 150px;
    overflow-y: auto;
    padding: 16px 20px;

    &::-webkit-scrollbar {
      width: 6px;
    }

    &::-webkit-scrollbar-track {
      background: #f1f1f1;
    }

    &::-webkit-scrollbar-thumb {
      background: #c0c4cc;
      border-radius: 3px;
    }

    .empty-state {
      text-align: center;
      padding: 20px;
      color: #909399;

      p {
        margin: 8px 0;

        &.hint {
          font-size: 13px;
          color: #c0c4cc;
        }
      }
    }

    .pairs-list {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .merge-pair-item {
      display: inline-flex;
      align-items: center;
      background: #f0f9ff;
      border: 1px solid #409eff;
      border-radius: 6px;
      padding: 6px 8px 6px 6px;
      transition: all 0.3s;

      &:hover {
        background: #409eff;
        color: white;

        .pair-index {
          background: white;
          color: #409eff;
        }

        .el-button {
          color: white !important;
        }
      }

      .pair-index {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        background: #409eff;
        color: white;
        border-radius: 50%;
        font-size: 12px;
        margin-right: 8px;
        font-weight: bold;
      }

      .pair-content {
        font-size: 14px;
        margin-right: 8px;
      }
    }
  }
}

// 列表动画
.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}

.list-enter-from {
  opacity: 0;
  transform: translateX(-30px);
}

.list-leave-to {
  opacity: 0;
  transform: translateX(30px);
}
</style>
