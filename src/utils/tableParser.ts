/*
表格HTML与数据结构转换工具
*/

import type {
  TableCell,
  TableData,
  TableParseOptions,
  TableGenerateOptions,
  TableValidationResult
} from '@/types/table'

export class TableParser {
  /**
   * 解析HTML表格为结构化数据
   */
  static parseHTMLToTableData(html: string, options: TableParseOptions = {}): TableData {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    const table = doc.querySelector('table')

    if (!table) {
      throw new Error('未找到有效的表格元素')
    }

    const rows = Array.from(table.querySelectorAll('tr'))
    if (rows.length === 0) {
      return { rows: 0, cols: 0, cells: [] }
    }

    // 计算实际的行列数
    const { rowCount, colCount } = this.calculateTableDimensions(table)

    // 初始化二维数组
    const cells: TableCell[][] = Array(rowCount).fill(null).map(() =>
      Array(colCount).fill(null).map(() => ({
        content: '',
        rowspan: 1,
        colspan: 1,
        isVirtual: true
      }))
    )

    // 填充单元格数据
    rows.forEach((tr, rowIndex) => {
      const tds = Array.from(tr.querySelectorAll('td, th'))
      let colIndex = 0

      tds.forEach(td => {
        // 找到下一个可用的列位置
        while (colIndex < colCount && cells[rowIndex][colIndex].isVirtual === false) {
          colIndex++
        }

        if (colIndex >= colCount) return

        const rowspan = parseInt(td.getAttribute('rowspan') || '1', 10)
        const colspan = parseInt(td.getAttribute('colspan') || '1', 10)

        // 获取单元格内容
        let content = this.extractCellContent(td, options)

        // 设置主单元格
        cells[rowIndex][colIndex] = {
          content,
          rowspan,
          colspan,
          isVirtual: false
        }

        // 标记被合并的虚拟单元格
        for (let r = 0; r < rowspan; r++) {
          for (let c = 0; c < colspan; c++) {
            if (r === 0 && c === 0) continue

            const virtualRow = rowIndex + r
            const virtualCol = colIndex + c

            if (virtualRow < rowCount && virtualCol < colCount) {
              cells[virtualRow][virtualCol] = {
                content: '',
                rowspan: 1,
                colspan: 1,
                isVirtual: true,
                virtualSourceRow: rowIndex,
                virtualSourceCol: colIndex
              }
            }
          }
        }

        colIndex += colspan
      })
    })

    return { rows: rowCount, cols: colCount, cells }
  }

  /**
   * 计算表格的实际行列数
   */
  private static calculateTableDimensions(table: HTMLTableElement): { rowCount: number, colCount: number } {
    const rows = Array.from(table.querySelectorAll('tr'))
    const rowCount = rows.length
    
    // 没有行则返回空表格
    if (rowCount === 0) {
      return { rowCount: 0, colCount: 0 }
    }

    // 创建占位矩阵来跟踪每个单元格的占用情况
    const occupied: boolean[][] = Array(rowCount).fill(null).map(() => [])
    let colCount = 0

    rows.forEach((tr, rowIndex) => {
      const cells = Array.from(tr.querySelectorAll('td, th'))
      let colIndex = 0

      cells.forEach(cell => {
        // 跳过已被合并单元格占用的位置
        while (colIndex < occupied[rowIndex].length && occupied[rowIndex][colIndex]) {
          colIndex++
        }

        // 解析rowspan和colspan，确保值为有效数字
        const rowspan = Math.max(1, parseInt(cell.getAttribute('rowspan') || '1', 10) || 1)
        const colspan = Math.max(1, parseInt(cell.getAttribute('colspan') || '1', 10) || 1)

        // 标记所有被当前单元格占用的位置
        for (let r = 0; r < rowspan; r++) {
          for (let c = 0; c < colspan; c++) {
            const targetRow = rowIndex + r
            const targetCol = colIndex + c

            // 确保目标行存在且在范围内
            if (targetRow < rowCount) {
              // 扩展行数组以容纳新列
              while (occupied[targetRow].length <= targetCol) {
                occupied[targetRow].push(false)
              }
              occupied[targetRow][targetCol] = true
            }
          }
        }

        // 更新表格的最大列数
        colCount = Math.max(colCount, colIndex + colspan)
        colIndex += colspan
      })
    })

    return { rowCount, colCount }
  }

  /**
   * 提取单元格内容
   */
  private static extractCellContent(td: Element, options: TableParseOptions): string {
    if (options.handleSuperscript !== false) {
      // 保留sup标签
      let html = td.innerHTML
      // 清理不需要的属性，但保留sup标签
      html = html.replace(/\s+style="[^"]*"/gi, '')
      if (!options.preserveClasses) {
        html = html.replace(/\s+class="[^"]*"/gi, '')
      }
      return html.trim()
    }

    // 只获取文本内容
    return td.textContent?.trim() || ''
  }

  /**
   * 将结构化数据生成HTML表格
   */
  static generateHTMLFromTableData(tableData: TableData, options: TableGenerateOptions = {}): string {
    if (!tableData.cells || tableData.cells.length === 0) {
      return '<table></table>'
    }

    const lines: string[] = ['<table>']

    for (let r = 0; r < tableData.rows; r++) {
      const rowCells: string[] = []

      for (let c = 0; c < tableData.cols; c++) {
        const cell = tableData.cells[r][c]

        // 跳过虚拟单元格
        if (cell.isVirtual) continue

        const attrs: string[] = []

        if (cell.rowspan > 1) {
          attrs.push(`rowspan="${cell.rowspan}"`)
        }

        if (cell.colspan > 1) {
          attrs.push(`colspan="${cell.colspan}"`)
        }

        const attrString = attrs.length > 0 ? ' ' + attrs.join(' ') : ''
        // 转义特殊字符，防止HTML注入
        const safeContent = this.escapeHTML(cell.content)
        rowCells.push(`<td${attrString}>${safeContent}</td>`)
      }

      if (rowCells.length > 0) {
        const rowContent = rowCells.join('')
        if (options.compact) {
          lines.push(`<tr>${rowContent}</tr>`)
        } else {
          lines.push(`  <tr>${rowContent}</tr>`)
        }
      }
    }

    if (options.compact) {
      lines.push('</table>')
    } else {
      lines.push('</table>')
    }

    return options.compact ? lines.join('') : lines.join('\n')
  }

  /**
   * 转义HTML特殊字符
   */
  private static escapeHTML(content: string): string {
    const escapedContent = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      // 恢复上标标签
      .replace(/&lt;sup&gt;/g, '<sup>')
      .replace(/&lt;\/sup&gt;/g, '</sup>')
      
    return escapedContent
  }

  /**
   * 验证表格数据的有效性
   */
  static validateTableData(tableData: TableData): TableValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    if (!tableData.cells || tableData.cells.length === 0) {
      errors.push('表格数据为空')
      return { valid: false, errors }
    }

    // 检查行列数是否匹配
    if (tableData.cells.length !== tableData.rows) {
      errors.push(`行数不匹配：期望${tableData.rows}行，实际${tableData.cells.length}行`)
    }

    // 检查每行的列数
    tableData.cells.forEach((row, rowIndex) => {
      if (row.length !== tableData.cols) {
        errors.push(`第${rowIndex + 1}行列数不匹配：期望${tableData.cols}列，实际${row.length}列`)
      }
    })

    // 检查合并单元格的有效性
    for (let r = 0; r < tableData.rows; r++) {
      for (let c = 0; c < tableData.cols; c++) {
        const cell = tableData.cells[r][c]

        if (!cell.isVirtual) {
          // 检查合并范围是否超出表格边界
          if (r + cell.rowspan > tableData.rows) {
            errors.push(`单元格[${r},${c}]的rowspan超出表格边界`)
          }
          if (c + cell.colspan > tableData.cols) {
            errors.push(`单元格[${r},${c}]的colspan超出表格边界`)
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined
    }
  }

  /**
   * 合并选中的单元格
   */
  static mergeCells(tableData: TableData, startRow: number, startCol: number, endRow: number, endCol: number): TableData {
    const newData = this.cloneTableData(tableData)

    // 计算合并范围
    const minRow = Math.min(startRow, endRow)
    const maxRow = Math.max(startRow, endRow)
    const minCol = Math.min(startCol, endCol)
    const maxCol = Math.max(startCol, endCol)

    // 收集所有内容
    const contents: string[] = []
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const cell = newData.cells[r][c]
        if (!cell.isVirtual && cell.content) {
          contents.push(cell.content)
        }
      }
    }

    // 设置主单元格
    newData.cells[minRow][minCol] = {
      content: contents.join(' '),
      rowspan: maxRow - minRow + 1,
      colspan: maxCol - minCol + 1,
      isVirtual: false
    }

    // 设置虚拟单元格
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        if (r === minRow && c === minCol) continue

        newData.cells[r][c] = {
          content: '',
          rowspan: 1,
          colspan: 1,
          isVirtual: true,
          virtualSourceRow: minRow,
          virtualSourceCol: minCol
        }
      }
    }

    return newData
  }

  /**
   * 拆分合并的单元格
   */
  static splitCell(tableData: TableData, row: number, col: number): TableData {
    const newData = this.cloneTableData(tableData)
    const cell = newData.cells[row][col]

    if (cell.isVirtual) {
      return tableData // 虚拟单元格不能拆分
    }

    const content = cell.content

    // 将合并范围内的所有单元格恢复为独立单元格
    for (let r = row; r < row + cell.rowspan; r++) {
      for (let c = col; c < col + cell.colspan; c++) {
        newData.cells[r][c] = {
          content: r === row && c === col ? content : '',
          rowspan: 1,
          colspan: 1,
          isVirtual: false
        }
      }
    }

    return newData
  }

  /**
   * 插入行
   */
  static insertRow(tableData: TableData, position: number, before = true): TableData {
    const newData = this.cloneTableData(tableData)
    const insertIndex = before ? position : position + 1

    // 创建新行
    const newRow: TableCell[] = Array(tableData.cols).fill(null).map(() => ({
      content: '',
      rowspan: 1,
      colspan: 1,
      isVirtual: false
    }))

    // 插入新行
    newData.cells.splice(insertIndex, 0, newRow)
    newData.rows += 1

    // 更新虚拟单元格的引用
    for (let r = 0; r < newData.rows; r++) {
      for (let c = 0; c < newData.cols; c++) {
        const cell = newData.cells[r][c]
        if (cell.isVirtual && cell.virtualSourceRow !== undefined && cell.virtualSourceRow >= insertIndex) {
          cell.virtualSourceRow += 1
        }
      }
    }

    return newData
  }

  /**
   * 删除行
   */
  static deleteRow(tableData: TableData, rowIndex: number): TableData {
    if (tableData.rows <= 1) {
      return tableData // 不能删除最后一行
    }

    const newData = this.cloneTableData(tableData)

    // 删除行
    newData.cells.splice(rowIndex, 1)
    newData.rows -= 1

    // 更新虚拟单元格的引用
    for (let r = 0; r < newData.rows; r++) {
      for (let c = 0; c < newData.cols; c++) {
        const cell = newData.cells[r][c]
        if (cell.isVirtual && cell.virtualSourceRow !== undefined && cell.virtualSourceRow > rowIndex) {
          cell.virtualSourceRow -= 1
        }
      }
    }

    return newData
  }

  /**
   * 插入列
   */
  static insertColumn(tableData: TableData, position: number, before = true): TableData {
    const newData = this.cloneTableData(tableData)
    const insertIndex = before ? position : position + 1

    // 在每一行插入新单元格
    for (let r = 0; r < newData.rows; r++) {
      const newCell: TableCell = {
        content: '',
        rowspan: 1,
        colspan: 1,
        isVirtual: false
      }
      newData.cells[r].splice(insertIndex, 0, newCell)
    }

    newData.cols += 1

    // 更新虚拟单元格的引用
    for (let r = 0; r < newData.rows; r++) {
      for (let c = 0; c < newData.cols; c++) {
        const cell = newData.cells[r][c]
        if (cell.isVirtual && cell.virtualSourceCol !== undefined && cell.virtualSourceCol >= insertIndex) {
          cell.virtualSourceCol += 1
        }
      }
    }

    return newData
  }

  /**
   * 删除列
   */
  static deleteColumn(tableData: TableData, colIndex: number): TableData {
    if (tableData.cols <= 1) {
      return tableData // 不能删除最后一列
    }

    const newData = this.cloneTableData(tableData)

    // 从每一行删除单元格
    for (let r = 0; r < newData.rows; r++) {
      newData.cells[r].splice(colIndex, 1)
    }

    newData.cols -= 1

    // 更新虚拟单元格的引用
    for (let r = 0; r < newData.rows; r++) {
      for (let c = 0; c < newData.cols; c++) {
        const cell = newData.cells[r][c]
        if (cell.isVirtual && cell.virtualSourceCol !== undefined && cell.virtualSourceCol > colIndex) {
          cell.virtualSourceCol -= 1
        }
      }
    }

    return newData
  }

  /**
   * 深克隆表格数据
   */
  private static cloneTableData(tableData: TableData): TableData {
    return {
      rows: tableData.rows,
      cols: tableData.cols,
      cells: tableData.cells.map(row =>
        row.map(cell => ({ ...cell }))
      )
    }
  }
}
