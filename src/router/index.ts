import { createRouter, createWebHistory } from 'vue-router'
import HomePage from '@/views/HomePage.vue'
import MergeValidation from '@/views/MergeValidation.vue'
import OCRValidation from '@/views/OCRValidation.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'HomePage',
      component: HomePage,
      meta: {
        title: 'OCR数据集校验系统'
      }
    },
    {
      path: '/merge-validation',
      name: 'MergeValidation',
      component: MergeValidation,
      meta: {
        title: '跨页合并校验',
        requiresData: false
      }
    },
    {
      path: '/ocr-validation',
      name: 'OCRValidation',
      component: OCRValidation,
      meta: {
        title: 'OCR内容校验',
        requiresData: false
      }
    },
    // 404页面
    {
      path: '/:pathMatch(.*)*',
      name: 'NotFound',
      redirect: '/'
    }
  ]
})

// 路由守卫 - 设置页面标题
router.beforeEach((to, from, next) => {
  if (to.meta?.title) {
    document.title = `${to.meta.title} - OCR校验系统`
  }
  next()
})

export default router
