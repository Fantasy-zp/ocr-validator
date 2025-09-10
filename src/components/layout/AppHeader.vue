/*
应用头部组件(顶部控制栏)
包含上传按钮、导航栏和操作按钮
*/
<template>
  <header class="app-header">
    <div class="header-left">
      <el-upload
        :show-file-list="false"
        :before-upload="handleFileUpload"
        accept=".jsonl"
      >
        <el-button type="primary" :icon="UploadFilled">
          上传JSONL文件
        </el-button>
      </el-upload>

      <NavigationBar v-if="datasetStore.hasData" />
    </div>

    <div class="header-right">
      <el-button
        @click="fileManagerStore.toggleFileList"
        :disabled="!fileManagerStore.hasFiles"
        :icon="FolderOpened"
      >
        文件管理
      </el-button>
      
      <el-button
        @click="saveCurrentChanges"
        :disabled="!datasetStore.isModified"
        type="success"
        :icon="Select"
      >
        保存当前
      </el-button>

      <el-button
        @click="exportAll"
        :disabled="!datasetStore.hasData"
        :icon="Download"
      >
        导出全部
        <el-badge
          v-if="datasetStore.modifiedCount > 0"
          :value="datasetStore.modifiedCount"
          class="modified-badge"
        />
      </el-button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { UploadFilled, Select, Download, FolderOpened } from '@element-plus/icons-vue'
import { useDatasetStore } from '@/stores/dataset'
import { useFileManagerStore } from '@/stores/fileManager'
import NavigationBar from './NavigationBar.vue'

const datasetStore = useDatasetStore()
const fileManagerStore = useFileManagerStore()

const handleFileUpload = async (file: File) => {
  try {
    const text = await file.text()

    // 如果使用文件管理器
    if (fileManagerStore) {
      const fileId = fileManagerStore.addFile(file.name, text)
      const addedFile = fileManagerStore.files.get(fileId)

      if (addedFile) {
        datasetStore.samples = addedFile.samples
        datasetStore.currentIndex = 0
        ElMessage.success(`成功加载 ${addedFile.totalCount} 条数据`)
      }
    } else {
      // 直接加载到数据集
      const result = datasetStore.loadJSONL(text)

      if (result.success) {
        ElMessage.success(`成功加载 ${result.count} 条数据`)
        if (result.errors.length > 0) {
          console.warn('部分数据解析失败:', result.errors)
        }
      } else {
        ElMessage.error('文件加载失败：没有有效数据')
      }
    }
  } catch (error: unknown) {
    ElMessage.error('文件读取失败: ' + (error instanceof Error ? error.message : String(error)))
  }
  return false
}

const saveCurrentChanges = () => {
  // 保存当前文件的样本修改
  if (datasetStore.hasData) {
    fileManagerStore.updateCurrentFileSamples(datasetStore.samples)
    // 清除修改标记，因为已经保存了
    datasetStore.resetModificationStatus()
    ElMessage.success('当前修改已保存')
  }
}

const exportAll = () => {
  const data = datasetStore.exportData()
  const blob = new Blob([data], { type: 'application/jsonl' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `corrected_dataset_${Date.now()}.jsonl`
  a.click()
  URL.revokeObjectURL(url)

  ElMessage.success(`成功导出 ${datasetStore.totalSamples} 条数据`)
}
</script>

<style lang="scss" scoped>
.app-header {
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);

  .header-left {
    display: flex;
    align-items: center;
    gap: 20px;
  }

  .header-right {
    display: flex;
    gap: 10px;

    .modified-badge {
      margin-left: 5px;
    }
  }
}
</style>
