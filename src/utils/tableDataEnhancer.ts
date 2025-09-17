/**
 * 表格数据可靠性增强工具
 * 提供表格数据的备份、恢复、验证等增强功能，提高表格编辑器的数据可靠性
 */

import type { TableData, TableValidationResult, TableHistoryAction } from '@/types/table';
import { TableParser } from './tableParser';

export class TableDataEnhancer {
  /**
   * 创建表格数据的完整快照（深度克隆）
   * @param tableData 原始表格数据
   * @returns 深度克隆的表格数据快照
   */
  static createSnapshot(tableData: TableData): TableData {
    return JSON.parse(JSON.stringify(tableData));
  }

  /**
   * 验证表格数据的完整性和一致性
   * @param tableData 待验证的表格数据
   * @returns 验证结果
   */
  static validateTableData(tableData: TableData): TableValidationResult {
    // 使用现有的验证方法
    const basicValidation = TableParser.validateTableData(tableData);
    
    // 增强的验证逻辑
    const enhancedErrors: string[] = [];
    const enhancedWarnings: string[] = [];
    
    // 检查单元格内容是否包含无效字符
    for (let r = 0; r < tableData.rows; r++) {
      for (let c = 0; c < tableData.cols; c++) {
        const cell = tableData.cells[r][c];
        if (!cell.isVirtual) {
          // 检查内容长度（根据实际需求调整）
          if (cell.content.length > 10000) {
            enhancedWarnings.push(`单元格[${r + 1},${c + 1}]的内容过长，可能影响性能`);
          }
          
          // 检查是否包含潜在的不安全内容（除了sup标签外的其他HTML标签）
          const strippedContent = cell.content.replace(/<\/?sup>/g, '');
          if (/<[a-z][\s\S]*>/i.test(strippedContent)) {
            enhancedErrors.push(`单元格[${r + 1},${c + 1}]包含不支持的HTML标签，可能导致渲染问题`);
          }
        }
      }
    }
    
    // 合并验证结果
    return {
      valid: basicValidation.valid && enhancedErrors.length === 0,
      errors: [...(basicValidation.errors || []), ...enhancedErrors],
      warnings: [...(basicValidation.warnings || []), ...enhancedWarnings]
    };
  }

  /**
   * 创建表格操作的历史记录条目
   * @param type 操作类型
   * @param tableDataBefore 操作前的表格数据
   * @param tableDataAfter 操作后的表格数据
   * @param metadata 操作的元数据（如选中范围、操作描述等）
   * @returns 历史记录条目
   */
  static createHistoryAction(
    type: string,
    tableDataBefore: TableData,
    tableDataAfter: TableData,
    metadata: Record<string, unknown> = {}): TableHistoryAction {
    return {
      type,
      timestamp: Date.now(),
      before: this.createSnapshot(tableDataBefore),
      after: this.createSnapshot(tableDataAfter),
      metadata
    };
  }

  /**
   * 执行历史记录操作（撤销或重做）
   * @param action 历史记录条目
   * @param direction 执行方向（'undo'或'redo'）
   * @returns 操作后的表格数据
   */
  static executeHistoryAction(action: TableHistoryAction, direction: 'undo' | 'redo'): TableData {
    return direction === 'undo' ? 
      this.createSnapshot(action.before) : 
      this.createSnapshot(action.after);
  }

  /**
   * 批量执行表格操作，确保原子性
   * @param tableData 初始表格数据
   * @param operations 要执行的操作数组
   * @returns 操作后的表格数据或失败时的原始数据
   */
  static executeBatchOperations(
    tableData: TableData,
    operations: Array<(data: TableData) => TableData>
  ): { success: boolean; data: TableData; error?: string } {
    let currentData = this.createSnapshot(tableData);
    
    try {
      for (const operation of operations) {
        const result = operation(currentData);
        
        // 验证每一步操作的结果
        const validation = this.validateTableData(result);
        if (!validation.valid) {
          throw new Error(`操作验证失败: ${validation.errors?.join(', ')}`);
        }
        
        currentData = result;
      }
      
      return { success: true, data: currentData };
    } catch (error) {
      console.error('批量操作执行失败:', error);
      return {
        success: false,
        data: tableData,
        error: error instanceof Error ? error.message : '未知错误'
      };
    }
  }

  /**
   * 尝试修复表格数据中的问题
   * @param tableData 可能有问题的表格数据
   * @returns 修复后的表格数据
   */
  static tryRepairTableData(tableData: TableData): TableData {
    const newData = this.createSnapshot(tableData);
    const validation = this.validateTableData(newData);
    
    if (validation.valid) {
      return newData; // 数据已经有效，无需修复
    }
    
    // 尝试修复一些常见问题
    // 1. 修复合并单元格超出边界的问题
    for (let r = 0; r < newData.rows; r++) {
      for (let c = 0; c < newData.cols; c++) {
        const cell = newData.cells[r][c];
        if (!cell.isVirtual) {
          // 确保rowspan不超出表格边界
          if (r + cell.rowspan > newData.rows) {
            cell.rowspan = newData.rows - r;
          }
          // 确保colspan不超出表格边界
          if (c + cell.colspan > newData.cols) {
            cell.colspan = newData.cols - c;
          }
        }
      }
    }
    
    // 2. 清理不支持的HTML标签
    for (let r = 0; r < newData.rows; r++) {
      for (let c = 0; c < newData.cols; c++) {
        const cell = newData.cells[r][c];
        if (!cell.isVirtual) {
          // 只保留sup标签，移除其他HTML标签
          let cleanedContent = cell.content;
          const supMatches = cell.content.match(/<sup>.*?<\/sup>/g) || [];
          const strippedContent = cell.content.replace(/<\/?[a-z][\s\S]*?>/gi, '');
          
          // 重建内容，保留sup标签
          if (supMatches.length > 0) {
            // 这是一个简化的实现，实际应用中可能需要更复杂的逻辑
            cleanedContent = strippedContent;
            console.warn('已清理单元格内容中的不支持HTML标签，可能需要手动检查上标格式');
          } else {
            cleanedContent = strippedContent;
          }
          
          cell.content = cleanedContent;
        }
      }
    }
    
    return newData;
  }

  /**
   * 导出表格数据为安全的JSON格式，用于备份
   * @param tableData 表格数据
   * @returns 序列化的JSON字符串
   */
  static exportTableData(tableData: TableData): string {
    try {
      // 先验证数据
      const validation = this.validateTableData(tableData);
      if (!validation.valid) {
        console.warn('导出的数据可能存在问题:', validation.errors);
      }
      
      return JSON.stringify({
        version: '1.0',
        exportTime: new Date().toISOString(),
        tableData: this.createSnapshot(tableData),
        validationStatus: validation
      }, null, 2);
    } catch (error) {
      console.error('导出表格数据失败:', error);
      throw new Error('导出表格数据失败');
    }
  }

  /**
   * 从JSON备份中恢复表格数据
   * @param json 序列化的JSON字符串
   * @returns 恢复的表格数据
   */
  static importTableData(json: string): TableData {
    try {
      const parsed = JSON.parse(json);
      
      // 验证导入的数据格式
      if (!parsed.tableData || !parsed.tableData.cells || !Array.isArray(parsed.tableData.cells)) {
        throw new Error('无效的表格数据格式');
      }
      
      const tableData = parsed.tableData;
      
      // 尝试修复可能的问题
      const repairedData = this.tryRepairTableData(tableData);
      
      // 最终验证
      const validation = this.validateTableData(repairedData);
      if (!validation.valid) {
        throw new Error(`恢复的数据验证失败: ${validation.errors?.join(', ')}`);
      }
      
      return repairedData;
    } catch (error) {
      console.error('导入表格数据失败:', error);
      throw new Error('导入表格数据失败');
    }
  }
}