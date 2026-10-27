import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { PreAuthKey } from '@shared/types/headscale'
import * as preAuthKeyApi from '@/api/preauthkeys'

export const usePreAuthKeysStore = defineStore('preauthkeys', () => {
  const keys = ref<PreAuthKey[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchKeys(user?: string): Promise<boolean> {
    loading.value = true
    error.value = null

    try {
      const result = await preAuthKeyApi.listPreAuthKeys(user)
      keys.value = result.keys
      return true
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '加载密钥失败'
      return false
    } finally {
      loading.value = false
    }
  }

  return { keys, loading, error, fetchKeys }
})
