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



      <!-- 拖拽模式按钮 -->
      <el-button :type="props.enableDragging ? 'primary' : ''" size="small" @click="$emit('toggle-dragging')"
        style="margin-left: 10px;">
        {{ props.enableDragging ? '退出拖拽模式' : '进入拖拽模式' }}
      </el-button>

      <el-tooltip v-if="props.enableDragging" content="拖拽模式下，可通过拖拽边界框或调整手柄来精确修改元素坐标">
        <el-tag size="small" type="info" style="margin-left: 10px;">
          拖拽模式
        </el-tag>
      </el-tooltip>

      <el-tag v-if="pdfName" type="info" class="pdf-name-tag">
        {{ pdfName }}
      </el-tag>
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
          <!-- 注意：canvas已经被PDF.js旋转，所以我们需要在SVG上应用相反的旋转来保持边界框与内容对齐 -->
          <svg class="bbox-overlay" :style="overlayStyle">
            <g>
              <!-- 不再对SVG内容应用旋转变换，边界框将保持在原始位置 -->
              <g>
                <g v-for="(elem, idx) in elements" :key="`elem-${idx}-${elem.order}`">
                  <!-- 计算旋转后的坐标 - 使用原始坐标，让SVG的transform属性处理旋转 -->
                  <rect
                    :x="(tempEditedPoly && draggedElementIndex === idx) ? tempEditedPoly[0] * scale : elem.poly[0] * scale"
                    :y="(tempEditedPoly && draggedElementIndex === idx) ? tempEditedPoly[1] * scale : elem.poly[1] * scale"
                    :width="((tempEditedPoly && draggedElementIndex === idx) ? (tempEditedPoly[2] - tempEditedPoly[0]) : (elem.poly[2] - elem.poly[0])) * scale"
                    :height="((tempEditedPoly && draggedElementIndex === idx) ? (tempEditedPoly[3] - tempEditedPoly[1]) : (elem.poly[3] - elem.poly[1])) * scale"
                    :class="getBBoxClass(elem.category_type, idx)" :opacity="selectedIndex === idx ? 1 : 0.3"
                    @click="handleElementClick($event, idx)" @mousedown="handleBBoxMouseDown($event, idx)" />

                  <!-- 当元素被选中且开启拖拽模式时，显示调整手柄 -->
                  <g v-if="props.enableDragging && selectedIndex === idx && !isDragging">
                    <!-- 四个角落的调整手柄 -->
                    <circle
                      :cx="(tempEditedPoly && draggedElementIndex === idx) ? tempEditedPoly[0] * scale : elem.poly[0] * scale"
                      :cy="(tempEditedPoly && draggedElementIndex === idx) ? tempEditedPoly[1] * scale : elem.poly[1] * scale"
                      r="5" class="resize-handle nw" @mousedown="handleResizeMouseDown($event, idx, 'nw')" />
                    <circle
                      :cx="(tempEditedPoly && draggedElementIndex === idx) ? tempEditedPoly[2] * scale : elem.poly[2] * scale"
                      :cy="(tempEditedPoly && draggedElementIndex === idx) ? tempEditedPoly[1] * scale : elem.poly[1] * scale"
                      r="5" class="resize-handle ne" @mousedown="handleResizeMouseDown($event, idx, 'ne')" />
                    <circle
                      :cx="(tempEditedPoly && draggedElementIndex === idx) ? tempEditedPoly[2] * scale : elem.poly[2] * scale"
                      :cy="(tempEditedPoly && draggedElementIndex === idx) ? tempEditedPoly[3] * scale : elem.poly[3] * scale"
                      r="5" class="resize-handle se" @mousedown="handleResizeMouseDown($event, idx, 'se')" />
                    <circle
                      :cx="(tempEditedPoly && draggedElementIndex === idx) ? tempEditedPoly[0] * scale : elem.poly[0] * scale"
                      :cy="(tempEditedPoly && draggedElementIndex === idx) ? tempEditedPoly[3] * scale : elem.poly[3] * scale"
                      r="5" class="resize-handle sw" @mousedown="handleResizeMouseDown($event, idx, 'sw')" />
                  </g>
                </g>

                <!-- 标签文本 -->
                <g v-if="showLabels">
                  <text v-for="(elem, idx) in elements" :key="`label-${idx}`"
                    :x="(tempEditedPoly && draggedElementIndex === idx) ? tempEditedPoly[0] * scale + 2 : elem.poly[0] * scale + 2"
                    :y="(tempEditedPoly && draggedElementIndex === idx) ? tempEditedPoly[1] * scale + 12 : elem.poly[1] * scale + 12"
                    class="bbox-label" :opacity="selectedIndex === idx ? 1 : 0.7">
                    [{{ idx }}] {{ elem.category_type }}
                  </text>
                </g>
              </g>
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
import * as pdfjsLib from 'pdfjs-dist'
import type { LayoutElement } from '@/types'
import { useOCRValidationStore } from '@/stores/ocrValidation'
import type { CSSProperties } from 'vue'

// 设置 PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url
).toString()

// Props
interface Props {
  pdfName: string | null | undefined
  elements: LayoutElement[]
  selectedIndex: number | null
  enableDragging: boolean
}

const props = defineProps<Props>()

// Emits
const emit = defineEmits<{
  'element-click': [index: number]
  'update-element': [index: number, updates: Partial<LayoutElement>]
  'toggle-dragging': []
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

// 拖拽相关状态
const isDragging = ref(false)
const dragType = ref<'move' | 'resize-nw' | 'resize-ne' | 'resize-se' | 'resize-sw' | null>(null)
const dragStartPos = ref({ x: 0, y: 0 })
const dragStartPoly = ref<number[]>([])
const tempEditedPoly = ref<number[] | null>(null)
const draggedElementIndex = ref<number | null>(null)

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

// 计算属性

// 获取边界框CSS类
const getBBoxClass = (type: string, index: number) => {
  // 规范化类型名称，确保它是有效的CSS类名
  const normalizedType = type.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')
  const classes = ['bbox', `bbox-${normalizedType}`]
  if (props.selectedIndex === index) {
    classes.push('bbox-selected')
  }
  return classes.join(' ')
}

// 处理元素点击事件
const handleElementClick = (event: MouseEvent, index: number) => {
  const containerRect = containerRef.value!.getBoundingClientRect()
  const x = event.clientX - containerRect.left
  const y = event.clientY - containerRect.top

  const elem = props.elements[index]
  const x1 = (tempEditedPoly.value && draggedElementIndex.value === index) ? tempEditedPoly.value[0] * scale.value : elem.poly[0] * scale.value
  const y1 = (tempEditedPoly.value && draggedElementIndex.value === index) ? tempEditedPoly.value[1] * scale.value : elem.poly[1] * scale.value
  const x2 = (tempEditedPoly.value && draggedElementIndex.value === index) ? tempEditedPoly.value[2] * scale.value : elem.poly[2] * scale.value
  const y2 = (tempEditedPoly.value && draggedElementIndex.value === index) ? tempEditedPoly.value[3] * scale.value : elem.poly[3] * scale.value

  if (x >= x1 && x <= x2 && y >= y1 && y <= y2) {
    emit('element-click', index)
  }
}

// 拖拽事件处理
const handleBBoxMouseDown = (event: MouseEvent, index: number) => {
  if (!props.enableDragging) {
    return
  }

  event.stopPropagation()
  startDragging(event, index, 'move')
}

const handleResizeMouseDown = (event: MouseEvent, index: number, type: string) => {
  event.stopPropagation()
  startDragging(event, index, `resize-${type}`)
}

const startDragging = (event: MouseEvent, index: number, type: string) => {
  isDragging.value = true
  dragType.value = type === 'move' ? 'move' : `resize-${type.split('-')[1]}` as 'resize-nw' | 'resize-ne' | 'resize-se' | 'resize-sw'
  draggedElementIndex.value = index

  dragStartPos.value = { x: event.clientX, y: event.clientY }
  dragStartPoly.value = [...props.elements[index].poly]
  tempEditedPoly.value = [...props.elements[index].poly]

  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)

  // 防止文本选择
  document.body.style.userSelect = 'none'
}

const handleMouseMove = (event: MouseEvent) => {
  if (!isDragging.value || draggedElementIndex.value === null || !tempEditedPoly.value) {
    return
  }

  // 计算相对于拖拽起始点的偏移
  const dx = event.clientX - dragStartPos.value.x
  const dy = event.clientY - dragStartPos.value.y

  // 复制原始拖拽起始坐标
  const newPoly = [...dragStartPoly.value]

  // 根据拖拽类型计算新的坐标
  if (dragType.value === 'move') {
    // 标准移动逻辑
    newPoly[0] += dx / scale.value
    newPoly[1] += dy / scale.value
    newPoly[2] += dx / scale.value
    newPoly[3] += dy / scale.value
  } else {
    // 允许调整大小
    // 调整边界框大小
    switch (dragType.value) {
      case 'resize-nw':
        newPoly[0] += dx / scale.value
        newPoly[1] += dy / scale.value
        break
      case 'resize-ne':
        newPoly[2] += dx / scale.value
        newPoly[1] += dy / scale.value
        break
      case 'resize-se':
        newPoly[2] += dx / scale.value
        newPoly[3] += dy / scale.value
        break
      case 'resize-sw':
        newPoly[0] += dx / scale.value
        newPoly[3] += dy / scale.value
        break
    }
  }

  // 确保坐标有效（x1 < x2, y1 < y2）
  if (newPoly[0] > newPoly[2]) {
    [newPoly[0], newPoly[2]] = [newPoly[2], newPoly[0]]
  }
  if (newPoly[1] > newPoly[3]) {
    [newPoly[1], newPoly[3]] = [newPoly[3], newPoly[1]]
  }

  // 确保坐标不小于0
  newPoly[0] = Math.max(0, newPoly[0])
  newPoly[1] = Math.max(0, newPoly[1])
  newPoly[2] = Math.max(0, newPoly[2])
  newPoly[3] = Math.max(0, newPoly[3])

  // 实时更新显示
  tempEditedPoly.value = newPoly
}

const handleMouseUp = () => {
  if (isDragging.value && draggedElementIndex.value !== null && tempEditedPoly.value) {
    // 保存调整后的坐标到store，并将坐标值四舍五入为整数
    const updatedPoly = tempEditedPoly.value.map(val => Math.round(val)) as [number, number, number, number]
    emit('update-element', draggedElementIndex.value, { poly: updatedPoly })
  }

  // 重置拖拽状态
  isDragging.value = false
  dragType.value = null
  draggedElementIndex.value = null
  tempEditedPoly.value = null

  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)

  // 恢复文本选择
  document.body.style.userSelect = ''
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

// 渲染页面 - 简化版本
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

    // 获取视口 - 让PDF.js自动处理旋转
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
      viewport: viewport,
      intent: 'display',
      annotationMode: 0,
      renderInteractiveForms: false
    }

    renderTaskObj = pageObj.render(renderContext)
    await renderTaskObj.promise
    renderTaskObj = null

    console.log('PDF渲染完成:', {
      width: pageWidth.value,
      height: pageHeight.value,
      scale: scale.value
    })

  } catch (err: unknown) {
    // 处理非取消渲染的异常
    if (!(err instanceof Error && err.name === 'RenderingCancelledException')) {
      console.error('渲染失败:', err)
      error.value = err instanceof Error ? `渲染失败: ${err.message}` : '渲染失败: 未知错误'
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
    // 清除之前的PDF资源
    if (renderTaskObj) {
      renderTaskObj.cancel()
      renderTaskObj = null
    }
    if (pdfDoc) {
      pdfDoc.destroy()
      pdfDoc = null
      pageObj = null
    }



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

// 监听元素顺序变化，确保顺序变化时正确重渲染
watch(() => props.elements, (newElements, oldElements) => {
  // 检测顺序是否发生变化
  if (newElements.length === oldElements.length) {
    const orderChanged = !newElements.every((elem, index) => elem === oldElements[index]);
    if (orderChanged && canvasRef.value) {
      // 强制重渲染以确保正确显示新顺序
      requestAnimationFrame(() => {
        renderPage();
      });
    }
  }
}, { deep: true });

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

  // 清理拖拽事件监听
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
  document.body.style.userSelect = ''
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
    align-items: flex-start; // 设置为flex-start而不是默认值stretch
    // 移除了justify-content: center，允许水平滚动

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
      overflow: visible;

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

    &.bbox-selected {
      cursor: move;
    }

    // 标题类型 - 红色系
    &-title {
      stroke: #f56c6c;
      fill: rgba(245, 108, 108, 0.1);
    }

    // 正文类型 - 蓝色系
    &-text {
      stroke: #409eff;
      fill: rgba(64, 158, 255, 0.1);
    }

    // 脚注类型 - 深蓝色系
    &-footnote,
    &-page-footnote {
      stroke: #66b1ff;
      fill: rgba(102, 177, 255, 0.1);
    }

    // 图表相关类型
    &-chart {
      stroke: #909399;
      fill: rgba(144, 147, 153, 0.1);
    }

    &-chart-caption {
      stroke: #722ed1;
      fill: rgba(114, 46, 209, 0.1);
    }

    &-chart-footnote {
      stroke: #9254de;
      fill: rgba(146, 84, 222, 0.1);
    }

    // 表格相关类型
    &-table {
      stroke: #67c23a;
      fill: rgba(103, 194, 58, 0.1);
    }

    &-table-caption {
      stroke: #e6a23c;
      fill: rgba(230, 162, 60, 0.1);
    }

    &-table-footnote {
      stroke: #fadb14;
      fill: rgba(250, 219, 20, 0.1);
    }

    // 图片/图形相关类型
    &-figure {
      stroke: #13c2c2;
      fill: rgba(19, 194, 194, 0.1);
    }

    &-figure-caption {
      stroke: #52c41a;
      fill: rgba(82, 196, 26, 0.1);
    }

    &-figure-footnote {
      stroke: #fa8c16;
      fill: rgba(250, 140, 22, 0.1);
    }

    // 选中状态增强
    &-selected {
      stroke-width: 3;
      opacity: 1 !important;
      fill-opacity: 0.2 !important;
      filter: drop-shadow(0 0 4px rgba(64, 158, 255, 0.5));
    }

    // 悬停效果
    &:hover:not(&-selected) {
      stroke-width: 3;
      opacity: 0.9;
      filter: drop-shadow(0 0 2px rgba(64, 158, 255, 0.3));
      transition: all 0.2s ease;
    }
  }

  .resize-handle {
    fill: #409eff;
    stroke: white;
    stroke-width: 1;
    cursor: nwse-resize;
    filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.3));
    transition: all 0.2s ease;

    &:hover {
      r: 6;
      filter: drop-shadow(0 0 3px rgba(0, 0, 0, 0.4));
    }

    &.ne {
      cursor: nesw-resize;
    }

    &.se {
      cursor: nwse-resize;
    }

    &.sw {
      cursor: nesw-resize;
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

.pdf-name-tag {
  max-width: 700px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}


</style>
