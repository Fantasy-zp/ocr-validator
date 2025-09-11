/*
Markdown渲染工具
用于将Markdown文本渲染为HTML
*/
import MarkdownIt from 'markdown-it'
import type { Sample } from '@/types/index'

// 创建并配置markdown-it实例
export const md = new MarkdownIt({
  html: true,
  breaks: true,
  typographer: true,
  linkify: true
})

// 渲染Markdown文本
export function renderMarkdown(text: string): string {
  if (!text) return ''
  try {
    return md.render(text)
  } catch (error) {
    console.error('Markdown rendering error:', error)
    return text
  }
}

// 解析JSONL文件
export function parseJSONL(text: string) {
  const lines = text.trim().split('\n').filter(line => line.trim())
  const samples: Sample[] = []
  const errors: {line: number; error: Error}[] = []

  for (let i = 0; i < lines.length; i++) {
    try {
      const sample = JSON.parse(lines[i]) as Sample
      // 确保 merging_idx_pairs 是数组
      if (!Array.isArray(sample.merging_idx_pairs)) {
        sample.merging_idx_pairs = []
      }
      // 保存原始合并对用于对比
      sample.original_pairs = JSON.parse(JSON.stringify(sample.merging_idx_pairs))
      samples.push(sample)
    } catch (e) {
      errors.push({ line: i + 1, error: e as Error })
    }
  }

  return { samples, errors }
}

// 自定义序列化函数，确保合并对的第二个数字前有空格
function stringifyWithSpace(obj: unknown): string {
  if (Array.isArray(obj)) {
    if (obj.length === 2 && typeof obj[0] === 'number' && typeof obj[1] === 'number') {
      // 对于长度为2的数字数组（合并对），添加空格
      return `[${obj[0]}, ${obj[1]}]`
    }
    // 其他数组递归处理
    return `[${obj.map(stringifyWithSpace).join(', ')}]`
  } else if (typeof obj === 'object' && obj !== null) {
    // 对象递归处理
    const keys = Object.keys(obj)
    const keyValuePairs = keys.map(key => `"${key}":${stringifyWithSpace((obj as Record<string, unknown>)[key])}`)
    return `{${keyValuePairs.join(', ')}}`
  } else if (typeof obj === 'string') {
    // 字符串需要转义
    return JSON.stringify(obj)
  } else {
    // 其他类型直接转换
    return String(obj)
  }
}

// 导出数据为JSONL
export function exportToJSONL(samples: Sample[]): string {
  return samples.map(sample => {
    const exportSample = { ...sample }
    delete exportSample.original_pairs
    return stringifyWithSpace(exportSample)
  }).join('\n')
}
