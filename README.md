# OCR跨页合并数据集校验系统

一个用于展示和修正OCR任务中跨页合并训练数据集的Vue 3应用。

## 功能特性

### P0 核心功能 ✅
- **JSONL文件加载**: 支持上传和解析JSONL格式的数据集
- **双栏内容展示**: 左右分栏显示两个页面的Markdown内容
- **视图模式切换**: 支持原始文本和渲染效果两种查看模式
- **合并对编辑**: 
  - 交互式创建合并对（点击选择元素）
  - 删除已有合并对
  - 清除所有合并对
- **数据导航**: 上一条/下一条样本切换
- **修改追踪**: 显示哪些样本已被修改
- **数据导出**: 导出修正后的JSONL文件

## 技术栈

- **框架**: Vue 3.4 + TypeScript
- **状态管理**: Pinia
- **UI组件库**: Element Plus
- **Markdown渲染**: markdown-it
- **构建工具**: Vite 5
- **样式**: SCSS

## 项目结构

```
ocr-merge-validator/
├── src/
│   ├── assets/          # 静态资源
│   ├── components/      # Vue组件
│   │   ├── layout/     # 布局组件
│   │   ├── panels/     # 面板组件
│   │   ├── editor/     # 编辑器组件
│   │   └── visualization/ # 可视化组件
│   ├── stores/         # Pinia状态管理
│   ├── types/          # TypeScript类型定义
│   ├── utils/          # 工具函数
│   ├── App.vue         # 根组件
│   └── main.ts         # 应用入口
├── package.json        # 项目配置
├── tsconfig.json       # TypeScript配置
├── vite.config.ts      # Vite配置
└── README.md          # 项目文档
```

## 安装和运行

### 前置要求
- Node.js >= 16
- npm 或 pnpm

### 安装步骤

1. 克隆或创建项目目录
```bash
mkdir ocr-merge-validator
cd ocr-merge-validator
```

2. 将所有文件放入对应目录

3. 安装依赖
```bash
npm install
# 或使用 pnpm
pnpm install
```

4. 启动开发服务器
```bash
npm run dev
```

5. 在浏览器中打开 `http://localhost:3000`

### 构建生产版本
```bash
npm run build
```

构建后的文件将在 `dist` 目录中。

## 使用说明

### 1. 准备数据
创建JSONL格式的数据文件，每行包含一个JSON对象：

```json
{
  "pdf_name_1": "doc1.pdf",
  "pdf_name_2": "doc2.pdf",
  "language": "zh",
  "md_elem_list_1": ["# 标题", "段落内容"],
  "md_elem_list_2": ["继续内容", "## 子标题"],
  "merging_idx_pairs": [[0, 1]]
}
```

### 2. 加载数据
- 点击"上传JSONL文件"按钮
- 选择准备好的数据文件
- 系统会自动解析并显示第一条数据

### 3. 查看和编辑
- **查看内容**: 左右两栏分别显示两个页面的内容
- **切换视图**: 点击"渲染效果/原始文本"切换显示模式
- **创建合并对**:
  1. 点击左侧一个元素（高亮蓝色）
  2. 点击右侧一个元素（高亮蓝色）
  3. 点击"添加选中的合并对"按钮
- **删除合并对**: 点击合并对后的×按钮
- **导航**: 使用箭头按钮在不同样本间切换

### 4. 导出数据
- 点击"导出全部"按钮
- 系统会下载包含所有修正的JSONL文件

## 数据格式说明

### 输入格式 (JSONL)
每行一个JSON对象，包含以下字段：

| 字段 | 类型 | 描述 |
|-----|------|------|
| pdf_name_1 | string | 第一个PDF文件名 |
| pdf_name_2 | string | 第二个PDF文件名 |
| language | string | 语言（zh/en） |
| md_elem_list_1 | string[] | 第一页的Markdown元素列表 |
| md_elem_list_2 | string[] | 第二页的Markdown元素列表 |
| merging_idx_pairs | number[][] | 合并对索引列表 |

### 合并对格式
`merging_idx_pairs` 是一个二维数组，每个子数组包含两个索引：
- 第一个索引：指向 `md_elem_list_1` 中的元素
- 第二个索引：指向 `md_elem_list_2` 中的元素

例如：`[[0, 1], [2, 0]]` 表示：
- 第一页的元素0与第二页的元素1合并
- 第一页的元素2与第二页的元素0合并

## 测试数据示例

创建 `test.jsonl` 文件：

```jsonl
{"pdf_name_1": "report_1.pdf", "pdf_name_2": "report_2.pdf", "language": "zh", "md_elem_list_1": ["# 财务报告", "## 收入分析", "本季度收入增长15%"], "md_elem_list_2": ["继续上页内容", "## 支出分析", "运营成本降低5%"], "merging_idx_pairs": [[2, 0]]}
{"pdf_name_1": "doc_3.pdf", "pdf_name_2": "doc_4.pdf", "language": "en", "md_elem_list_1": ["# Introduction", "This document describes"], "md_elem_list_2": ["the implementation details", "## Architecture"], "merging_idx_pairs": [[1, 0]]}
```

## 常见问题

### Q: 支持哪些Markdown语法？
A: 支持标准Markdown语法，包括标题、段落、列表、表格、代码块等。

### Q: 可以处理多大的数据集？
A: 理论上没有限制，但建议单个文件不超过10MB以保证性能。

### Q: 如何判断元素是否需要合并？
A: 通常以下情况需要合并：
- 表格跨页断裂
- 段落在页面边界被截断
- 列表项跨页

### Q: 修改后的数据会自动保存吗？
A: 目前需要手动点击"导出全部"保存。后续版本将添加自动保存功能。

## 后续计划

### P1 增强功能（计划中）
- [ ] 键盘快捷键支持
- [ ] 改进的连线效果（使用leader-line）
- [ ] 自动保存到localStorage
- [ ] 撤销/重做功能
- [ ] 数据验证和冲突检测

### P2 高级功能（未来）
- [ ] 自动检测建议合并对
- [ ] 批量操作
- [ ] 统计分析面板
- [ ] PDF预览集成

## 开发指南

### 添加新组件
1. 在 `src/components` 相应目录创建组件
2. 遵循组合式API (Composition API) 风格
3. 使用TypeScript定义props和emits

### 状态管理
- 全局状态使用Pinia store
- 局部状态使用组件内的ref/reactive
- 避免直接修改store中的状态，使用action

### 样式规范
- 使用SCSS编写样式
- 组件样式使用scoped
- 全局样式放在 `src/assets/styles/`

## License

MIT

## 联系方式

如有问题或建议，请提交Issue。