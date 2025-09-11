# OCR 校验页面修改状态检测逻辑改进

## 问题分析

在分析原始代码后，我们发现OCR校验页面的修改状态检测逻辑存在以下问题：

1. 修改状态（modifiedSamples）在撤销（undo）和重做（redo）操作后没有正确更新
2. 缺少对原始数据的保存，导致无法准确判断样本是否被修改
3. 没有提供重置样本到原始状态的功能
4. 无法重新计算所有样本的修改状态

## 改进实现

我们对代码进行了以下改进：

### 1. 数据结构改进

在 `src/types/index.ts` 中为 `OCRSample` 类型添加了原始数据存储字段：

```typescript
interface OCRSample extends Sample {
  pdf_name: string;
  layout_dets: LayoutElement[];
  page_info: PageInfo;
  // 添加原始数据存储字段
  original_layout_dets?: LayoutElement[];
  original_page_info?: PageInfo;
}
```

### 2. 检测方法实现

在 `src/utils/helpers.ts` 中添加了 `isOCRSampleModified` 方法：

```typescript
/**
 * 检查OCR样本是否被修改
 */
static isOCRSampleModified(sample: OCRSample): boolean {
  // 检查原始数据是否存在
  if (!sample.original_layout_dets || !sample.original_page_info) {
    return false;
  }

  // 检查页面信息是否修改
  const pageInfoChanged = JSON.stringify(sample.page_info) !== JSON.stringify(sample.original_page_info);
  if (pageInfoChanged) return true;

  // 检查布局元素是否修改
  const currentDets = [...sample.layout_dets].sort((a, b) => a.order - b.order);
  const originalDets = [...sample.original_layout_dets].sort((a, b) => a.order - b.order);

  // 检查元素数量是否一致
  if (currentDets.length !== originalDets.length) return true;

  // 检查每个元素的关键属性是否一致
  return !currentDets.every((current, index) => {
    const original = originalDets[index];
    return (
      current.category_type === original.category_type &&
      current.text === original.text &&
      JSON.stringify(current.poly) === JSON.stringify(original.poly)
    );
  });
}
```

同时保留了原始的 `isSampleModified` 方法用于合并校验页面。

### 3. Store 功能增强

在 `src/stores/ocrValidation.ts` 中实现了以下功能：

1. **保存原始数据**
   在 `loadJSONL` 和 `setSamples` 方法中为每个样本保存原始数据：
   ```typescript
   samples.value = newSamples.map(sample => ({
     ...sample,
     original_layout_dets: DataUtils.deepClone(sample.layout_dets),
     original_page_info: DataUtils.deepClone(sample.page_info)
   }))
   ```

2. **更新撤销重做逻辑**
   在 `undo` 和 `redo` 方法中添加修改状态更新：
   ```typescript
   try {
     executeHistoryAction(action, direction);
     // 更新修改状态
     updateModificationStatus(currentIndex.value);
     return true;
   }
   ```

3. **新增重置功能**
   添加 `resetCurrentSample` 方法用于将当前样本重置到原始状态：
   ```typescript
   function resetCurrentSample() {
     if (!currentSample.value || !currentSample.value.original_layout_dets || !currentSample.value.original_page_info) {
       return false;
     }

     // 保存当前状态到历史记录
     addToHistory({
       type: 'reset',
       oldValue: DataUtils.deepClone(currentSample.value.layout_dets),
       newValue: DataUtils.deepClone(currentSample.value.original_layout_dets),
       timestamp: Date.now()
     });

     // 恢复原始数据
     currentSample.value.layout_dets = DataUtils.deepClone(currentSample.value.original_layout_dets);
     currentSample.value.page_info = DataUtils.deepClone(currentSample.value.original_page_info);

     // 更新修改状态
     updateModificationStatus(currentIndex.value);
     return true;
   }
   ```

4. **批量状态计算**
   添加 `recalculateModifications` 方法用于重新计算所有样本的修改状态：
   ```typescript
   function recalculateModifications() {
     modifiedSamples.value.clear();
     samples.value.forEach((sample, index) => {
       if (DataUtils.isOCRSampleModified(sample)) {
         modifiedSamples.value.add(index);
       }
     });
   }
   ```

5. **单样本状态更新**
   添加 `updateModificationStatus` 方法用于更新单个样本的修改状态：
   ```typescript
   function updateModificationStatus(index: number) {
     if (index < 0 || index >= samples.value.length) {
       return;
     }
     
     if (DataUtils.isOCRSampleModified(samples.value[index])) {
       modifiedSamples.value.add(index);
     } else {
       modifiedSamples.value.delete(index);
     }
   }
   ```

## 验证结果

所有代码修改都通过了 TypeScript 类型检查 (`npx tsc --noEmit`)，没有语法错误或类型问题。

## 使用建议

1. 在切换页面或保存数据前调用 `recalculateModifications` 确保修改状态正确
2. 使用 `resetCurrentSample` 可以快速将当前样本恢复到原始状态
3. 撤销和重做操作现在会自动更新修改状态，无需额外处理
4. 在浏览器环境中进行完整测试，确保所有功能正常工作

## 总结

这些改进解决了OCR校验页面修改状态检测的核心问题，使得修改状态能够准确反映实际的编辑操作，包括撤销和重做操作。同时提供了更灵活的状态管理功能，方便用户在编辑过程中随时了解和控制样本的修改状态。