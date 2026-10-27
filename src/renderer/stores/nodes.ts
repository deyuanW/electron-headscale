import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { NodeResource } from '@shared/types/headscale'
import * as nodeApi from '@/api/nodes'

export const useNodesStore = defineStore('nodes', () => {
  const nodes = ref<NodeResource[]>([])
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref<string | null>(null)

  const onlineCount = computed(() => nodes.value.filter((node) => node.online).length)
  const offlineCount = computed(() => nodes.value.length - onlineCount.value)
  const approvedRouteCount = computed(() =>
    nodes.value.reduce((total, node) => total + node.approvedRoutes.length, 0)
  )

  async function fetchNodes(): Promise<boolean> {
    loading.value = true
    error.value = null

    try {
      const result = await nodeApi.listNodes()
      nodes.value = result.nodes
      loaded.value = true
      return true
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '加载节点失败'
      return false
    } finally {
      loading.value = false
    }
  }

  return {
    nodes,
    loading,
    loaded,
    error,
    onlineCount,
    offlineCount,
    approvedRouteCount,
    fetchNodes
  }
})
