import { useOCRValidationStore } from './src/stores/ocrValidation'
import { OCRSample, LayoutElement } from './src/types/index'

/**
 * 测试 OCR 校验页面的修改状态检测逻辑
 */
async function runTest() {
  console.log('开始测试 OCR 校验页面修改状态检测逻辑...')

  // 创建测试样本数据
  const testSamples: OCRSample[] = [
    {
      pdf_name: 'test1.pdf',
      layout_dets: [
        {
          order: 0,
          category_type: 'text',
          text: '测试文本 1',
          poly: [0, 0, 100, 0, 100, 20, 0, 20] as [number, number, number, number, number, number, number, number]
        },
        {
          order: 1,
          category_type: 'text',
          text: '测试文本 2',
          poly: [0, 30, 100, 30, 100, 50, 0, 50] as [number, number, number, number, number, number, number, number]
        }
      ],
      page_info: {
        language: 'zh'
      }
    },
    {
      pdf_name: 'test2.pdf',
      layout_dets: [
        {
          order: 0,
          category_type: 'title',
          text: '标题文本',
          poly: [50, 50, 200, 50, 200, 80, 50, 80] as [number, number, number, number, number, number, number, number]
        }
      ],
      page_info: {
        language: 'zh'
      }
    }
  ]

  // 初始化 store
  const store = useOCRValidationStore()
  store.clearHistory()

  console.log('1. 测试设置样本数据并验证初始状态...')
  store.setSamples(testSamples)
  console.log('   - 当前样本索引:', store.currentIndex)
  console.log('   - 样本总数:', store.totalSamples)
  console.log('   - 是否有修改:', Array.from(store.modifiedSamples))

  console.log('\n2. 测试修改元素并验证状态更新...')
  const isUpdated = store.updateElement(0, { text: '修改后的文本 1' })
  console.log('   - 更新结果:', isUpdated)
  console.log('   - 当前样本内容:', store.currentSample?.layout_dets[0].text)
  console.log('   - 修改状态:', Array.from(store.modifiedSamples))
  console.log('   - 可撤销:', store.canUndo)

  console.log('\n3. 测试撤销操作并验证状态更新...')
  const isUndone = store.undo()
  console.log('   - 撤销结果:', isUndone)
  console.log('   - 当前样本内容:', store.currentSample?.layout_dets[0].text)
  console.log('   - 修改状态:', Array.from(store.modifiedSamples))
  console.log('   - 可撤销:', store.canUndo)
  console.log('   - 可重做:', store.canRedo)

  console.log('\n4. 测试重做操作并验证状态更新...')
  const isRedone = store.redo()
  console.log('   - 重做结果:', isRedone)
  console.log('   - 当前样本内容:', store.currentSample?.layout_dets[0].text)
  console.log('   - 修改状态:', Array.from(store.modifiedSamples))
  console.log('   - 可撤销:', store.canUndo)
  console.log('   - 可重做:', store.canRedo)

  console.log('\n5. 测试添加新元素...')
  const newElement: LayoutElement = {
    order: 2,
    category_type: 'text',
    text: '新添加的文本',
    poly: [0, 70, 100, 70, 100, 90, 0, 90] as [number, number, number, number, number, number, number, number]
  }
  const isAdded = store.addElement(newElement)
  console.log('   - 添加结果:', isAdded)
  console.log('   - 元素数量:', store.currentSample?.layout_dets.length)
  console.log('   - 修改状态:', Array.from(store.modifiedSamples))

  console.log('\n6. 测试重新计算所有样本的修改状态...')
  store.recalculateModifications()
  console.log('   - 修改状态:', Array.from(store.modifiedSamples))

  console.log('\n7. 测试重置当前样本...')
  const isReset = store.resetCurrentSample()
  console.log('   - 重置结果:', isReset)
  console.log('   - 元素数量:', store.currentSample?.layout_dets.length)
  console.log('   - 第一个元素内容:', store.currentSample?.layout_dets[0].text)
  console.log('   - 修改状态:', Array.from(store.modifiedSamples))

  console.log('\n8. 测试页面信息修改...')
  store.updatePageInfo({ language: 'en' })
  console.log('   - 页面语言:', store.currentSample?.page_info.language)
  console.log('   - 修改状态:', Array.from(store.modifiedSamples))
  
  console.log('\n测试完成！')
}

// 运行测试
runTest().catch(err => {
  console.error('测试失败:', err)
})