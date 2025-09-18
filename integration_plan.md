# 精确OCR页面元素坐标编辑功能集成方案

## 背景概述

annotation_with_drag.html提供了一个PDF标注系统，允许用户通过拖拽方式精确调整边界框的坐标(poly)，包括拖拽移动整个边界框、通过手柄调整大小以及直接编辑坐标数值。当前OCR验证器项目中的坐标编辑是通过弹窗手动输入实现的，缺乏直观的拖拽调整功能。

## 现有项目结构分析

1. **核心组件**：
   - `ImprovedPDFViewer.vue`：显示PDF并渲染元素边界框
   - `OCRElementCard.vue`：展示和编辑单个元素信息，包含坐标输入
   - `OCRContentPanel.vue`：管理元素列表和页面信息编辑
   - `ocrValidation.ts`：状态管理，提供updateElement方法更新元素

2. **数据流**：
   - 用户在右侧面板点击元素卡片
   - 系统更新selectedIndex状态
   - ImprovedPDFViewer高亮显示对应的边界框
   - 用户点击编辑按钮修改元素属性，通过ocrStore.updateElement方法保存

## 集成方案设计

### 1. 创建可拖拽的PDF查看器组件

```typescript
// 创建新组件 src/components/ocr/DraggablePDFViewer.vue
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { ZoomIn, ZoomOut, Loading } from '@element-plus/icons-vue';
import { useOCRValidationStore } from '@/stores/ocrValidation';
import type { LayoutElement } from '@/types';
import type { CSSProperties } from 'vue';
import * as pdfjsLib from 'pdfjs-dist';

// 扩展ImprovedPDFViewer，添加拖拽功能
// ...
```

### 2. 设计拖拽调整功能实现

在新组件中实现以下核心功能：

```typescript
// 拖拽状态管理
const isDragging = ref(false);
const dragType = ref<'move' | 'resize-nw' | 'resize-ne' | 'resize-se' | 'resize-sw' | null>(null);
const dragStartPos = ref({ x: 0, y: 0 });
const dragStartPoly = ref<number[]>([]);
const selectedElementIndex = ref<number | null>(null);

// 处理鼠标按下事件（开始拖拽）
const handleMouseDown = (event: MouseEvent, index: number, type: 'move' | string) => {
  event.stopPropagation();
  if (index === null) return;
  
  isDragging.value = true;
  dragType.value = type === 'move' ? 'move' : `resize-${type}`;
  selectedElementIndex.value = index;
  
  dragStartPos.value = { x: event.clientX, y: event.clientY };
  dragStartPoly.value = [...props.elements[index].poly];
  
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
};

// 处理拖拽移动
const handleMouseMove = (event: MouseEvent) => {
  if (!isDragging.value || selectedElementIndex.value === null) return;
  
  const dx = (event.clientX - dragStartPos.value.x) / scale.value;
  const dy = (event.clientY - dragStartPos.value.y) / scale.value;
  const newPoly = [...dragStartPoly.value];
  
  // 根据拖拽类型计算新的坐标
  if (dragType.value === 'move') {
    // 移动整个边界框
    newPoly[0] += dx;
    newPoly[1] += dy;
    newPoly[2] += dx;
    newPoly[3] += dy;
  } else {
    // 调整边界框大小
    // ...
  }
  
  // 实时更新显示，但不保存到store
  tempEditedPoly.value = newPoly;
};

// 处理鼠标释放（结束拖拽）
const handleMouseUp = () => {
  if (isDragging.value && selectedElementIndex.value !== null && tempEditedPoly.value) {
    // 保存调整后的坐标到store
    emit('update-element', selectedElementIndex.value, { poly: tempEditedPoly.value });
  }
  
  // 重置拖拽状态
  isDragging.value = false;
  dragType.value = null;
  selectedElementIndex.value = null;
  tempEditedPoly.value = null;
  
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
};
```

### 3. 修改ImprovedPDFViewer.vue，添加拖拽功能支持

在原组件中集成拖拽功能：

```vue
<template>
  <div class="pdf-viewer">
    <!-- 原有控制栏 -->
    <!-- 原有PDF渲染区域 -->
    
    <!-- 边界框层 -->
    <div v-if="showBoundingBoxes && elements.length > 0">
      <svg class="bbox-overlay" :style="overlayStyle">
        <g v-for="(elem, idx) in elements" :key="idx">
          <!-- 原有边界框 -->
          <rect 
            :x="elem.poly[0] * scale" 
            :y="elem.poly[1] * scale"
            :width="(elem.poly[2] - elem.poly[0]) * scale" 
            :height="(elem.poly[3] - elem.poly[1]) * scale"
            :class="getBBoxClass(elem.category_type, idx)"
            :opacity="selectedIndex === idx ? 1 : 0.3"
            @click="handleElementClick(idx)"
            @mousedown="handleBBoxMouseDown($event, idx)"
          />
          
          <!-- 当元素被选中时，显示调整手柄 -->
          <g v-if="selectedIndex === idx && enableDragging">
            <!-- 四个角落的调整手柄 -->
            <circle 
              :cx="elem.poly[0] * scale" 
              :cy="elem.poly[1] * scale" 
              r="5" 
              class="resize-handle nw" 
              @mousedown="handleResizeMouseDown($event, idx, 'nw')"
            />
            <!-- 其他三个手柄... -->
          </g>
        </g>
        
        <!-- 原有标签 -->
      </svg>
    </div>
  </div>
</template>
```

### 4. 更新OCRValidation.vue以支持新功能

```vue
<template>
  <div class="ocr-validation">
    <UniversalHeader />
    
    <div class="main-container">
      <div class="pdf-panel">
        <!-- 使用改进后的PDF查看器 -->
        <ImprovedPDFViewer 
          :pdf-name="currentPDFName"
          :elements="currentElements"
          :selected-index="selectedElementIndex"
          :enable-dragging="enableDragging"
          @element-click="handleElementClick"
          @update-element="handleUpdateElement"
        />
        
        <!-- 添加拖拽模式切换按钮 -->
        <div class="mode-controls">
          <el-button 
            :type="enableDragging ? 'primary' : ''" 
            size="small"
            @click="toggleDraggingMode"
          >
            {{ enableDragging ? '退出拖拽模式' : '进入拖拽模式' }}
          </el-button>
        </div>
      </div>
      
      <!-- 原有内容面板 -->
    </div>
  </div>
</template>

<script setup lang="ts">
// 原有代码

// 添加拖拽模式状态
const enableDragging = ref(false);

// 切换拖拽模式
const toggleDraggingMode = () => {
  enableDragging.value = !enableDragging.value;
};

// 处理通过拖拽更新元素
const handleUpdateElement = (index: number, updates: Partial<LayoutElement>) => {
  ocrStore.updateElement(index, updates);
};
</script>
```

### 5. 适配原有数据模型

确保新组件与原有数据模型兼容：

```typescript
// src/types/index.ts
// 确认LayoutElement接口定义
interface LayoutElement {
  category_type: ElementType;
  order: number;
  text?: string;
  html?: string;
  poly: [number, number, number, number]; // [x1, y1, x2, y2]
}
```

## 实施步骤

1. **准备工作**：创建新组件文件和备份现有组件
2. **实现核心功能**：在ImprovedPDFViewer中添加拖拽处理逻辑
3. **UI优化**：添加拖拽手柄和视觉反馈
4. **状态集成**：连接到ocrStore，实现数据更新
5. **模式切换**：添加拖拽模式开关，避免误操作
6. **测试验证**：确保功能正常且不影响原有功能
7. **文档更新**：添加使用说明

## 技术要点

1. **坐标转换**：正确处理缩放比例下的坐标转换
2. **性能优化**：使用requestAnimationFrame优化拖拽体验
3. **数据同步**：拖拽结束后才保存数据，避免频繁更新
4. **用户体验**：添加明确的视觉反馈和操作提示
5. **兼容性**：确保与现有项目的技术栈和架构兼容

## 注意事项

1. 保持原有项目结构和数据流不变
2. 确保拖拽功能不会干扰其他交互
3. 添加适当的错误处理和边界检查
4. 考虑多种浏览器兼容性
5. 实现撤销/重做功能以支持拖拽操作

此方案通过最小化修改现有代码，同时引入精确的拖拽调整功能，提高OCR页面元素坐标编辑的效率和精确度。