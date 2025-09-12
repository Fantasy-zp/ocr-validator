<template>
  <div class="pdf-viewer">
    <div class="viewer-controls">
      <el-button-group>
        <el-button @click="zoomOut" :icon="ZoomOut" size="small" />
        <el-button @click="resetZoom" size="small">
          {{ Math.round(scale * 100) }}%
        </el-button>
        <el-button @click="zoomIn" :icon="ZoomIn" size="small" />
      </el-button-group>

      <el-button @click="fitToWidth" size="small">适应宽度</el-button>

      <el-checkbox v-model="showBoundingBoxes">显示边框</el-checkbox>
      <el-checkbox v-model="showLabels">显示标签</el-checkbox>
    </div>

    <div class="viewer-container" ref="containerRef">
      <div v-if="loading" class="loading-mask">
        <el-icon class="is-loading" size="32">
          <Loading />
        </el-icon>
        <p>加载中...</p>
      </div>

      <div v-else-if="error" class="error-message">
        <el-alert :title="error" type="error" :closable="false" />
        <el-button @click="loadPDF" type="primary" size="small" class="mt-10">
          重试
        </el-button>
      </div>

      <div v-else class="pdf-canvas-container" :style="canvasContainerStyle">
        <canvas ref="canvasRef"></canvas>

        <!-- 边界框层 -->
        <div v-if="showBoundingBoxes && elements.length > 0">
          <svg class="bbox-overlay" :style="overlayStyle">
            <rect v-for="(elem, idx) in elements" :key="idx" :x="elem.poly[0] * scale" :y="elem.poly[1] * scale"
              :width="(elem.poly[2] - elem.poly[0]) * scale" :height="(elem.poly[3] - elem.poly[1]) * scale"
              :class="getBBoxClass(elem.category_type, idx)" :opacity="selectedIndex === idx ? 1 : 0.3"
              @click="$emit('element-click', idx)" />

            <g v-if="showLabels">
              <text v-for="(elem, idx) in elements" :key="`label-${idx}`" :x="elem.poly[0] * scale + 2"
                :y="elem.poly[1] * scale + 12" class="bbox-label" :opacity="selectedIndex === idx ? 1 : 0.7">
                [{{ idx }}] {{ elem.category_type }}
              </text>
            </g>
          </svg>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { ZoomIn, ZoomOut, Loading } from '@element-plus/icons-vue'
import { useOCRValidationStore } from '@/stores/ocrValidation'
import type { LayoutElement } from '@/types'
import type { CSSProperties } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'

// 设置 worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url
).toString()

interface Props {
  pdfName?: string
  elements: LayoutElement[]
  selectedIndex: number | null
}

const props = defineProps<Props>()
defineEmits<{
  'element-click': [index: number]
}>()

const ocrStore = useOCRValidationStore()

// 状态
const canvasRef = ref<HTMLCanvasElement>()
const containerRef = ref<HTMLDivElement>()
const loading = ref(false)
const error = ref('')
const scale = ref(1)
const showBoundingBoxes = ref(true)
const showLabels = ref(true)

// PDF相关 - 不使用响应式
let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null
let pageObj: pdfjsLib.PDFPageProxy | null = null
let renderTaskObj: pdfjsLib.RenderTask | null = null

// 页面尺寸
const pageWidth = ref(0)
const pageHeight = ref(0)

// 计算样式
const canvasContainerStyle = computed<CSSProperties>(() => ({
  width: `${pageWidth.value * scale.value}px`,
  height: `${pageHeight.value * scale.value}px`,
  position: 'relative' as const
}))

const overlayStyle = computed<CSSProperties>(() => ({
  width: `${pageWidth.value * scale.value}px`,
  height: `${pageHeight.value * scale.value}px`,
  position: 'absolute' as const,
  top: 0,
  left: 0,
  pointerEvents: 'all' as const
}))

// 获取边界框CSS类
const getBBoxClass = (type: string, index: number) => {
  const classes = ['bbox', `bbox-${type}`]
  if (props.selectedIndex === index) {
    classes.push('bbox-selected')
  }
  return classes.join(' ')
}

// 重试计时器引用
let retryTimer: number | null = null
let retryAttempts = 0
const maxRetryAttempts = 3
const retryDelay = 1000 // 1秒

// 加载并渲染PDF
const loadPDF = async () => {
  if (!props.pdfName) return

  // 清除之前的重试计时器
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }

  loading.value = true
  error.value = ''

  try {
    // 获取PDF文件 - 使用带缓存的方法
    const pdfFile = await ocrStore.getPDFFileWithCache(props.pdfName)
    if (!pdfFile) {
      // 如果找不到PDF文件，检查是否有目录句柄
      if (ocrStore.pdfDirectoryHandle) {
        // 如果有目录句柄但找不到文件，显示更友好的错误信息
        throw new Error(`找不到PDF文件: ${props.pdfName}，请确保文件存在于所选文件夹中`)
      } else {
        // 如果没有目录句柄，提示用户需要选择文件夹
        throw new Error(`请选择包含PDF文件的文件夹`)
      }
    }

    // 重置重试计数
    retryAttempts = 0

    // 转换为ArrayBuffer
    const arrayBuffer = await pdfFile.arrayBuffer()

    // 加载PDF文档 - 不使用响应式
    const loadingTask = pdfjsLib.getDocument(arrayBuffer)
    pdfDoc = await loadingTask.promise

    // 获取第一页（唯一页）
    pageObj = await pdfDoc.getPage(1)

    // 先设置loading为false让canvas显示
    loading.value = false

    // 使用 requestAnimationFrame 确保DOM更新
    requestAnimationFrame(() => {
      renderPage()
    })

  } catch (err: unknown) {
    console.error('PDF加载失败:', err)
    
    // 判断是否需要自动重试
    if (retryAttempts < maxRetryAttempts && ocrStore.pdfDirectoryHandle === null) {
      // 如果没有目录句柄且重试次数未达到上限，尝试自动重试
      retryAttempts++
      loading.value = true
      error.value = ''

      console.log(`PDF加载失败，${retryDelay}ms后自动重试 (${retryAttempts}/${maxRetryAttempts})`)

      retryTimer = setTimeout(() => {
        loadPDF()
      }, retryDelay)

      return
    }
    
    // 显示友好的错误信息
    if (ocrStore.pdfDirectoryHandle === null) {
      error.value = '正在等待PDF文件夹选择...'
    } else if (err instanceof Error) {
      error.value = `加载失败: ${err.message}`
    } else {
      error.value = '加载失败: 未知错误'
    }

    loading.value = false
  }
}

// 渲染页面
const renderPage = async () => {
  if (!pageObj || !canvasRef.value) {
    console.log('等待canvas或page...')
    return
  }

  try {
    // 取消之前的渲染
    if (renderTaskObj) {
      renderTaskObj.cancel()
      renderTaskObj = null
    }

    const canvas = canvasRef.value
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 获取视口
    const viewport = pageObj.getViewport({ scale: scale.value })

    // 设置canvas尺寸
    canvas.width = viewport.width
    canvas.height = viewport.height

    // 更新页面尺寸
    pageWidth.value = viewport.width / scale.value
    pageHeight.value = viewport.height / scale.value

    // 渲染
    const renderContext = {
      canvasContext: ctx,
      viewport: viewport
    }

    renderTaskObj = pageObj.render(renderContext)
    await renderTaskObj.promise
    renderTaskObj = null

  } catch (err: unknown) {
    if (err instanceof Error && err.name !== 'RenderingCancelledException') {
      console.error('渲染失败:', err)
      error.value = `渲染失败: ${err.message}`
    }
  }
}

// 缩放控制
const zoomIn = () => {
  scale.value = Math.min(scale.value * 1.2, 3)
  renderPage()
}

const zoomOut = () => {
  scale.value = Math.max(scale.value / 1.2, 0.5)
  renderPage()
}

const resetZoom = () => {
  scale.value = 1
  renderPage()
}

const fitToWidth = () => {
  if (!containerRef.value || !pageWidth.value) return
  const containerWidth = containerRef.value.clientWidth - 40
  scale.value = containerWidth / pageWidth.value
  renderPage()
}

// 监听选中元素变化
watch(() => props.selectedIndex, (index) => {
  if (index !== null && props.elements[index] && containerRef.value) {
    const elem = props.elements[index]
    const y = elem.poly[1] * scale.value

    containerRef.value.scrollTo({
      top: Math.max(0, y - 100),
      behavior: 'smooth'
    })
  }
})

// 监听PDF名称变化
watch(() => props.pdfName, (newName) => {
  if (newName) {
    loadPDF()
  }
})

// 监听PDF文件夹变化，在选择文件夹后自动重试加载PDF
watch(() => ocrStore.pdfDirectoryHandle, async (newHandle) => {
  if (newHandle && props.pdfName) {
    // 如果有文件夹且有PDF名称，自动重试加载PDF
    console.log('检测到PDF文件夹可用，自动尝试加载PDF:', props.pdfName);
    await loadPDF();
  }
})

onMounted(() => {
  if (props.pdfName) {
    // 初始加载前短暂等待，给文件夹句柄恢复一些时间
    setTimeout(() => {
      loadPDF()
    }, 200);
  }
})

onUnmounted(() => {
  // 清理资源
  if (renderTaskObj) {
    renderTaskObj.cancel()
  }
  if (pdfDoc) {
    pdfDoc.destroy()
  }
})
</script>

<style lang="scss" scoped>
.pdf-viewer {
  height: 100%;
  display: flex;
  flex-direction: column;

  .viewer-controls {
    padding: 10px;
    background: #f5f7fa;
    border-bottom: 1px solid #e4e7ed;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .viewer-container {
    flex: 1;
    overflow: auto;
    padding: 20px;
    background: #909399;
    display: flex;
    justify-content: center;

    .loading-mask {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: white;
      gap: 10px;
    }

    .error-message {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      max-width: 400px;
    }

    .pdf-canvas-container {
      background: white;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      border-radius: 4px;
      overflow: hidden;

      canvas {
        display: block;
      }
    }
  }
}

.bbox-overlay {
  .bbox {
    stroke-width: 2;
    fill: none;
    cursor: pointer;
    transition: all 0.3s;

    &:hover {
      opacity: 0.8 !important;
      stroke-width: 3;
    }

    &-text {
      stroke: #409eff;
      fill: rgba(64, 158, 255, 0.1);
    }

    &-table {
      stroke: #67c23a;
      fill: rgba(103, 194, 58, 0.1);
    }

    &-title {
      stroke: #f56c6c;
      fill: rgba(245, 108, 108, 0.1);
    }

    &-figure {
      stroke: #909399;
      fill: rgba(144, 147, 153, 0.1);
    }

    &-selected {
      stroke-width: 3;
      opacity: 1 !important;
      fill-opacity: 0.2 !important;
    }
  }

  .bbox-label {
    font-size: 10px;
    fill: #303133;
    user-select: none;
    pointer-events: none;
    font-weight: 500;
  }
}

.mt-10 {
  margin-top: 10px;
}
</style>
