<template>
  <el-drawer
    v-model="fileManagerStore.fileListVisible"
    title="文件管理"
    :size="320"
    direction="ltr"
  >
    <div class="file-list-container">
      <!-- 文件列表 -->
      <div class="file-list">
        <div class="list-header">
          <span>工作区文件</span>
          <el-tag size="small" type="info">
            {{ fileManagerStore.fileList.length }} 个文件
          </el-tag>
        </div>

        <el-scrollbar v-if="fileManagerStore.hasFiles" height="400px">
          <div
            v-for="file in fileManagerStore.fileList"
            :key="file.id"
            class="file-item"
            :class="{ active: file.id === fileManagerStore.currentFileId }"
            @click="handleFileSelect(file.id)"
          >
            <div class="file-info">
              <div class="file-name">
                <el-icon><Document /></el-icon>
                <span>{{ file.name }}</span>
              </div>
              <div class="file-meta">
                <el-tag size="small">{{ file.totalCount }} 条</el-tag>
                <span class="file-time">
                  {{ formatTime(file.modifiedTime) }}
                </span>
              </div>
            </div>

            <el-dropdown
              trigger="click"
              @command="(cmd: string) => handleFileCommand(cmd, file.id)"
              @click.stop
            >
              <el-button text :icon="MoreFilled" />
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="export">
                    <el-icon><Download /></el-icon>
                    导出
                  </el-dropdown-item>
                  <el-dropdown-item command="rename">
                    <el-icon><Edit /></el-icon>
                    重命名
                  </el-dropdown-item>
                  <el-dropdown-item command="duplicate">
                    <el-icon><CopyDocument /></el-icon>
                    复制
                  </el-dropdown-item>
                  <el-dropdown-item command="delete" divided>
                    <el-icon color="#f56c6c"><Delete /></el-icon>
                    <span style="color: #f56c6c">删除</span>
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </el-scrollbar>

        <el-empty
          v-else
          description="暂无文件"
          :image-size="80"
        />
      </div>

      <!-- 操作按钮 -->
      <div class="file-actions">
        <el-upload
          :show-file-list="false"
          :before-upload="handleUpload"
          accept=".jsonl"
          class="upload-btn"
        >
          <el-button type="primary" :icon="Plus">
            添加文件
          </el-button>
        </el-upload>

        <el-button
          @click="clearWorkspace"
          :disabled="!fileManagerStore.hasFiles"
          :icon="Delete"
        >
          清空工作区
        </el-button>
      </div>

      <!-- 统计信息 -->
      <div class="workspace-stats" v-if="fileManagerStore.hasFiles">
        <el-divider />
        <div class="stats-item">
          <span>总文件数：</span>
          <strong>{{ fileManagerStore.fileList.length }}</strong>
        </div>
        <div class="stats-item">
          <span>总样本数：</span>
          <strong>{{ totalSamples }}</strong>
        </div>
        <div class="stats-item">
          <span>已修改：</span>
          <strong>{{ modifiedSamples }}</strong>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Document,
  MoreFilled,
  Download,
  Edit,
  CopyDocument,
  Delete,
  Plus
} from '@element-plus/icons-vue'
import { useFileManagerStore, type DatasetFile } from '@/stores/fileManager'
import { useDatasetStore } from '@/stores/dataset'
import { exportToJSONL } from '@/utils/markdown'

const fileManagerStore = useFileManagerStore()
const datasetStore = useDatasetStore()

// 计算属性
const totalSamples = computed(() => {
  return fileManagerStore.fileList.reduce((sum, file) => sum + file.totalCount, 0)
})

const modifiedSamples = computed(() => {
  // 计算所有文件中被修改的样本数
  let count = 0
  fileManagerStore.fileList.forEach(file => {
    file.samples.forEach(sample => {
      const current = JSON.stringify(sample.merging_idx_pairs.sort())
      const original = JSON.stringify(sample.original_pairs?.sort() || [])
      if (current !== original) count++
    })
  })
  return count
})

// 格式化时间
function formatTime(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))

  if (hours < 1) {
    const minutes = Math.floor(diff / (1000 * 60))
    return minutes < 1 ? '刚刚' : `${minutes}分钟前`
  } else if (hours < 24) {
    return `${hours}小时前`
  } else {
    return date.toLocaleDateString()
  }
}

// 选择文件
function handleFileSelect(fileId: string) {
  // 保存当前数据集的修改
  if (datasetStore.hasData) {
    fileManagerStore.updateCurrentFileSamples(datasetStore.samples)
  }

  // 切换文件
  fileManagerStore.switchFile(fileId)

  // 加载新文件的数据
  const file = fileManagerStore.currentFile
  if (file) {
    datasetStore.samples = file.samples
    datasetStore.currentIndex = file.currentIndex
    ElMessage.success(`已切换到: ${file.name}`)
  }
}

// 上传文件
async function handleUpload(file: File) {
  try {
    const text = await file.text()
    const fileId = fileManagerStore.addFile(file.name, text)

    // 自动切换到新文件
    handleFileSelect(fileId)

    ElMessage.success(`成功添加文件: ${file.name}`)
  } catch (error: unknown) {
    ElMessage.error('文件添加失败: ' + (error instanceof Error ? error.message : String(error)))
  }
  return false
}

// 文件操作命令
function handleFileCommand(command: string, fileId: string) {
  const file = fileManagerStore.files.get(fileId)
  if (!file) return

  switch (command) {
    case 'export':
      exportFile(file)
      break
    case 'delete':
      deleteFile(fileId, file.name)
      break
    case 'rename':
      renameFile(fileId, file.name)
      break
    case 'duplicate':
      duplicateFile(fileId, file.name)
      break
  }
}

// 导出文件
function exportFile(file: DatasetFile) {
  const data = exportToJSONL(file.samples)
  const blob = new Blob([data], { type: 'application/jsonl' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  URL.revokeObjectURL(url)

  ElMessage.success(`已导出: ${file.name}`)
}

// 删除文件
function deleteFile(fileId: string, fileName: string) {
  ElMessageBox.confirm(
    `确定要删除文件 "${fileName}" 吗？此操作不可恢复。`,
    '删除确认',
    {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(() => {
    fileManagerStore.removeFile(fileId)

    // 如果删除后没有文件了，清空数据集
    if (!fileManagerStore.hasFiles) {
      datasetStore.samples = []
      datasetStore.currentIndex = 0
    }

    ElMessage.success('文件已删除')
  }).catch(() => {})
}

// 重命名文件
function renameFile(fileId: string, currentName: string) {
  ElMessageBox.prompt(
    '请输入新的文件名',
    '重命名文件',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputValue: currentName,
      inputPattern: /^[^\/\\:*?"<>|]+\.jsonl$/i,
      inputErrorMessage: '文件名格式不正确，请输入有效的.jsonl文件名'
    }
  ).then(({ value }) => {
    // 检查是否与其他文件重名
    const hasDuplicate = fileManagerStore.fileList.some(file => 
      file.id !== fileId && file.name === value
    )
    
    if (hasDuplicate) {
      ElMessage.error('文件名已存在，请选择其他名称')
      return
    }
    
    fileManagerStore.renameFile(fileId, value)
    ElMessage.success('文件重命名成功')
  }).catch(() => {})
}

// 复制文件
function duplicateFile(fileId: string, fileName: string) {
  try {
    fileManagerStore.duplicateFile(fileId)
    ElMessage.success(`文件 "${fileName}" 复制成功`)
  } catch (error: unknown) {
    ElMessage.error('文件复制失败: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// 清空工作区
function clearWorkspace() {
  ElMessageBox.confirm(
    '确定要清空整个工作区吗？所有文件和修改都将丢失。',
    '清空工作区',
    {
      confirmButtonText: '确定清空',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(() => {
    fileManagerStore.clearWorkspace()
    datasetStore.samples = []
    datasetStore.currentIndex = 0
    ElMessage.success('工作区已清空')
  }).catch(() => {})
}
</script>

<style lang="scss" scoped>
.file-list-container {
  height: 100%;
  display: flex;
  flex-direction: column;

  .file-list {
    flex: 1;

    .list-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 0;
      margin-bottom: 10px;
      border-bottom: 1px solid #e4e7ed;

      span {
        font-weight: 600;
        font-size: 14px;
      }
    }

    .file-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px;
      margin-bottom: 8px;
      background: #f5f7fa;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.3s;

      &:hover {
        background: #e6f7ff;
      }

      &.active {
        background: #409eff;
        color: white;

        .file-meta {
          color: white;
        }

        .el-tag {
          background: white;
          color: #409eff;
        }
      }

      .file-info {
        flex: 1;
        overflow: hidden;

        .file-name {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 14px;
          font-weight: 500;
          margin-bottom: 6px;

          span {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
        }

        .file-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: #909399;

          .file-time {
            color: inherit;
          }
        }
      }
    }
  }

  .file-actions {
    display: flex;
    gap: 10px;
    padding: 16px 0;
    border-top: 1px solid #e4e7ed;
    position: relative;

    .upload-btn {
      flex: 1;
      height: 36px; /* 恢复原按钮高度 */
      position: relative;

      :deep(.el-button) {
        width: 100%;
        height: 100%;
        min-width: 0; /* 允许按钮收缩 */
        display: inline-flex;
        align-items: center;
        justify-content: center;
        position: relative;
      }
    }

    /* 清空工作区按钮样式 */
    > :last-child {
      flex: 1;
      height: 36px; /* 恢复原按钮高度 */
      min-width: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    /* 确保按钮完整区域可点击的关键样式 */
    :deep(.el-button) {
      position: relative;
      width: 100%;
      height: 100%;
      /* 移除过多的强制覆盖样式，保留必要的点击区域设置 */
    }

    /* 确保上传组件正确显示 */
    :deep(.el-upload) {
      width: 100%;
      height: 100%;
    }

    /* 确保图标和文本正确显示 */
    :deep(.el-button__icon),
    :deep(.el-button__text) {
      position: relative;
    }
  }

  .workspace-stats {
    .stats-item {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      font-size: 14px;

      span {
        color: #909399;
      }

      strong {
        color: #303133;
      }
    }
  }
}
</style>
