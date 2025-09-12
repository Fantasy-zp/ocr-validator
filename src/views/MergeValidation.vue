<template>
  <div class="merge-validation">
    <UniversalHeader
      :show-mode-switch="true"
      :show-upload="true"
      :show-navigation="true"
      :show-save="true"
      :has-data="datasetStore.hasData"
      :current-index="datasetStore.currentIndex"
      :total-items="datasetStore.totalSamples"
      :is-modified="datasetStore.isModified"
      :language="datasetStore.currentSample?.language"
      :modified-count="datasetStore.modifiedCount"
      upload-text="上传JSONL文件"
      upload-accept=".jsonl"
      export-text="导出全部"
      @main-upload="handleFileUpload"
      @previous="datasetStore.prevSample"
      @next="datasetStore.nextSample"
      @navigate="datasetStore.navigateTo"
      @save="handleSave"
      @export="handleExport"
    >
      <template #extra-actions>
        <el-button @click="$router.push('/')" :icon="HomeFilled">
          返回首页
        </el-button>
        
        <el-button @click="fileManagerStore.toggleFileList" :icon="FolderOpened">
          文件管理
        </el-button>
      </template>
    </UniversalHeader>

    <main class="main-container">
      <div v-if="datasetStore.hasData" class="content-wrapper">
        <ConnectionLayer />
        <div class="panels-container">
          <ContentPanel
            :elements="datasetStore.currentSample?.md_elem_list_1 || []"
            side="left"
            :view-mode="editorStore.leftViewMode"
            :selected="editorStore.selectedLeft"
            @update:view-mode="editorStore.setLeftViewMode"
            @element-click="editorStore.selectLeftElement"
          />

          <ContentPanel
            :elements="datasetStore.currentSample?.md_elem_list_2 || []"
            side="right"
            :view-mode="editorStore.rightViewMode"
            :selected="editorStore.selectedRight"
            @update:view-mode="editorStore.setRightViewMode"
            @element-click="editorStore.selectRightElement"
          />
        </div>
      </div>

      <div v-else class="empty-container">
        <el-empty description="请上传JSONL文件开始">
          <el-upload
            :show-file-list="false"
            :before-upload="handleFileUpload"
            accept=".jsonl"
            drag
          >
            <el-icon class="upload-icon"><UploadFilled /></el-icon>
            <div class="upload-text">拖拽文件到这里或点击上传</div>
          </el-upload>
        </el-empty>
      </div>
    </main>

    <MergingEditor v-if="datasetStore.hasData" />
    <FileList />
  </div>
</template>

<script setup lang="ts">
import { watch, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { FolderOpened, HomeFilled, UploadFilled } from '@element-plus/icons-vue'
import { useDatasetStore } from '@/stores/dataset'
import { useEditorStore } from '@/stores/editor'
import { useFileManagerStore } from '@/stores/fileManager'
import { FileUtils, JSONLParser, keyboardManager } from '@/utils/helpers'
import UniversalHeader from '@/components/layout/UniversalHeader.vue'
import FileList from '@/components/layout/FileList.vue'
import ContentPanel from '@/components/panels/ContentPanel.vue'
import ConnectionLayer from '@/components/visualization/ConnectionLayer.vue'
import MergingEditor from '@/components/editor/MergingEditor.vue'

const datasetStore = useDatasetStore()
const editorStore = useEditorStore()
const fileManagerStore = useFileManagerStore()

// 清除选择当导航到新样本时
watch(() => datasetStore.currentIndex, () => {
  editorStore.clearSelection()
})

// 键盘事件处理
const setupKeyboardShortcuts = () => {
  keyboardManager.register('a', () => {
    if (datasetStore.currentIndex > 0) {
      datasetStore.prevSample()
    }
  })

  keyboardManager.register('d', () => {
    if (datasetStore.currentIndex < datasetStore.totalSamples - 1) {
      datasetStore.nextSample()
    }
  })
}

const cleanupKeyboardShortcuts = () => {
  keyboardManager.unregister('a')
  keyboardManager.unregister('d')
}

// 文件上传处理
const handleFileUpload = async (file: File) => {
  try {
    const text = await FileUtils.readFileAsText(file)

    // 检测文件类型
    const fileType = FileUtils.detectFileType(text)
    if (fileType !== 'merge') {
      ElMessage.warning('文件格式不匹配，请上传合并校验格式的JSONL文件')
      return false
    }

    // 解析数据
    const result = JSONLParser.parseMergeJSONL(text)

    if (result.success) {
      // 使用文件管理器
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
        datasetStore.samples = result.samples
        datasetStore.currentIndex = 0
        datasetStore.resetModificationStatus()
        ElMessage.success(`成功加载 ${result.count} 条数据`)
      }

      if (result.errors.length > 0) {
        console.warn('部分数据解析失败:', result.errors)
        ElMessage.warning(`${result.errors.length} 行数据解析失败，请检查控制台`)
      }
    } else {
      ElMessage.error('文件加载失败：没有有效数据')
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    ElMessage.error('文件处理失败: ' + message)
  }
  return false
}

// 保存当前修改
const handleSave = () => {
  if (fileManagerStore.currentFile && datasetStore.hasData) {
    fileManagerStore.updateCurrentFileSamples(datasetStore.samples)
    fileManagerStore.updateCurrentFileIndex(datasetStore.currentIndex)
    ElMessage.success('当前修改已保存')
  } else {
    ElMessage.warning('没有需要保存的修改')
  }
}

// 导出数据
const handleExport = () => {
  if (!datasetStore.hasData) {
    ElMessage.warning('没有数据可以导出')
    return
  }

  const data = JSONLParser.exportMergeToJSONL(datasetStore.samples)
  const fileName = `corrected_dataset_${Date.now()}.jsonl`
  FileUtils.downloadFile(data, fileName)

  ElMessage.success(`成功导出 ${datasetStore.totalSamples} 条数据`)
  datasetStore.resetModificationStatus()
}

onMounted(() => {
  setupKeyboardShortcuts()

  // 检查是否有已保存的文件数据
  if (fileManagerStore.currentFile && !datasetStore.hasData) {
    const currentFile = fileManagerStore.currentFile
    datasetStore.samples = currentFile.samples
    datasetStore.currentIndex = currentFile.currentIndex
  }
})

onUnmounted(() => {
  cleanupKeyboardShortcuts()
})
</script>

<style lang="scss" scoped>
.merge-validation {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #f5f7fa;
}

.main-container {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.content-wrapper {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.panels-container {
  display: flex;
  height: 100%;
}

.empty-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;

  .upload-icon {
    font-size: 48px;
    color: #c0c4cc;
    margin-bottom: 16px;
  }

  .upload-text {
    font-size: 16px;
    color: #606266;
  }

  :deep(.el-upload-dragger) {
    border: 2px dashed #c0c4cc;
    border-radius: 6px;
    width: 360px;
    height: 180px;
    text-align: center;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    transition: all 0.3s;

    &:hover {
      border-color: #409eff;
    }
  }
}
</style>
