<template>
  <div class="home-page">
    <div class="hero-section">
      <div class="hero-content">
        <h1 class="hero-title">
          <el-icon size="48">
            <Document />
          </el-icon>
          OCR 数据集校验系统
        </h1>
        <p class="hero-description">
          专业的OCR训练数据集展示与校验工具，支持跨页合并检测和单页内容校验
        </p>
      </div>
    </div>

    <div class="features-section">
      <div class="features-container">
        <div class="feature-card" @click="navigateTo('/merge-validation')">
          <div class="feature-icon merge-icon">
            <el-icon size="64">
              <Connection />
            </el-icon>
          </div>
          <div class="feature-content">
            <h3>跨页合并校验</h3>
            <p>校验和修正OCR任务中的跨页合并训练数据集，可视化显示页面间的合并关系</p>
            <ul class="feature-list">
              <li>可视化合并对连接</li>
              <li>实时修改合并关系</li>
              <li>支持批量数据处理</li>
              <li>导出校验结果</li>
            </ul>
          </div>
          <div class="feature-action">
            <el-button type="primary" size="large">
              开始合并校验
              <el-icon>
                <ArrowRight />
              </el-icon>
            </el-button>
          </div>
        </div>

        <div class="feature-card" @click="navigateTo('/ocr-validation')">
          <div class="feature-icon ocr-icon">
            <el-icon size="64">
              <View />
            </el-icon>
          </div>
          <div class="feature-content">
            <h3>OCR内容校验</h3>
            <p>展示和校验OCR单页解析结果，确保内容提取的准确性和完整性</p>
            <ul class="feature-list">
              <li>PDF原文对照显示</li>
              <li>多种内容视图模式</li>
              <li>元素类型智能识别</li>
              <li>实时编辑和修正</li>
            </ul>
          </div>
          <div class="feature-action">
            <el-button type="success" size="large">
              开始内容校验
              <el-icon>
                <ArrowRight />
              </el-icon>
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <div class="stats-section">
      <div class="stats-container">
        <div class="stat-item">
          <div class="stat-number">{{ totalFiles }}</div>
          <div class="stat-label">已处理文件</div>
        </div>
        <div class="stat-item">
          <div class="stat-number">{{ totalSamples }}</div>
          <div class="stat-label">处理样本数</div>
        </div>
        <div class="stat-item">
          <div class="stat-number">{{ modifiedSamples }}</div>
          <div class="stat-label">已修改样本</div>
        </div>
      </div>
    </div>

    <div class="quick-actions">
      <el-upload :show-file-list="false" :before-upload="handleQuickUpload" accept=".jsonl" drag class="upload-dragger">
        <el-icon class="upload-icon">
          <UploadFilled />
        </el-icon>
        <div class="upload-text">
          <p>拖拽JSONL文件到这里快速开始</p>
          <p class="upload-hint">支持合并校验和内容校验格式</p>
        </div>
      </el-upload>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  Document,
  Connection,
  View,
  ArrowRight,
  UploadFilled
} from '@element-plus/icons-vue'
import { useFileManagerStore } from '@/stores/fileManager'
import { useDatasetStore } from '@/stores/dataset'
import { useOCRValidationStore } from '@/stores/ocrValidation'

const router = useRouter()
const fileManagerStore = useFileManagerStore()
const datasetStore = useDatasetStore()
const ocrStore = useOCRValidationStore()

// 在组件挂载时确保OCR数据已加载
  onMounted(async () => {
    try {
      // 确保OCR数据从本地存储加载
      await ocrStore.loadFromLocalStorage()
      
      // 如果有当前文件，同步到datasetStore
      if (fileManagerStore.currentFile) {
        datasetStore.setSamples(fileManagerStore.currentFile.samples, fileManagerStore.currentFile.currentIndex)
      }
    } catch {
      console.error('加载数据时出错')
    }
  })

// 统计数据
const totalFiles = computed(() => {
  // 合并页面的文件数 + OCR页面的文件数(0或1)
  const ocrFileCount = ocrStore.currentFileName ? 1 : 0
  return fileManagerStore.fileList.length + ocrFileCount
})
const totalSamples = computed(() => datasetStore.totalSamples + ocrStore.totalSamples)
const modifiedSamples = computed(() => datasetStore.modifiedCount + ocrStore.modifiedCount)

// 导航到指定页面
const navigateTo = (path: string) => {
  router.push(path)
}

// 快速上传处理
const handleQuickUpload = async (file: File) => {
  try {
    const text = await file.text()

    // 检查是否存在同名文件
    const hasDuplicate = fileManagerStore.fileList.some(f => f.name === file.name) ||
      (ocrStore.currentFileName && ocrStore.currentFileName === file.name)
    if (hasDuplicate) {
      ElMessage.warning('文件名已存在，请先重命名后再上传')
      return false
    }

    // 尝试解析第一行来判断数据格式
    const firstLine = text.trim().split('\n')[0]
    const sample = JSON.parse(firstLine)

    // 检查是否为合并校验格式 (Sample类型)
    if (sample.pdf_name_1 && sample.pdf_name_2 && 'merging_idx_pairs' in sample) {
      // 合并校验格式
      fileManagerStore.addFile(file.name, text)
      ElMessage.success('检测到合并校验数据，正在跳转...')
      setTimeout(() => navigateTo('/merge-validation'), 1000)
    } else if (sample.pdf_name && sample.layout_dets) {
      // OCR校验格式
      const result = await ocrStore.loadJSONL(text, file.name)
      if (result.success) {
        ElMessage.success('检测到OCR校验数据，正在跳转...')
        setTimeout(() => navigateTo('/ocr-validation'), 1000)
      }
    } else {
      ElMessage.warning('无法识别文件格式，请手动选择功能')
    }
  } catch (error) {
    ElMessage.error('文件解析失败，请检查格式')
  }
  return false
}
</script>

<style lang="scss" scoped>
.home-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

  .hero-section {
    padding: 80px 20px;
    text-align: center;
    color: white;

    .hero-content {
      max-width: 800px;
      margin: 0 auto;

      .hero-title {
        font-size: 3.5rem;
        font-weight: 700;
        margin-bottom: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 20px;

        @media (max-width: 768px) {
          font-size: 2.5rem;
          flex-direction: column;
          gap: 10px;
        }
      }

      .hero-description {
        font-size: 1.25rem;
        opacity: 0.9;
        line-height: 1.6;
      }
    }
  }

  .features-section {
    padding: 60px 20px;
    background: white;

    .features-container {
      max-width: 1200px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
      gap: 40px;

      @media (max-width: 768px) {
        grid-template-columns: 1fr;
      }
    }

    .feature-card {
      background: #f8f9ff;
      border-radius: 16px;
      padding: 32px;
      cursor: pointer;
      transition: all 0.3s ease;
      border: 2px solid transparent;

      &:hover {
        transform: translateY(-8px);
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
        border-color: #409eff;
      }

      .feature-icon {
        text-align: center;
        margin-bottom: 24px;

        &.merge-icon {
          color: #409eff;
        }

        &.ocr-icon {
          color: #67c23a;
        }
      }

      .feature-content {
        margin-bottom: 24px;

        h3 {
          font-size: 1.75rem;
          font-weight: 600;
          margin-bottom: 12px;
          color: #303133;
        }

        p {
          color: #606266;
          line-height: 1.6;
          margin-bottom: 16px;
        }

        .feature-list {
          list-style: none;
          padding: 0;

          li {
            color: #909399;
            padding: 4px 0;
            position: relative;
            padding-left: 20px;

            &:before {
              content: '✓';
              position: absolute;
              left: 0;
              color: #67c23a;
              font-weight: bold;
            }
          }
        }
      }

      .feature-action {
        text-align: center;

        .el-button {
          padding: 12px 32px;
          border-radius: 8px;
          font-size: 16px;
        }
      }
    }
  }

  .stats-section {
    padding: 40px 20px;
    background: #f5f7fa;

    .stats-container {
      max-width: 800px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 40px;
      text-align: center;

      .stat-item {
        .stat-number {
          font-size: 3rem;
          font-weight: 700;
          color: #409eff;
          margin-bottom: 8px;
        }

        .stat-label {
          color: #606266;
          font-size: 1.1rem;
        }
      }
    }
  }

  .quick-actions {
    padding: 60px 20px;
    background: white;

    .upload-dragger {
      max-width: 600px;
      margin: 0 auto;

      :deep(.el-upload-dragger) {
        border: 2px dashed #c0c4cc;
        border-radius: 12px;
        padding: 40px;
        transition: all 0.3s ease;

        &:hover {
          border-color: #409eff;
          background: #f0f9ff;
        }
      }

      .upload-icon {
        font-size: 48px;
        color: #c0c4cc;
        margin-bottom: 16px;
      }

      .upload-text {
        p {
          margin: 8px 0;

          &.upload-hint {
            color: #909399;
            font-size: 14px;
          }
        }
      }
    }
  }
}
</style>
