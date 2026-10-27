import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { RouteResource } from '@shared/types/headscale'
import * as routeApi from '@/api/routes'

export const useRoutesStore = defineStore('routes', () => {
  const routes = ref<RouteResource[]>([])
  const loading = ref(false)
  /** 服务端是否提供 GET /api/v1/routes（否则为节点数据推导的只读结果） */
  const supported = ref(true)
  const error = ref<string | null>(null)

  async function fetchRoutes(): Promise<boolean> {
    loading.value = true
    error.value = null

    try {
      const result = await routeApi.listRoutes()
      routes.value = result.routes
      supported.value = result.supported
      return true
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '加载路由失败'
      return false
    } finally {
      loading.value = false
    }
  }

  /** 节点详情页需要 routeId 才能调用启用/禁用接口 */
  function findRoute(nodeId: string, prefix: string): RouteResource | undefined {
    return routes.value.find((route) => route.nodeId === nodeId && route.prefix === prefix)
  }

  return {
    routes,
    loading,
    supported,
    error,
    fetchRoutes,
    findRoute
  }
})
