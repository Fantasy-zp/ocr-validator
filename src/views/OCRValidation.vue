<template>
  <div class="ocr-validation">
    <UniversalHeader :show-mode-switch="true" :show-upload="true" :show-navigation="true" :show-history="true"
      :has-data="ocrStore.hasData" :current-index="ocrStore.currentIndex" :total-items="ocrStore.totalSamples"
      :is-modified="ocrStore.isModified" :language="ocrStore.currentSample?.page_info?.language"
      :can-undo="ocrStore.canUndo" :can-redo="ocrStore.canRedo" :modified-count="ocrStore.modifiedCount"
      :extra-stats="pdfStatsText" upload-text="上传JSONL" upload-accept=".jsonl" export-text="导出数据" export-type="success"
      keyboard-hint="使用 A/D 键导航，Ctrl+Z/Y 撤销/重做" @main-upload="handleJSONLUpload" @previous="ocrStore.prevSample"
      @next="ocrStore.nextSample" @navigate="ocrStore.navigateTo" @undo="handleUndo" @redo="handleRedo"
      @export="handleExport">
      <template #extra-actions>
        <el-button @click="$router.push('/')" :icon="HomeFilled">
          返回首页
        </el-button>

        <el-upload :show-file-list="false" :before-upload="handlePDFUpload" accept=".pdf" multiple>
          <el-button :icon="DocumentAdd">
            上传PDF
          </el-button>
        </el-upload>

        <el-button @click="selectPDFFolder" :icon="FolderOpened">
          选择PDF文件夹
        </el-button>
      </template>
    </UniversalHeader>

    <main class="main-container">
      <div v-if="ocrStore.hasData" class="content-wrapper">
        <!-- 左侧PDF查看器 -->
        <div class="pdf-panel">
          <ImprovedPDFViewer :pdf-name="ocrStore.currentSample?.pdf_name" :elements="ocrStore.currentElements"
            :selected-index="ocrStore.selectedElementIndex" @element-click="ocrStore.selectElement" />
        </div>

        <!-- 右侧内容展示 -->
        <div class="content-panel">
          <OCRContentPanel :elements="ocrStore.currentElements" :view-mode="ocrStore.viewMode"
            :selected-index="ocrStore.selectedElementIndex" :page-info="ocrStore.currentSample?.page_info || null"
            @update:view-mode="ocrStore.setViewMode" @element-click="ocrStore.selectElement"
            @element-edit="handleElementEdit" @element-delete="handleElementDelete" />
        </div>
      </div>

      <div v-else class="empty-container">
        <el-empty description="请上传JSONL文件和PDF文件开始">
          <div class="upload-actions">
            <el-upload :show-file-list="false" :before-upload="handleJSONLUpload" accept=".jsonl" drag>
              <el-icon class="upload-icon">
                <UploadFilled />
              </el-icon>
              <div class="upload-text">
                <p>拖拽JSONL文件到这里开始</p>
                <p class="upload-hint">或点击下方按钮上传</p>
              </div>
            </el-upload>
            <div class="upload-buttons">
              <el-upload :show-file-list="false" :before-upload="handleJSONLUpload" accept=".jsonl">
                <el-button type="primary">上传JSONL文件</el-button>
              </el-upload>
            </div>
          </div>
        </el-empty>
      </div>
    </main>

    <OCREditor v-if="ocrStore.hasData" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  DocumentAdd,
  FolderOpened,
  HomeFilled,
  UploadFilled
} from '@element-plus/icons-vue'
import { useOCRValidationStore } from '@/stores/ocrValidation'
import { FileUtils, JSONLParser, keyboardManager } from '@/utils/helpers'
import type { LayoutElement } from '@/types'
import UniversalHeader from '@/components/layout/UniversalHeader.vue'
import ImprovedPDFViewer from '@/components/ocr/ImprovedPDFViewer.vue'
import OCRContentPanel from '@/components/ocr/OCRContentPanel.vue'
import OCREditor from '@/components/ocr/OCREditor.vue'

const ocrStore = useOCRValidationStore()

// 计算PDF统计信息
const pdfStatsText = computed(() => {
  if (ocrStore.pdfFiles.size > 0) {
    return `${ocrStore.pdfFiles.size} 个PDF`
  }
  return ''
})

// 键盘快捷键设置
const setupKeyboardShortcuts = () => {
  keyboardManager.register('a', () => {
    if (ocrStore.currentIndex > 0) {
      ocrStore.prevSample()
    }
  })

  keyboardManager.register('d', () => {
    if (ocrStore.currentIndex < ocrStore.totalSamples - 1) {
      ocrStore.nextSample()
    }
  })
}

const cleanupKeyboardShortcuts = () => {
  keyboardManager.unregister('a')
  keyboardManager.unregister('d')
}

// 处理JSONL上传
const handleJSONLUpload = async (file: File) => {
  try {
    const text = await FileUtils.readFileAsText(file)

    // 检测文件类型
    const fileType = FileUtils.detectFileType(text)
    if (fileType !== 'ocr') {
      ElMessage.warning('文件格式不匹配，请上传OCR校验格式的JSONL文件')
      return false
    }

    const result = JSONLParser.parseOCRJSONL(text)

    if (result.success) {
      // 在调用loadJSONL之前检查文件名是否重复
      if (ocrStore.currentFileName === file.name) {
        ElMessage.warning('文件名已存在，请先重命名后再上传')
        return false
      }

      // 传入文件名
      ocrStore.loadJSONL(text, file.name)

      // 这些属性已经在loadJSONL方法内部处理，不需要再次设置
      // ocrStore.currentIndex = 0
      // ocrStore.selectedElementIndex = null
      // ocrStore.modifiedSamples.clear()
      // ocrStore.editHistory = []
      // ocrStore.historyIndex = -1

      ElMessage.success(`成功加载 ${result.count} 条数据`)

      // 提示选择PDF文件夹
      if (result.count > 0) {
        ElMessageBox.confirm(
          '数据加载成功，是否选择PDF文件夹？',
          '选择PDF文件',
          {
            confirmButtonText: '选择文件夹',
            cancelButtonText: '稍后选择',
            type: 'info'
          }
        ).then(async () => {
          try {
            const count = await ocrStore.selectPDFFolder()
            ElMessage.success(`已加载 ${count} 个PDF文件`)
          } catch {
            ElMessage.warning('文件夹选择已取消')
          }
        }).catch(() => { })
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

// 处理PDF上传
const handlePDFUpload = (file: File) => {
  const files = new DataTransfer()
  files.items.add(file)
  const count = ocrStore.uploadPDFFiles(files.files)
  ElMessage.success(`已添加PDF: ${file.name}，当前共 ${count} 个PDF文件`)
  return false
}

// 选择PDF文件夹
const selectPDFFolder = async () => {
  try {
    const count = await ocrStore.selectPDFFolder()
    ElMessage.success(`已加载 ${count} 个PDF文件`)
  } catch {
    ElMessage.warning('文件夹选择已取消或不支持此功能')
  }
}

// 处理元素编辑
const handleElementEdit = (index: number, element: Partial<LayoutElement>) => {
  ocrStore.updateElement(index, element)
  ElMessage.success('元素已更新')
}

// 处理元素删除
const handleElementDelete = (index: number) => {
  ElMessageBox.confirm(
    '确定要删除这个元素吗？',
    '删除确认',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(() => {
    ocrStore.deleteElement(index)
    ElMessage.success('元素已删除')
  }).catch(() => { })
}

// 撤销操作
const handleUndo = () => {
  ocrStore.undo()
  ElMessage.success('已撤销')
}

// 重做操作
const handleRedo = () => {
  ocrStore.redo()
  ElMessage.success('已重做')
}

// 导出数据
const handleExport = () => {
  if (!ocrStore.hasData) {
    ElMessage.warning('没有数据可以导出')
    return
  }

  const data = JSONLParser.exportOCRToJSONL(ocrStore.samples)
  const fileName = `ocr_validated_${Date.now()}.jsonl`
  FileUtils.downloadFile(data, fileName)

  ElMessage.success(`成功导出 ${ocrStore.totalSamples} 条数据`)
}

onMounted(() => {
  setupKeyboardShortcuts()
  // 从本地存储加载数据，确保页面刷新后能恢复状态
  ocrStore.loadFromLocalStorage()
})

onUnmounted(() => {
  cleanupKeyboardShortcuts()
})
</script>

<style lang="scss" scoped>
.ocr-validation {
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
  display: flex;
  overflow: hidden;

  .pdf-panel {
    flex: 1;
    min-width: 0;
    background: white;
    border-right: 1px solid #e4e7ed;
  }

  .content-panel {
    flex: 1;
    min-width: 0;
    background: #f5f7fa;
  }
}

.empty-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;

  .upload-actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    max-width: 400px;
  }

  .upload-icon {
    font-size: 48px;
    color: #c0c4cc;
    margin-bottom: 16px;
  }

  .upload-text {
    text-align: center;

    p {
      margin: 8px 0;
      font-size: 16px;
      color: #606266;

      &.upload-hint {
        font-size: 14px;
        color: #909399;
      }
    }
  }

  .upload-buttons {
    display: flex;
    gap: 10px;
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
