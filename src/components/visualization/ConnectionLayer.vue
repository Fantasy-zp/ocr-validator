/*
SVG连接层组件
用于可视化样本元素之间的合并关系
*/
<template>
  <svg class="connection-svg" ref="svgRef">
    <defs>
      <marker
        id="arrowhead"
        markerWidth="10"
        markerHeight="7"
        refX="9"
        refY="3.5"
        orient="auto"
      >
        <polygon
          points="0 0, 10 3.5, 0 7"
          fill="#409eff"
          fill-opacity="0.6"
        />
      </marker>
    </defs>

    <path
      v-for="(path, idx) in connectionPaths"
      :key="idx"
      :d="path"
      class="connection-line"
      :class="{ 'highlighted': highlightedIndex === idx }"
      @click="handleLineClick(idx)"
      @mouseenter="highlightedIndex = idx"
      @mouseleave="highlightedIndex = null"
    />
  </svg>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useDatasetStore } from '@/stores/dataset'

const datasetStore = useDatasetStore()
const svgRef = ref<SVGElement | null>(null)
const connectionPaths = ref<string[]>([])
const highlightedIndex = ref<number | null>(null)

const mergingPairs = computed(() =>
  datasetStore.currentSample?.merging_idx_pairs || []
)

// 计算连线路径
const calculatePath = (leftIdx: number, rightIdx: number): string => {
  if (!svgRef.value) return ''

  const leftElem = document.getElementById(`left-${leftIdx}`)
  const rightElem = document.getElementById(`right-${rightIdx}`)

  if (!leftElem || !rightElem) return ''

  const svg = svgRef.value
  const svgRect = svg.getBoundingClientRect()
  const leftRect = leftElem.getBoundingClientRect()
  const rightRect = rightElem.getBoundingClientRect()

  // 计算起点和终点
  const startX = leftRect.right - svgRect.left
  const startY = leftRect.top + leftRect.height / 2 - svgRect.top
  const endX = rightRect.left - svgRect.left
  const endY = rightRect.top + rightRect.height / 2 - svgRect.top

  // 计算控制点（创建平滑曲线）
  const controlX1 = startX + (endX - startX) * 0.3
  const controlX2 = startX + (endX - startX) * 0.7

  // 返回贝塞尔曲线路径
  return `M ${startX} ${startY} C ${controlX1} ${startY}, ${controlX2} ${endY}, ${endX} ${endY}`
}

// 更新所有连线
const updatePaths = async () => {
  await nextTick()

  if (!svgRef.value || !mergingPairs.value.length) {
    connectionPaths.value = []
    return
  }

  connectionPaths.value = mergingPairs.value.map(pair =>
    calculatePath(pair[0], pair[1])
  )
}

// 处理连线点击
const handleLineClick = (index: number) => {
  console.log('点击连线:', index, mergingPairs.value[index])
  // 可以在这里添加删除连线的功能
}

// 监听变化
watch(mergingPairs, updatePaths, { deep: true })
watch(() => datasetStore.currentIndex, updatePaths)

// 监听滚动事件
let scrollHandler: () => void

onMounted(() => {
  updatePaths()

  // 监听面板滚动
  scrollHandler = () => {
    updatePaths()
  }

  const panels = document.querySelectorAll('.content-panel')
  panels.forEach(panel => {
    panel.addEventListener('scroll', scrollHandler)
  })

  // 监听窗口大小变化
  window.addEventListener('resize', updatePaths)
})

onUnmounted(() => {
  const panels = document.querySelectorAll('.content-panel')
  panels.forEach(panel => {
    panel.removeEventListener('scroll', scrollHandler)
  })
  window.removeEventListener('resize', updatePaths)
})
</script>

<style lang="scss" scoped>
.connection-svg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 10;

  .connection-line {
    stroke: #409eff;
    stroke-width: 2;
    fill: none;
    opacity: 0.6;
    transition: all 0.3s ease;
    pointer-events: stroke;
    cursor: pointer;
    marker-end: url(#arrowhead);

    &:hover,
    &.highlighted {
      stroke-width: 3;
      opacity: 1;
      stroke: #66b1ff;
    }
  }
}
</style>
