<template>
  <div id="app">
    <AppHeader />

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
          >
            <el-button type="primary">选择文件</el-button>
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
import { useDatasetStore } from './stores/dataset'
import { useEditorStore } from './stores/editor'
import { useFileManagerStore } from './stores/fileManager'
import AppHeader from './components/layout/AppHeader.vue'
import FileList from './components/layout/FileList.vue'
import ContentPanel from './components/panels/ContentPanel.vue'
import ConnectionLayer from './components/visualization/ConnectionLayer.vue'
import MergingEditor from './components/editor/MergingEditor.vue'

const datasetStore = useDatasetStore()
const editorStore = useEditorStore()
const fileManagerStore = useFileManagerStore()

// 清除选择当导航到新样本时
watch(() => datasetStore.currentIndex, () => {
  editorStore.clearSelection()
})

// 键盘事件处理 - 支持A/D键翻页
const handleKeydown = (event: KeyboardEvent) => {
  // 只有在数据集有数据且没有输入框处于焦点状态时才处理
  if (!datasetStore.hasData || document.activeElement instanceof HTMLInputElement) {
    return
  }

  switch (event.key.toLowerCase()) {
    case 'a':
      // 阻止默认行为，避免页面滚动
      event.preventDefault()
      if (datasetStore.currentIndex > 0) {
        datasetStore.prevSample()
      }
      break
    case 'd':
      // 阻止默认行为，避免页面滚动
      event.preventDefault()
      if (datasetStore.currentIndex < datasetStore.totalSamples - 1) {
        datasetStore.nextSample()
      }
      break
  }
}

// 组件挂载时添加键盘事件监听
onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

// 组件卸载时移除键盘事件监听
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})

// 文件上传处理
const handleFileUpload = async (file: File) => {
  try {
    const text = await file.text()
    const result = datasetStore.loadJSONL(text)

    if (result.success) {
      ElMessage.success(`成功加载 ${result.count} 条数据`)
      if (result.errors.length > 0) {
        console.warn('部分数据解析失败:', result.errors)
      }
    } else {
      ElMessage.error('文件加载失败：没有有效数据')
    }
  } catch (error: unknown) {
    ElMessage.error('文件读取失败: ' + (error instanceof Error ? error.message : String(error)))
  }
  return false
}

// 应用初始化时，从fileManagerStore加载当前文件数据
onMounted(() => {
  // 检查是否有已保存的文件数据
  if (fileManagerStore.currentFile && !datasetStore.hasData) {
    const currentFile = fileManagerStore.currentFile
    datasetStore.samples = currentFile.samples
    datasetStore.currentIndex = currentFile.currentIndex
  }
})
</script>

<style lang="scss" scoped>
#app {
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
}
</style>
