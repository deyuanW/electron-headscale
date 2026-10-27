import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import MainLayout from '@/layouts/MainLayout.vue'

declare module 'vue-router' {
  interface RouteMeta {
    title: string
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: MainLayout,
    redirect: '/nodes',
    children: [
      {
        path: 'connection',
        name: 'connection',
        component: () => import('@/views/ConnectionView.vue'),
        meta: { title: '连接配置' }
      },
      {
        path: 'nodes',
        name: 'nodes',
        component: () => import('@/views/NodesView.vue'),
        meta: { title: '节点管理' }
      },
      {
        path: 'routes',
        name: 'routes',
        component: () => import('@/views/RoutesView.vue'),
        meta: { title: '路由管理' }
      },
      {
        path: 'users',
        name: 'users',
        component: () => import('@/views/UsersView.vue'),
        meta: { title: '用户管理' }
      },
      {
        path: 'preauthkeys',
        name: 'preauthkeys',
        component: () => import('@/views/PreAuthKeysView.vue'),
        meta: { title: '预认证密钥' }
      }
    ]
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/nodes'
  }
]

const router = createRouter({
  // Electron 生产环境通过 file:// 加载页面，必须使用 hash 路由
  history: createWebHashHistory(),
  routes
})

export default router
