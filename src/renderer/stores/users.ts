import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { HeadscaleUser } from '@shared/types/headscale'
import * as userApi from '@/api/users'

export const useUsersStore = defineStore('users', () => {
  const users = ref<HeadscaleUser[]>([])
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref<string | null>(null)

  async function fetchUsers(): Promise<boolean> {
    loading.value = true
    error.value = null

    try {
      const result = await userApi.listUsers()
      users.value = result.users
      loaded.value = true
      return true
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '加载用户失败'
      return false
    } finally {
      loading.value = false
    }
  }

  return { users, loading, loaded, error, fetchUsers }
})
