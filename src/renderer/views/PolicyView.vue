<template>
  <div class="page">
    <div class="page-heading">
      <div>
        <h2>ACL 策略</h2>
        <p>通过图形化方式管理用户组、标签、主机与访问规则；需要核对原文时再打开策略文件。</p>
      </div>
      <el-tag
        v-if="connection.configured && policyStore.supported"
        class="updated-tag"
        effect="plain"
        round
      >
        {{ policyStore.updatedAt ? `更新于 ${formatDateTime(policyStore.updatedAt)}` : '尚未设置策略' }}
      </el-tag>
    </div>

    <template v-if="connection.configured">
      <template v-if="policyStore.supported">
        <div class="toolbar">
          <div class="toolbar-left">
            <el-button @click="fileVisible = true">
              <el-icon><Document /></el-icon>
              <span>查看文件</span>
            </el-button>
            <el-button :loading="policyStore.loading" @click="reloadPolicy()">
              <el-icon><Refresh /></el-icon>
              <span>重新加载</span>
            </el-button>
            <el-tooltip
              content="图形化界面未覆盖的字段（tests、nodeAttrs 等）会原样保留"
              placement="top"
            >
              <el-icon class="info-icon"><InfoFilled /></el-icon>
            </el-tooltip>
          </div>
          <div class="toolbar-right">
            <span v-if="dirty" class="dirty-badge"><i></i>未保存</span>
            <el-button
              type="primary"
              :loading="policyStore.saving"
              :disabled="!canSave"
              :title="saveHint"
              @click="savePolicy"
            >
              保存策略
            </el-button>
          </div>
        </div>

        <el-alert
          v-if="policyStore.error"
          class="notice-alert"
          type="error"
          :closable="false"
          show-icon
          :title="policyStore.error"
        />

        <template v-if="!parseError">
          <div class="summary-row">
            <div class="surface summary-tile">
              <span class="summary-icon groups"><el-icon><UserFilled /></el-icon></span>
              <div class="summary-text">
                <strong>{{ stats.groups }}</strong>
                <span>用户组</span>
              </div>
            </div>
            <div class="surface summary-tile">
              <span class="summary-icon tags"><el-icon><PriceTag /></el-icon></span>
              <div class="summary-text">
                <strong>{{ stats.tags }}</strong>
                <span>标签</span>
              </div>
            </div>
            <div class="surface summary-tile">
              <span class="summary-icon hosts"><el-icon><Monitor /></el-icon></span>
              <div class="summary-text">
                <strong>{{ stats.hosts }}</strong>
                <span>主机别名</span>
              </div>
            </div>
            <div class="surface summary-tile">
              <span class="summary-icon acls"><el-icon><Connection /></el-icon></span>
              <div class="summary-text">
                <strong>{{ stats.acls }}</strong>
                <span>ACL 规则</span>
              </div>
            </div>
            <div class="surface summary-tile">
              <span class="summary-icon ssh"><el-icon><Key /></el-icon></span>
              <div class="summary-text">
                <strong>{{ stats.ssh }}</strong>
                <span>SSH 规则</span>
              </div>
            </div>
          </div>

          <section class="surface policy-card acl-card">
            <header class="card-head">
              <div class="card-title">
                <span class="card-icon acl"><el-icon><Connection /></el-icon></span>
                <div>
                  <h3>访问规则 ACL</h3>
                  <p>定义谁可以访问哪些主机的哪些端口，规则按从上到下的顺序匹配。</p>
                </div>
              </div>
              <div class="card-actions">
                <span class="count-badge">{{ model.acls.length }}</span>
                <el-button size="small" type="primary" plain @click="openAclAdd">
                  <el-icon><Plus /></el-icon>
                  <span>添加规则</span>
                </el-button>
              </div>
            </header>

            <div v-if="!model.acls.length" class="card-empty">
              尚未配置访问规则，点击「添加规则」开始
            </div>
            <div v-else class="item-list">
              <div v-for="(rule, index) in model.acls" :key="index" class="item-row acl-row">
                <div class="item-main">
                  <div class="acl-title">
                    <span class="acl-index">#{{ index + 1 }}</span>
                    <span class="action-chip">{{ rule.action }}</span>
                  </div>
                  <div class="acl-line">
                    <span class="acl-key">src</span>
                    <span v-for="item in rule.src" :key="`src-${item}`" class="chip">{{ item }}</span>
                    <span v-if="!rule.src.length" class="muted">—</span>
                  </div>
                  <div class="acl-line">
                    <span class="acl-key">dst</span>
                    <span v-for="item in rule.dst" :key="`dst-${item}`" class="chip">{{ item }}</span>
                    <span v-if="!rule.dst.length" class="muted">—</span>
                  </div>
                </div>
                <div class="row-actions">
                  <el-button
                    link
                    :disabled="index === 0"
                    title="上移"
                    @click="moveAcl(index, -1)"
                  >
                    <el-icon><ArrowUp /></el-icon>
                  </el-button>
                  <el-button
                    link
                    :disabled="index === model.acls.length - 1"
                    title="下移"
                    @click="moveAcl(index, 1)"
                  >
                    <el-icon><ArrowDown /></el-icon>
                  </el-button>
                  <el-button link type="primary" @click="openAclEdit(index)">编辑</el-button>
                  <el-button link type="danger" @click="removeAcl(index)">删除</el-button>
                </div>
              </div>
            </div>
          </section>

          <div class="section-grid">
            <section class="surface policy-card">
              <header class="card-head">
                <div class="card-title">
                  <span class="card-icon groups"><el-icon><UserFilled /></el-icon></span>
                  <div>
                    <h3>用户组</h3>
                    <p>把多个用户归为一组，规则中可直接引用 group 名称。</p>
                  </div>
                </div>
                <div class="card-actions">
                  <span class="count-badge">{{ model.groups.length }}</span>
                  <el-button size="small" type="primary" plain @click="openGroupAdd">
                    <el-icon><Plus /></el-icon>
                    <span>添加</span>
                  </el-button>
                </div>
              </header>

              <div v-if="!model.groups.length" class="card-empty">尚未配置用户组</div>
              <div v-else class="item-list">
                <div v-for="(group, index) in model.groups" :key="group.name" class="item-row">
                  <div class="item-main">
                    <span class="item-name mono">{{ group.name }}</span>
                    <div class="chips">
                      <span v-for="member in group.members" :key="member" class="chip">{{ member }}</span>
                      <span v-if="!group.members.length" class="muted">无成员</span>
                    </div>
                  </div>
                  <div class="row-actions">
                    <el-button link type="primary" @click="openGroupEdit(index)">编辑</el-button>
                    <el-button link type="danger" @click="removeGroup(index)">删除</el-button>
                  </div>
                </div>
              </div>
            </section>

            <section class="surface policy-card">
              <header class="card-head">
                <div class="card-title">
                  <span class="card-icon tags"><el-icon><PriceTag /></el-icon></span>
                  <div>
                    <h3>标签所有者</h3>
                    <p>定义谁可以给节点打上指定 tag，用于基于标签的访问控制。</p>
                  </div>
                </div>
                <div class="card-actions">
                  <span class="count-badge">{{ model.tagOwners.length }}</span>
                  <el-button size="small" type="primary" plain @click="openTagAdd">
                    <el-icon><Plus /></el-icon>
                    <span>添加</span>
                  </el-button>
                </div>
              </header>

              <div v-if="!model.tagOwners.length" class="card-empty">尚未配置标签</div>
              <div v-else class="item-list">
                <div v-for="(item, index) in model.tagOwners" :key="item.tag" class="item-row">
                  <div class="item-main">
                    <span class="item-name mono">{{ item.tag }}</span>
                    <div class="chips">
                      <span v-for="owner in item.owners" :key="owner" class="chip">{{ owner }}</span>
                      <span v-if="!item.owners.length" class="muted">无所有者</span>
                    </div>
                  </div>
                  <div class="row-actions">
                    <el-button link type="primary" @click="openTagEdit(index)">编辑</el-button>
                    <el-button link type="danger" @click="removeTag(index)">删除</el-button>
                  </div>
                </div>
              </div>
            </section>

            <section class="surface policy-card">
              <header class="card-head">
                <div class="card-title">
                  <span class="card-icon hosts"><el-icon><Monitor /></el-icon></span>
                  <div>
                    <h3>主机别名</h3>
                    <p>给固定 IP 起一个易读的名字，规则中可直接使用该别名。</p>
                  </div>
                </div>
                <div class="card-actions">
                  <span class="count-badge">{{ model.hosts.length }}</span>
                  <el-button size="small" type="primary" plain @click="openHostAdd">
                    <el-icon><Plus /></el-icon>
                    <span>添加</span>
                  </el-button>
                </div>
              </header>

              <div v-if="!model.hosts.length" class="card-empty">尚未配置主机别名</div>
              <div v-else class="item-list">
                <div v-for="(host, index) in model.hosts" :key="host.name" class="item-row">
                  <div class="item-main">
                    <span class="item-name mono">{{ host.name }}</span>
                    <div class="chips">
                      <span class="chip">{{ host.address }}</span>
                    </div>
                  </div>
                  <div class="row-actions">
                    <el-button link type="primary" @click="openHostEdit(index)">编辑</el-button>
                    <el-button link type="danger" @click="removeHost(index)">删除</el-button>
                  </div>
                </div>
              </div>
            </section>

            <section class="surface policy-card">
              <header class="card-head">
                <div class="card-title">
                  <span class="card-icon auto"><el-icon><MagicStick /></el-icon></span>
                  <div>
                    <h3>自动批准路由</h3>
                    <p>属于指定标签或用户组的节点，其通告的子网路由将自动批准。</p>
                  </div>
                </div>
                <div class="card-actions">
                  <span class="count-badge">{{ model.autoApproverRoutes.length }}</span>
                  <el-button size="small" type="primary" plain @click="openAutoAdd">
                    <el-icon><Plus /></el-icon>
                    <span>添加</span>
                  </el-button>
                </div>
              </header>

              <div v-if="!model.autoApproverRoutes.length" class="card-empty">尚未配置自动批准规则</div>
              <div v-else class="item-list">
                <div
                  v-for="(item, index) in model.autoApproverRoutes"
                  :key="item.route"
                  class="item-row"
                >
                  <div class="item-main">
                    <span class="item-name mono">{{ item.route }}</span>
                    <div class="chips">
                      <span v-for="approver in item.approvers" :key="approver" class="chip">
                        {{ approver }}
                      </span>
                    </div>
                  </div>
                  <div class="row-actions">
                    <el-button link type="primary" @click="openAutoEdit(index)">编辑</el-button>
                    <el-button link type="danger" @click="removeAuto(index)">删除</el-button>
                  </div>
                </div>
              </div>
            </section>

            <section class="surface policy-card">
              <header class="card-head">
                <div class="card-title">
                  <span class="card-icon ssh"><el-icon><Key /></el-icon></span>
                  <div>
                    <h3>SSH 规则</h3>
                    <p>控制哪些用户可以通过 Tailscale SSH 登录到哪些节点。</p>
                  </div>
                </div>
                <div class="card-actions">
                  <span class="count-badge">{{ model.ssh.length }}</span>
                  <el-button size="small" type="primary" plain @click="openSshAdd">
                    <el-icon><Plus /></el-icon>
                    <span>添加</span>
                  </el-button>
                </div>
              </header>

              <div v-if="!model.ssh.length" class="card-empty">尚未配置 SSH 规则</div>
              <div v-else class="item-list">
                <div v-for="(rule, index) in model.ssh" :key="index" class="item-row">
                  <div class="item-main">
                    <div class="acl-title">
                      <span class="action-chip">{{ rule.action }}</span>
                    </div>
                    <div class="acl-line">
                      <span class="acl-key">src</span>
                      <span v-for="item in rule.src" :key="`ssh-src-${item}`" class="chip">
                        {{ item }}
                      </span>
                    </div>
                    <div class="acl-line">
                      <span class="acl-key">dst</span>
                      <span v-for="item in rule.dst" :key="`ssh-dst-${item}`" class="chip">
                        {{ item }}
                      </span>
                    </div>
                    <div class="acl-line">
                      <span class="acl-key">user</span>
                      <span v-for="user in rule.users" :key="`ssh-user-${user}`" class="chip">
                        {{ user }}
                      </span>
                    </div>
                  </div>
                  <div class="row-actions">
                    <el-button link type="primary" @click="openSshEdit(index)">编辑</el-button>
                    <el-button link type="danger" @click="removeSsh(index)">删除</el-button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </template>

        <section v-else class="surface empty-panel">
          <el-empty description="策略文件无法结构化解析" :image-size="96">
            <p class="empty-hint">{{ parseError }}</p>
            <el-button @click="fileVisible = true">查看文件</el-button>
            <el-button type="primary" @click="reloadPolicy()">重新加载</el-button>
          </el-empty>
        </section>
      </template>

      <section v-else class="surface empty-panel">
        <el-empty description="当前服务端未提供 ACL 策略接口" :image-size="96">
          <p class="empty-hint">
            需要 Headscale 提供 <code>/api/v1/policy</code> 接口，请升级服务端后重试。
          </p>
          <el-button @click="reloadPolicy(true)">重新检测</el-button>
        </el-empty>
      </section>
    </template>

    <section v-else class="surface empty-panel">
      <el-empty description="尚未配置 Headscale 连接" :image-size="96">
        <el-button type="primary" @click="router.push({ name: 'connection' })">
          前往连接配置
        </el-button>
      </el-empty>
    </section>

    <!-- 用户组 -->
    <el-dialog
      v-model="groupDialog.visible"
      :title="groupDialog.index >= 0 ? '编辑用户组' : '添加用户组'"
      width="520px"
      :close-on-click-modal="false"
    >
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="组名">
          <el-input v-model="groupDialog.name" placeholder="admin（保存时自动补全 group: 前缀）" />
        </el-form-item>
        <el-form-item label="成员">
          <el-select
            v-model="groupDialog.members"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="选择或输入用户名"
            class="full-width"
          >
            <el-option v-for="user in userOptions" :key="user" :label="user" :value="user" />
          </el-select>
          <div class="hint">成员使用 Headscale 用户名，也允许手动输入。</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="groupDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="submitGroup">保存</el-button>
      </template>
    </el-dialog>

    <!-- 标签所有者 -->
    <el-dialog
      v-model="tagDialog.visible"
      :title="tagDialog.index >= 0 ? '编辑标签' : '添加标签'"
      width="520px"
      :close-on-click-modal="false"
    >
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="标签">
          <el-input v-model="tagDialog.tag" placeholder="server（保存时自动补全 tag: 前缀）" />
        </el-form-item>
        <el-form-item label="所有者">
          <el-select
            v-model="tagDialog.owners"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="选择用户、用户组或其他标签"
            class="full-width"
          >
            <el-option v-for="owner in ownerOptions" :key="owner" :label="owner" :value="owner" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="tagDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="submitTag">保存</el-button>
      </template>
    </el-dialog>

    <!-- 主机别名 -->
    <el-dialog
      v-model="hostDialog.visible"
      :title="hostDialog.index >= 0 ? '编辑主机别名' : '添加主机别名'"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="别名">
          <el-input v-model="hostDialog.name" placeholder="例如 nas" />
        </el-form-item>
        <el-form-item label="地址">
          <el-select
            v-model="hostDialog.address"
            filterable
            allow-create
            default-first-option
            clearable
            placeholder="输入 IP，或选择现有节点的 Tailscale IP"
            class="full-width"
            @change="handleHostAddressChange"
          >
            <el-option
              v-for="option in nodeAddressOptions"
              :key="option.id"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <div class="hint">
            可直接输入地址，也可从现有节点中选择 Tailscale IP；选择后若别名为空会自动填写节点名。
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="hostDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="submitHost">保存</el-button>
      </template>
    </el-dialog>

    <!-- ACL 规则 -->
    <el-dialog
      v-model="aclDialog.visible"
      :title="aclDialog.index >= 0 ? '编辑访问规则' : '添加访问规则'"
      width="580px"
      :close-on-click-modal="false"
    >
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="动作">
          <el-select v-model="aclDialog.action" class="full-width">
            <el-option label="accept" value="accept" />
          </el-select>
        </el-form-item>
        <el-form-item label="源（src）">
          <el-select
            v-model="aclDialog.src"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="用户 / 用户组 / 标签 / *"
            class="full-width"
          >
            <el-option v-for="item in aclSrcOptions" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标（dst）">
          <el-select
            v-model="aclDialog.dst"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="例如 *:*、tag:server:443、nas:22"
            class="full-width"
          />
          <div class="hint">
            目标格式为 <code>主机:端口</code>，可使用 <code>*:*</code> 表示全部端口。
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="aclDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="submitAcl">保存</el-button>
      </template>
    </el-dialog>

    <!-- 自动批准 -->
    <el-dialog
      v-model="autoDialog.visible"
      :title="autoDialog.index >= 0 ? '编辑自动批准' : '添加自动批准'"
      width="520px"
      :close-on-click-modal="false"
    >
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="子网路由">
          <el-input v-model="autoDialog.route" placeholder="例如 192.168.1.0/24" />
        </el-form-item>
        <el-form-item label="批准者">
          <el-select
            v-model="autoDialog.approvers"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="标签 / 用户组 / 用户"
            class="full-width"
          >
            <el-option
              v-for="owner in ownerOptions"
              :key="owner"
              :label="owner"
              :value="owner"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="autoDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="submitAuto">保存</el-button>
      </template>
    </el-dialog>

    <!-- SSH 规则 -->
    <el-dialog
      v-model="sshDialog.visible"
      :title="sshDialog.index >= 0 ? '编辑 SSH 规则' : '添加 SSH 规则'"
      width="580px"
      :close-on-click-modal="false"
    >
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="动作">
          <el-select v-model="sshDialog.action" class="full-width">
            <el-option label="accept" value="accept" />
          </el-select>
        </el-form-item>
        <el-form-item label="源（src）">
          <el-select
            v-model="sshDialog.src"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="用户 / 用户组 / 标签 / *"
            class="full-width"
          >
            <el-option v-for="item in aclSrcOptions" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标（dst）">
          <el-select
            v-model="sshDialog.dst"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="例如 tag:server:22"
            class="full-width"
          />
        </el-form-item>
        <el-form-item label="登录用户">
          <el-select
            v-model="sshDialog.users"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="例如 root、autogroup:nonroot"
            class="full-width"
          >
            <el-option label="root" value="root" />
            <el-option label="autogroup:nonroot" value="autogroup:nonroot" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="sshDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="submitSsh">保存</el-button>
      </template>
    </el-dialog>

    <!-- 策略文件预览 -->
    <el-drawer v-model="fileVisible" title="策略文件" size="620px">
      <div class="file-meta">
        <span class="file-dot"></span>
        policy.hujson
        <span class="file-note">{{ fileNote }}</span>
      </div>
      <pre class="file-preview"><code>{{ fileContent }}</code></pre>
      <template #footer>
        <el-button @click="copyFile">
          <el-icon><CopyDocument /></el-icon>
          <span>复制文件</span>
        </el-button>
        <el-button @click="downloadFile">
          <el-icon><Download /></el-icon>
          <span>下载</span>
        </el-button>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useConnectionStore } from '@/stores/connection'
import { useNodesStore } from '@/stores/nodes'
import { usePolicyStore } from '@/stores/policy'
import { useUsersStore } from '@/stores/users'
import { formatDateTime } from '@/utils/format'
import { showApiError } from '@/utils/message'

interface GroupItem {
  name: string
  members: string[]
}

interface TagOwnerItem {
  tag: string
  owners: string[]
}

interface HostItem {
  name: string
  address: string
}

interface AclRuleItem {
  action: string
  src: string[]
  dst: string[]
  rest: Record<string, unknown>
}

interface AutoApproverItem {
  route: string
  approvers: string[]
}

interface SshRuleItem {
  action: string
  src: string[]
  dst: string[]
  users: string[]
  rest: Record<string, unknown>
}

interface PolicyModel {
  groups: GroupItem[]
  tagOwners: TagOwnerItem[]
  hosts: HostItem[]
  acls: AclRuleItem[]
  autoApproverRoutes: AutoApproverItem[]
  autoApproverExtra: Record<string, unknown>
  ssh: SshRuleItem[]
  extra: Record<string, unknown>
}

interface NodeAddressOption {
  id: string
  value: string
  label: string
  nodeName: string
}

const router = useRouter()
const connection = useConnectionStore()
const nodesStore = useNodesStore()
const policyStore = usePolicyStore()
const usersStore = useUsersStore()

const model = ref<PolicyModel>(createEmptyModel())
const baseSnapshot = ref('')
const parseError = ref<string | null>(null)
const fileVisible = ref(false)

const groupDialog = reactive({
  visible: false,
  index: -1,
  name: '',
  members: [] as string[]
})

const tagDialog = reactive({
  visible: false,
  index: -1,
  tag: '',
  owners: [] as string[]
})

const hostDialog = reactive({
  visible: false,
  index: -1,
  name: '',
  address: ''
})

const aclDialog = reactive({
  visible: false,
  index: -1,
  action: 'accept',
  src: [] as string[],
  dst: [] as string[],
  rest: {} as Record<string, unknown>
})

const autoDialog = reactive({
  visible: false,
  index: -1,
  route: '',
  approvers: [] as string[]
})

const sshDialog = reactive({
  visible: false,
  index: -1,
  action: 'accept',
  src: [] as string[],
  dst: [] as string[],
  users: [] as string[],
  rest: {} as Record<string, unknown>
})

const stats = computed(() => ({
  groups: model.value.groups.length,
  tags: model.value.tagOwners.length,
  hosts: model.value.hosts.length,
  acls: model.value.acls.length,
  ssh: model.value.ssh.length
}))

const userOptions = computed(() => usersStore.users.map((user) => user.name))

const ownerOptions = computed(() => {
  const values = [
    ...userOptions.value,
    ...model.value.groups.map((group) => group.name),
    ...model.value.tagOwners.map((item) => item.tag)
  ]
  return Array.from(new Set(values)).sort()
})

const aclSrcOptions = computed(() => {
  const values = [...ownerOptions.value, '*']
  return Array.from(new Set(values)).sort()
})

/** 现有节点的 Tailscale IP，用于主机别名地址的快速选择 */
const nodeAddressOptions = computed<NodeAddressOption[]>(() =>
  nodesStore.nodes.flatMap((node) =>
    node.ipAddresses.map((ip) => ({
      id: `${node.id}-${ip}`,
      value: ip,
      label: `${node.name} · ${ip}`,
      nodeName: node.name
    }))
  )
)

const currentSnapshot = computed(() => {
  if (parseError.value) return baseSnapshot.value
  return JSON.stringify(serializePolicy(model.value))
})

const dirty = computed(
  () => !parseError.value && currentSnapshot.value !== baseSnapshot.value
)

const canSave = computed(
  () => dirty.value && !parseError.value && !policyStore.saving && !policyStore.loading
)

const saveHint = computed(() => {
  if (parseError.value) return '策略文件无法解析，请先处理文件内容'
  if (!dirty.value) return '当前没有未保存的修改'
  return '保存后立即对整个 Tailnet 生效'
})

const fileContent = computed(() => {
  if (parseError.value) return policyStore.policy || '{}'
  if (!dirty.value && policyStore.policy) return policyStore.policy
  return JSON.stringify(serializePolicy(model.value), null, 2)
})

const fileNote = computed(() => {
  if (parseError.value) return '原始策略文件（无法结构化解析）'
  if (dirty.value) return '当前结构化编辑结果（未保存）'
  return '当前策略文件'
})

function createEmptyModel(): PolicyModel {
  return {
    groups: [],
    tagOwners: [],
    hosts: [],
    acls: [],
    autoApproverRoutes: [],
    autoApproverExtra: {},
    ssh: [],
    extra: {}
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item))
  if (typeof value === 'string') return [value]
  return []
}

function cleanList(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function withPrefix(value: string, prefix: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed.startsWith(prefix) ? trimmed : `${prefix}${trimmed}`
}

function prepareList(values: string[], label: string): string[] | null {
  const cleaned = cleanList(values)
  if (!cleaned.length) {
    ElMessage.warning(`请至少填写一个${label}`)
    return null
  }
  return cleaned
}

function omit(record: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (!keys.includes(key)) result[key] = value
  }
  return result
}

/** 去掉注释，保留字符位置 */
function stripComments(source: string): string {
  let result = ''
  let inString = false
  let escaped = false
  let inLineComment = false
  let inBlockComment = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false
        result += char
      } else {
        result += ' '
      }
      continue
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false
        result += '  '
        index += 1
      } else {
        result += char === '\n' ? '\n' : ' '
      }
      continue
    }

    if (inString) {
      result += char
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }

    if (char === '"') {
      inString = true
      result += char
      continue
    }

    if (char === '/' && next === '/') {
      inLineComment = true
      result += '  '
      index += 1
      continue
    }

    if (char === '/' && next === '*') {
      inBlockComment = true
      result += '  '
      index += 1
      continue
    }

    result += char
  }

  return result
}

/** 去除 HuJSON 的尾随逗号，用空格替换以保持位置 */
function removeTrailingCommas(source: string): string {
  let result = ''
  let inString = false
  let escaped = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]

    if (inString) {
      result += char
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }

    if (char === '"') {
      inString = true
      result += char
      continue
    }

    if (char === ',') {
      let lookahead = index + 1
      while (lookahead < source.length && /\s/.test(source[lookahead])) lookahead += 1
      if (source[lookahead] === '}' || source[lookahead] === ']') {
        result += ' '
        continue
      }
    }

    result += char
  }

  return result
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (value === undefined) return {}
  if (!isRecord(value)) throw new Error(`字段 ${field} 必须是对象`)
  return value
}

function requireArray(value: unknown, field: string): unknown[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error(`字段 ${field} 必须是数组`)
  return value
}

function parsePolicy(raw: string): PolicyModel {
  const normalized = removeTrailingCommas(stripComments(raw))
  if (!normalized.trim()) return createEmptyModel()

  const parsed: unknown = JSON.parse(normalized)
  if (!isRecord(parsed)) throw new Error('策略顶层必须是一个 JSON 对象')

  const extra: Record<string, unknown> = { ...parsed }
  const groups = Object.entries(requireRecord(parsed.groups, 'groups')).map(([name, value]) => ({
    name,
    members: toStringList(value)
  }))
  const tagOwners = Object.entries(requireRecord(parsed.tagOwners, 'tagOwners')).map(
    ([tag, value]) => ({
      tag,
      owners: toStringList(value)
    })
  )
  const hosts = Object.entries(requireRecord(parsed.hosts, 'hosts')).map(([name, value]) => ({
    name,
    address: String(value)
  }))

  const acls = requireArray(parsed.acls, 'acls')
    .filter(isRecord)
    .map((rule) => ({
      action: typeof rule.action === 'string' ? rule.action : 'accept',
      src: toStringList(rule.src),
      dst: toStringList(rule.dst),
      rest: omit(rule, ['action', 'src', 'dst'])
    }))

  const autoRaw = requireRecord(parsed.autoApprovers, 'autoApprovers')
  const autoRoutesRaw = requireRecord(autoRaw.routes, 'autoApprovers.routes')
  const autoApproverRoutes = Object.entries(autoRoutesRaw).map(([route, value]) => ({
    route,
    approvers: toStringList(value)
  }))
  const autoApproverExtra = { ...autoRaw }
  delete autoApproverExtra.routes

  const ssh = requireArray(parsed.ssh, 'ssh')
    .filter(isRecord)
    .map((rule) => ({
      action: typeof rule.action === 'string' ? rule.action : 'accept',
      src: toStringList(rule.src),
      dst: toStringList(rule.dst),
      users: toStringList(rule.users),
      rest: omit(rule, ['action', 'src', 'dst', 'users'])
    }))

  for (const key of ['groups', 'tagOwners', 'hosts', 'acls', 'autoApprovers', 'ssh']) {
    delete extra[key]
  }

  return {
    groups,
    tagOwners,
    hosts,
    acls,
    autoApproverRoutes,
    autoApproverExtra,
    ssh,
    extra
  }
}

function serializePolicy(current: PolicyModel): Record<string, unknown> {
  const result: Record<string, unknown> = { ...current.extra }

  if (current.groups.length) {
    result.groups = Object.fromEntries(
      current.groups.map((group) => [group.name, group.members])
    )
  }

  if (current.tagOwners.length) {
    result.tagOwners = Object.fromEntries(
      current.tagOwners.map((item) => [item.tag, item.owners])
    )
  }

  if (current.hosts.length) {
    result.hosts = Object.fromEntries(
      current.hosts.map((host) => [host.name, host.address])
    )
  }

  if (current.acls.length) {
    result.acls = current.acls.map((rule) => ({
      ...rule.rest,
      action: rule.action,
      src: rule.src,
      dst: rule.dst
    }))
  }

  const auto: Record<string, unknown> = { ...current.autoApproverExtra }
  if (current.autoApproverRoutes.length) {
    auto.routes = Object.fromEntries(
      current.autoApproverRoutes.map((item) => [item.route, item.approvers])
    )
  }
  if (Object.keys(auto).length) {
    result.autoApprovers = auto
  }

  if (current.ssh.length) {
    result.ssh = current.ssh.map((rule) => ({
      ...rule.rest,
      action: rule.action,
      src: rule.src,
      dst: rule.dst,
      users: rule.users
    }))
  }

  return result
}

function applyPolicyText(raw: string): void {
  try {
    const parsed = parsePolicy(raw)
    model.value = parsed
    baseSnapshot.value = JSON.stringify(serializePolicy(parsed))
    parseError.value = null
  } catch (error) {
    model.value = createEmptyModel()
    baseSnapshot.value = ''
    parseError.value = error instanceof Error ? error.message : '策略解析失败'
  }
}

async function reloadPolicy(force = false): Promise<void> {
  if (!connection.configured) return

  if (!force && dirty.value) {
    try {
      await ElMessageBox.confirm(
        '重新加载会丢弃当前未保存的修改，是否继续？',
        '重新加载策略',
        {
          type: 'warning',
          confirmButtonText: '丢弃并加载',
          cancelButtonText: '取消'
        }
      )
    } catch {
      return
    }
  }

  const ok = await policyStore.fetchPolicy()

  if (!ok) {
    showApiError(policyStore.error, '加载 ACL 策略失败')
    return
  }

  if (policyStore.supported) {
    applyPolicyText(policyStore.policy)
  } else {
    model.value = createEmptyModel()
    baseSnapshot.value = ''
    parseError.value = null
  }
}

async function savePolicy(): Promise<void> {
  if (parseError.value || !dirty.value || policyStore.saving) return

  try {
    await ElMessageBox.confirm(
      '保存后 ACL 将立即对整个 Tailnet 生效，可能中断现有访问，请确认规则无误。',
      '保存 ACL 策略',
      {
        type: 'warning',
        confirmButtonText: '保存并生效',
        cancelButtonText: '取消',
        confirmButtonClass: 'el-button--danger'
      }
    )
  } catch {
    return
  }

  const content = JSON.stringify(serializePolicy(model.value), null, 2)
  const ok = await policyStore.savePolicy(content)

  if (ok) {
    baseSnapshot.value = JSON.stringify(serializePolicy(model.value))
    ElMessage.success('ACL 策略已保存并生效')
  } else {
    showApiError(policyStore.error, '保存 ACL 策略失败')
  }
}

async function copyFile(): Promise<void> {
  try {
    await navigator.clipboard.writeText(fileContent.value)
    ElMessage.success('策略文件已复制到剪贴板')
  } catch {
    ElMessage.warning('复制失败，请手动选中复制')
  }
}

function downloadFile(): void {
  const blob = new Blob([fileContent.value], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'policy.hujson'
  link.click()
  URL.revokeObjectURL(url)
}

async function confirmDelete(message: string, title: string): Promise<boolean> {
  try {
    await ElMessageBox.confirm(message, title, {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger'
    })
    return true
  } catch {
    return false
  }
}

/* ---------- 用户组 ---------- */

function openGroupAdd(): void {
  groupDialog.index = -1
  groupDialog.name = ''
  groupDialog.members = []
  groupDialog.visible = true
}

function openGroupEdit(index: number): void {
  const item = model.value.groups[index]
  groupDialog.index = index
  groupDialog.name = item.name
  groupDialog.members = [...item.members]
  groupDialog.visible = true
}

function submitGroup(): void {
  const name = withPrefix(groupDialog.name, 'group:')
  if (!name || name === 'group:') {
    ElMessage.warning('请输入用户组名称')
    return
  }
  if (
    model.value.groups.some(
      (item, index) => item.name === name && index !== groupDialog.index
    )
  ) {
    ElMessage.warning('该用户组已存在')
    return
  }
  const members = prepareList(groupDialog.members, '成员')
  if (!members) return

  const item: GroupItem = { name, members }
  if (groupDialog.index >= 0) {
    model.value.groups.splice(groupDialog.index, 1, item)
  } else {
    model.value.groups.push(item)
  }
  groupDialog.visible = false
  ElMessage.success('用户组已保存')
}

async function removeGroup(index: number): Promise<void> {
  const item = model.value.groups[index]
  if (!item) return
  if (
    !(await confirmDelete(
      `删除用户组「${item.name}」后，引用它的 ACL 规则可能失效，是否继续？`,
      '删除用户组'
    ))
  ) {
    return
  }
  model.value.groups.splice(index, 1)
}

/* ---------- 标签 ---------- */

function openTagAdd(): void {
  tagDialog.index = -1
  tagDialog.tag = ''
  tagDialog.owners = []
  tagDialog.visible = true
}

function openTagEdit(index: number): void {
  const item = model.value.tagOwners[index]
  tagDialog.index = index
  tagDialog.tag = item.tag
  tagDialog.owners = [...item.owners]
  tagDialog.visible = true
}

function submitTag(): void {
  const tag = withPrefix(tagDialog.tag, 'tag:')
  if (!tag || tag === 'tag:') {
    ElMessage.warning('请输入标签名称')
    return
  }
  if (
    model.value.tagOwners.some(
      (item, index) => item.tag === tag && index !== tagDialog.index
    )
  ) {
    ElMessage.warning('该标签已存在')
    return
  }
  const owners = prepareList(tagDialog.owners, '所有者')
  if (!owners) return

  const item: TagOwnerItem = { tag, owners }
  if (tagDialog.index >= 0) {
    model.value.tagOwners.splice(tagDialog.index, 1, item)
  } else {
    model.value.tagOwners.push(item)
  }
  tagDialog.visible = false
  ElMessage.success('标签已保存')
}

async function removeTag(index: number): Promise<void> {
  const item = model.value.tagOwners[index]
  if (!item) return
  if (
    !(await confirmDelete(
      `删除标签「${item.tag}」后，引用它的规则可能失效，是否继续？`,
      '删除标签'
    ))
  ) {
    return
  }
  model.value.tagOwners.splice(index, 1)
}

/* ---------- 主机 ---------- */

function openHostAdd(): void {
  hostDialog.index = -1
  hostDialog.name = ''
  hostDialog.address = ''
  hostDialog.visible = true
  void ensureNodesLoaded()
}

function openHostEdit(index: number): void {
  const item = model.value.hosts[index]
  hostDialog.index = index
  hostDialog.name = item.name
  hostDialog.address = item.address
  hostDialog.visible = true
  void ensureNodesLoaded()
}

/** 从节点列表选择 IP 后，若别名为空则自动填入节点名 */
function handleHostAddressChange(value?: string): void {
  if (!value) return
  const option = nodeAddressOptions.value.find((item) => item.value === value)
  if (option && !hostDialog.name.trim()) {
    hostDialog.name = option.nodeName
  }
}

async function ensureNodesLoaded(): Promise<void> {
  if (!nodesStore.nodes.length && !nodesStore.loading) {
    await nodesStore.fetchNodes()
  }
}

function submitHost(): void {
  const name = hostDialog.name.trim()
  const address = (hostDialog.address || '').trim()

  if (!name || !address) {
    ElMessage.warning('请填写别名和地址')
    return
  }
  if (
    model.value.hosts.some(
      (item, index) => item.name === name && index !== hostDialog.index
    )
  ) {
    ElMessage.warning('该主机别名已存在')
    return
  }

  const item: HostItem = { name, address }
  if (hostDialog.index >= 0) {
    model.value.hosts.splice(hostDialog.index, 1, item)
  } else {
    model.value.hosts.push(item)
  }
  hostDialog.visible = false
  ElMessage.success('主机别名已保存')
}

async function removeHost(index: number): Promise<void> {
  const item = model.value.hosts[index]
  if (!item) return
  if (
    !(await confirmDelete(
      `删除主机别名「${item.name}」后，引用它的规则可能失效，是否继续？`,
      '删除主机别名'
    ))
  ) {
    return
  }
  model.value.hosts.splice(index, 1)
}

/* ---------- ACL ---------- */

function openAclAdd(): void {
  aclDialog.index = -1
  aclDialog.action = 'accept'
  aclDialog.src = []
  aclDialog.dst = []
  aclDialog.rest = {}
  aclDialog.visible = true
}

function openAclEdit(index: number): void {
  const item = model.value.acls[index]
  aclDialog.index = index
  aclDialog.action = item.action
  aclDialog.src = [...item.src]
  aclDialog.dst = [...item.dst]
  aclDialog.rest = { ...item.rest }
  aclDialog.visible = true
}

function submitAcl(): void {
  const src = prepareList(aclDialog.src, '源 (src)')
  if (!src) return
  const dst = prepareList(aclDialog.dst, '目标 (dst)')
  if (!dst) return

  const item: AclRuleItem = {
    action: aclDialog.action || 'accept',
    src,
    dst,
    rest: { ...aclDialog.rest }
  }

  if (aclDialog.index >= 0) {
    model.value.acls.splice(aclDialog.index, 1, item)
  } else {
    model.value.acls.push(item)
  }
  aclDialog.visible = false
  ElMessage.success('访问规则已保存')
}

async function removeAcl(index: number): Promise<void> {
  if (
    !(await confirmDelete(
      '删除该访问规则后，对应的流量将被拒绝，是否继续？',
      '删除访问规则'
    ))
  ) {
    return
  }
  model.value.acls.splice(index, 1)
}

function moveAcl(index: number, offset: number): void {
  const target = index + offset
  if (target < 0 || target >= model.value.acls.length) return
  const [item] = model.value.acls.splice(index, 1)
  model.value.acls.splice(target, 0, item)
}

/* ---------- 自动批准 ---------- */

function openAutoAdd(): void {
  autoDialog.index = -1
  autoDialog.route = ''
  autoDialog.approvers = []
  autoDialog.visible = true
}

function openAutoEdit(index: number): void {
  const item = model.value.autoApproverRoutes[index]
  autoDialog.index = index
  autoDialog.route = item.route
  autoDialog.approvers = [...item.approvers]
  autoDialog.visible = true
}

function submitAuto(): void {
  const route = autoDialog.route.trim()
  if (!route) {
    ElMessage.warning('请输入子网路由')
    return
  }
  if (
    model.value.autoApproverRoutes.some(
      (item, index) => item.route === route && index !== autoDialog.index
    )
  ) {
    ElMessage.warning('该路由已存在')
    return
  }
  const approvers = prepareList(autoDialog.approvers, '批准者')
  if (!approvers) return

  const item: AutoApproverItem = { route, approvers }
  if (autoDialog.index >= 0) {
    model.value.autoApproverRoutes.splice(autoDialog.index, 1, item)
  } else {
    model.value.autoApproverRoutes.push(item)
  }
  autoDialog.visible = false
  ElMessage.success('自动批准规则已保存')
}

async function removeAuto(index: number): Promise<void> {
  const item = model.value.autoApproverRoutes[index]
  if (!item) return
  if (
    !(await confirmDelete(
      `删除路由「${item.route}」的自动批准配置，是否继续？`,
      '删除自动批准'
    ))
  ) {
    return
  }
  model.value.autoApproverRoutes.splice(index, 1)
}

/* ---------- SSH ---------- */

function openSshAdd(): void {
  sshDialog.index = -1
  sshDialog.action = 'accept'
  sshDialog.src = []
  sshDialog.dst = []
  sshDialog.users = []
  sshDialog.rest = {}
  sshDialog.visible = true
}

function openSshEdit(index: number): void {
  const item = model.value.ssh[index]
  sshDialog.index = index
  sshDialog.action = item.action
  sshDialog.src = [...item.src]
  sshDialog.dst = [...item.dst]
  sshDialog.users = [...item.users]
  sshDialog.rest = { ...item.rest }
  sshDialog.visible = true
}

function submitSsh(): void {
  const src = prepareList(sshDialog.src, '源 (src)')
  if (!src) return
  const dst = prepareList(sshDialog.dst, '目标 (dst)')
  if (!dst) return
  const users = prepareList(sshDialog.users, '登录用户')
  if (!users) return

  const item: SshRuleItem = {
    action: sshDialog.action || 'accept',
    src,
    dst,
    users,
    rest: { ...sshDialog.rest }
  }

  if (sshDialog.index >= 0) {
    model.value.ssh.splice(sshDialog.index, 1, item)
  } else {
    model.value.ssh.push(item)
  }
  sshDialog.visible = false
  ElMessage.success('SSH 规则已保存')
}

async function removeSsh(index: number): Promise<void> {
  if (
    !(await confirmDelete('删除该 SSH 规则后，对应登录将被拒绝，是否继续？', '删除 SSH 规则'))
  ) {
    return
  }
  model.value.ssh.splice(index, 1)
}

async function handleGlobalKeydown(event: KeyboardEvent): Promise<void> {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    if (canSave.value) await savePolicy()
  }
}

watch(
  () => connection.configured,
  (configured) => {
    if (configured) {
      void usersStore.fetchUsers()
      void nodesStore.fetchNodes()
      void reloadPolicy(true)
    }
  },
  { immediate: true }
)

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})

onBeforeRouteLeave(async () => {
  if (!dirty.value) return true

  try {
    await ElMessageBox.confirm('当前有未保存的 ACL 修改，确定离开吗？', '未保存的修改', {
      type: 'warning',
      confirmButtonText: '离开',
      cancelButtonText: '留下'
    })
    return true
  } catch {
    return false
  }
})
</script>

<style scoped>
.updated-tag {
  font-family: 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
  font-size: 11px;
}

.info-icon {
  color: var(--hs-text-muted);
  cursor: help;
  margin-left: 2px;
}

.notice-alert {
  margin-bottom: 14px;
}

/* ---------- 概览 ---------- */

.summary-row {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.summary-tile {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
}

.summary-icon {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 10px;
  font-size: 17px;
}

.summary-icon.groups {
  color: #4f7cff;
  background: rgba(79, 124, 255, 0.1);
}

.summary-icon.tags {
  color: #8b5cf6;
  background: rgba(139, 92, 246, 0.1);
}

.summary-icon.hosts {
  color: #0ea5e9;
  background: rgba(14, 165, 233, 0.1);
}

.summary-icon.acls {
  color: #10b981;
  background: rgba(16, 185, 129, 0.1);
}

.summary-icon.ssh {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
}

.summary-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.summary-text strong {
  font-size: 20px;
  font-weight: 650;
  letter-spacing: -0.3px;
  font-family: 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
}

.summary-text span {
  font-size: 11.5px;
  color: var(--hs-text-secondary);
  margin-top: 2px;
}

/* ---------- 卡片 ---------- */

.policy-card {
  padding: 18px 20px;
}

.acl-card {
  margin-bottom: 16px;
}

.section-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 14px;
}

.card-title {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  min-width: 0;
}

.card-icon {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 9px;
  font-size: 16px;
}

.card-icon.groups {
  color: #4f7cff;
  background: rgba(79, 124, 255, 0.09);
}

.card-icon.tags {
  color: #8b5cf6;
  background: rgba(139, 92, 246, 0.09);
}

.card-icon.hosts {
  color: #0ea5e9;
  background: rgba(14, 165, 233, 0.09);
}

.card-icon.acl {
  color: #10b981;
  background: rgba(16, 185, 129, 0.09);
}

.card-icon.auto {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.09);
}

.card-icon.ssh {
  color: #f97316;
  background: rgba(249, 115, 22, 0.09);
}

.card-title h3 {
  margin: 0 0 3px;
  font-size: 14px;
  font-weight: 600;
}

.card-title p {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--hs-text-secondary);
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.count-badge {
  min-width: 22px;
  height: 20px;
  padding: 0 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid var(--hs-border);
  background: var(--hs-panel-soft);
  font-size: 10.5px;
  font-family: 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
  color: var(--hs-text-secondary);
}

.card-empty {
  padding: 10px 0 6px;
  font-size: 12.5px;
  color: var(--hs-text-muted);
}

.item-list {
  display: flex;
  flex-direction: column;
}

.item-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 11px 0;
  border-top: 1px dashed var(--hs-border);
}

.item-row:first-child {
  border-top: none;
  padding-top: 2px;
}

.item-main {
  min-width: 0;
  flex: 1;
}

.item-name {
  font-size: 12.5px;
  font-weight: 550;
  color: var(--hs-text);
}

.mono {
  font-family: 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 6px;
}

.chip {
  padding: 1px 7px;
  border-radius: 5px;
  border: 1px solid var(--hs-border);
  background: var(--hs-panel-soft);
  color: var(--hs-text-secondary);
  font-size: 11px;
  font-family: 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
  white-space: nowrap;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.acl-row {
  align-items: center;
}

.acl-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 5px;
}

.acl-index {
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--hs-text-muted);
  font-family: 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
}

.action-chip {
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 9.5px;
  letter-spacing: 0.08em;
  color: var(--hs-success);
  background: var(--hs-success-soft);
  font-family: 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
}

.acl-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  line-height: 1.9;
}

.acl-key {
  width: 30px;
  flex-shrink: 0;
  font-size: 9.5px;
  color: var(--hs-text-muted);
  font-family: 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
}

/* ---------- 通用 ---------- */

.dirty-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--hs-warning);
  white-space: nowrap;
}

.dirty-badge i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--hs-warning);
}

.full-width {
  width: 100%;
}

.hint {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--hs-text-muted);
}

.hint code {
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid var(--hs-border);
  background: var(--hs-panel-soft);
}

.empty-panel {
  padding: 40px 0;
}

.empty-hint {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--hs-text-secondary);
  max-width: 520px;
  word-break: break-all;
}

.empty-hint code {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--hs-panel-soft);
  border: 1px solid var(--hs-border);
}

/* ---------- 文件预览 ---------- */

.file-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-family: 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
  font-size: 11px;
  color: var(--hs-text-secondary);
}

.file-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--hs-accent);
  box-shadow: 0 0 8px var(--hs-accent);
}

.file-note {
  color: var(--hs-text-muted);
  font-size: 10.5px;
}

.file-preview {
  margin: 0;
  padding: 16px;
  max-height: calc(100vh - 220px);
  overflow: auto;
  border-radius: 10px;
  border: 1px solid rgba(125, 211, 252, 0.14);
  background: #070d18;
  color: #dbe6f7;
  font-family: 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.file-preview code {
  font: inherit;
}

@media (max-width: 1200px) {
  .summary-row {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .section-grid {
    grid-template-columns: 1fr;
  }
}
</style>
