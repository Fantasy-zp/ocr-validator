<template>
  <div class="global-notifications">
    <!-- 网络状态提示 -->
    <transition name="slide-down">
      <div v-if="!isOnline" class="network-status offline">
        <el-icon><Connection /></el-icon>
        网络连接已断开，部分功能可能无法使用
      </div>
    </transition>

    <!-- 浏览器兼容性提示 -->
    <transition name="slide-down">
      <div v-if="showCompatibilityWarning" class="compatibility-warning">
        <el-icon><WarningFilled /></el-icon>
        您的浏览器可能不支持某些功能，建议使用最新版Chrome或Firefox
        <el-button text @click="dismissCompatibilityWarning">
          <el-icon><Close /></el-icon>
        </el-button>
      </div>
    </transition>

    <!-- 数据自动保存提示 -->
    <transition name="fade">
      <div v-if="showAutoSaveIndicator" class="auto-save-indicator">
        <el-icon class="is-loading"><Loading /></el-icon>
        自动保存中...
      </div>
    </transition>

    <!-- 快捷键帮助提示 -->
    <el-drawer
      v-model="showKeyboardHelp"
      title="键盘快捷键"
      size="300px"
      direction="rtl"
    >
      <div class="keyboard-help">
        <div class="help-section">
          <h4>通用快捷键</h4>
          <div class="shortcut-item">
            <kbd>A</kbd>
            <span>上一个样本</span>
          </div>
          <div class="shortcut-item">
            <kbd>D</kbd>
            <span>下一个样本</span>
          </div>
        </div>

        <div class="help-section">
          <h4>OCR校验专用</h4>
          <div class="shortcut-item">
            <kbd>Ctrl</kbd> + <kbd>Z</kbd>
            <span>撤销操作</span>
          </div>
          <div class="shortcut-item">
            <kbd>Ctrl</kbd> + <kbd>Y</kbd>
            <span>重做操作</span>
          </div>
        </div>

        <div class="help-section">
          <h4>视图控制</h4>
          <div class="shortcut-item">
            <kbd>Tab</kbd>
            <span>切换视图模式</span>
          </div>
          <div class="shortcut-item">
            <kbd>Esc</kbd>
            <span>清除选择</span>
          </div>
        </div>
      </div>
    </el-drawer>

    <!-- 快捷键帮助按钮 -->
    <el-affix :offset="80" position="bottom">
      <el-button
        class="help-button"
        circle
        type="info"
        @click="showKeyboardHelp = true"
      >
        <el-icon><QuestionFilled /></el-icon>
      </el-button>
    </el-affix>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import {
  Connection,
  WarningFilled,
  Close,
  Loading,
  QuestionFilled
} from '@element-plus/icons-vue'

// 状态管理
const isOnline = ref(navigator.onLine)
const showCompatibilityWarning = ref(false)
const showAutoSaveIndicator = ref(false)
const showKeyboardHelp = ref(false)

// 检查浏览器兼容性
const checkBrowserCompatibility = () => {
  const isChrome = /Chrome/.test(navigator.userAgent)
  const isFirefox = /Firefox/.test(navigator.userAgent)
  // const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent)
  const isEdge = /Edg/.test(navigator.userAgent)

  // 检查关键API支持
  const hasFileSystemAccess = 'showDirectoryPicker' in window
  const hasModernJS = 'replaceAll' in String.prototype

  if (!hasFileSystemAccess || !hasModernJS || (!isChrome && !isFirefox && !isEdge)) {
    showCompatibilityWarning.value = !localStorage.getItem('compatibility-warning-dismissed')
  }
}

// 网络状态监听
const handleOnline = () => {
  isOnline.value = true
}

const handleOffline = () => {
  isOnline.value = false
}

// 自动保存指示器
const showAutoSave = () => {
  showAutoSaveIndicator.value = true
  setTimeout(() => {
    showAutoSaveIndicator.value = false
  }, 2000)
}

// 隐藏兼容性警告
const dismissCompatibilityWarning = () => {
  showCompatibilityWarning.value = false
  localStorage.setItem('compatibility-warning-dismissed', 'true')
}

// 全局键盘事件处理
const handleGlobalKeydown = (event: KeyboardEvent) => {
  // F1 显示帮助
  if (event.key === 'F1') {
    event.preventDefault()
    showKeyboardHelp.value = true
  }

  // Esc 关闭帮助
  if (event.key === 'Escape' && showKeyboardHelp.value) {
    showKeyboardHelp.value = false
  }
}

// 暴露给外部的方法
defineExpose({
  showAutoSave
})

onMounted(() => {
  // 检查浏览器兼容性
  checkBrowserCompatibility()

  // 监听网络状态
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)

  // 监听全局键盘事件
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('online', handleOnline)
  window.removeEventListener('offline', handleOffline)
  window.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<style lang="scss" scoped>
.global-notifications {
  position: relative;
  z-index: 9999;

  .network-status {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    padding: 8px 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    z-index: 10000;

    &.offline {
      background: #f56c6c;
      color: white;
    }
  }

  .compatibility-warning {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    padding: 8px 16px;
    background: #e6a23c;
    color: white;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    z-index: 10000;

    .el-button {
      margin-left: auto;
      color: white;
    }
  }

  .auto-save-indicator {
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 16px;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    z-index: 9999;
  }

  .help-button {
    margin: 0 20px 20px 0;
  }
}

.keyboard-help {
  .help-section {
    margin-bottom: 24px;

    h4 {
      margin-bottom: 12px;
      color: #303133;
      font-size: 16px;
    }

    .shortcut-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #f0f2f5;

      &:last-child {
        border-bottom: none;
      }

      kbd {
        background: #f5f7fa;
        border: 1px solid #dcdfe6;
        border-radius: 4px;
        padding: 2px 6px;
        font-size: 12px;
        font-family: monospace;
        margin: 0 2px;
      }

      span {
        color: #606266;
      }
    }
  }
}

// 动画效果
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
}

.slide-down-enter-from,
.slide-down-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: all 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
