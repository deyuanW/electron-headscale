import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { PolicyDocument } from '@shared/types/headscale'
import * as policyApi from '@/api/policy'

export const usePolicyStore = defineStore('policy', () => {
  const policy = ref('')
  const updatedAt = ref<string | null>(null)
  const supported = ref(true)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)

  async function fetchPolicy(): Promise<boolean> {
    loading.value = true
    error.value = null

    try {
      const result: PolicyDocument = await policyApi.getPolicy()
      policy.value = result.policy
      updatedAt.value = result.updatedAt
      supported.value = result.supported
      return true
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '加载 ACL 策略失败'
      return false
    } finally {
      loading.value = false
    }
  }

  async function savePolicy(content: string): Promise<boolean> {
    saving.value = true
    error.value = null

    try {
      const result = await policyApi.setPolicy(content)
      policy.value = content
      updatedAt.value = result.updatedAt
      return true
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '保存 ACL 策略失败'
      return false
    } finally {
      saving.value = false
    }
  }

  return {
    policy,
    updatedAt,
    supported,
    loading,
    saving,
    error,
    fetchPolicy,
    savePolicy
  }
})
