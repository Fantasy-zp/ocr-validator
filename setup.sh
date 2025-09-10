#!/bin/bash

# OCR数据集校验系统 - 快速启动脚本

echo "================================"
echo "OCR数据集校验系统 - 安装向导"
echo "================================"
echo ""

# 检查Node.js版本
check_node() {
    if ! command -v node &> /dev/null; then
        echo "❌ 未检测到Node.js，请先安装Node.js (>=16)"
        echo "   访问 https://nodejs.org/ 下载安装"
        exit 1
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 16 ]; then
        echo "❌ Node.js版本过低，需要 >= 16"
        echo "   当前版本: $(node -v)"
        exit 1
    fi
    
    echo "✅ Node.js版本检查通过: $(node -v)"
}

# 选择包管理器
select_package_manager() {
    echo ""
    echo "选择包管理器："
    echo "1) npm (默认)"
    echo "2) pnpm (推荐，更快)"
    echo "3) yarn"
    read -p "请选择 [1-3]: " choice
    
    case $choice in
        2)
            if ! command -v pnpm &> /dev/null; then
                echo "正在安装pnpm..."
                npm install -g pnpm
            fi
            PM="pnpm"
            ;;
        3)
            if ! command -v yarn &> /dev/null; then
                echo "正在安装yarn..."
                npm install -g yarn
            fi
            PM="yarn"
            ;;
        *)
            PM="npm"
            ;;
    esac
    
    echo "✅ 使用 $PM 作为包管理器"
}

# 安装依赖
install_dependencies() {
    echo ""
    echo "正在安装依赖包..."
    $PM install
    
    if [ $? -eq 0 ]; then
        echo "✅ 依赖安装成功"
    else
        echo "❌ 依赖安装失败，请检查网络连接"
        exit 1
    fi
}

# 创建环境配置
create_env() {
    if [ ! -f .env ]; then
        echo ""
        echo "创建环境配置文件..."
        cp .env.example .env
        echo "✅ 已创建 .env 文件"
    fi
}

# 启动开发服务器
start_dev() {
    echo ""
    echo "================================"
    echo "安装完成！"
    echo "================================"
    echo ""
    echo "启动开发服务器..."
    echo "访问地址: http://localhost:3000"
    echo ""
    echo "按 Ctrl+C 停止服务器"
    echo "================================"
    echo ""
    
    if [ "$PM" = "npm" ]; then
        npm run dev
    else
        $PM dev
    fi
}

# 主流程
main() {
    check_node
    select_package_manager
    install_dependencies
    create_env
    
    echo ""
    echo "是否立即启动开发服务器？"
    read -p "输入 y 启动，n 退出 [y/n]: " start_now
    
    if [ "$start_now" = "y" ] || [ "$start_now" = "Y" ]; then
        start_dev
    else
        echo ""
        echo "安装完成！使用以下命令启动："
        echo "  $PM run dev"
        echo ""
    fi
}

# 运行主流程
main