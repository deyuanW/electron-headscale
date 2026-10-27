<template>
  <div class="page">
    <div class="page-heading">
      <div>
        <h2>网络拓扑</h2>
        <p>以关系图展示控制面与各节点的连接、在线状态和逻辑互连关系。</p>
      </div>
      <el-button v-if="connection.configured" :loading="nodesStore.loading" @click="refresh">
        <el-icon><Refresh /></el-icon>
        <span>刷新拓扑</span>
      </el-button>
    </div>

    <template v-if="connection.configured">
      <div class="toolbar">
        <div class="toolbar-left">
          <el-input v-model="search" placeholder="搜索主机名 / IP / 用户" clearable class="search-input">
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-select v-model="statusFilter" class="status-select">
            <el-option label="全部状态" value="all" />
            <el-option label="仅在线" value="online" />
            <el-option label="仅离线" value="offline" />
          </el-select>
          <div class="mesh-toggle">
            <el-switch v-model="showMesh" size="small" />
            <span>节点互连</span>
            <el-tooltip
              content="按 Tailnet 逻辑展示节点之间可建立的直连关系，不代表实时 WireGuard 链路状态"
              placement="top"
            >
              <el-icon class="mesh-info"><InfoFilled /></el-icon>
            </el-tooltip>
          </div>
        </div>
        <div class="toolbar-right">
          <span class="count-text">
            {{ nodesStore.nodes.length }} 个节点 · {{ userCount }} 个用户
          </span>
          <el-button @click="resetView">
            <el-icon><Aim /></el-icon>
            <span>重置视图</span>
          </el-button>
        </div>
      </div>

      <section
        class="graph-stage"
        :class="{ 'is-dragging': dragging, 'has-panel': Boolean(selectedId) }"
        v-loading="nodesStore.loading"
      >
        <div class="stage-glow"></div>
        <div class="hud-corners">
          <span v-for="index in 4" :key="index"></span>
        </div>

        <div class="graph-hud">
          <div class="hud-metrics">
            <div class="hud-metric">
              <span>NODES</span>
              <strong>{{ String(nodesStore.nodes.length).padStart(2, '0') }}</strong>
            </div>
            <i class="hud-sep"></i>
            <div class="hud-metric">
              <span>ONLINE</span>
              <strong class="accent">{{ String(nodesStore.onlineCount).padStart(2, '0') }}</strong>
            </div>
            <i class="hud-sep"></i>
            <div class="hud-metric">
              <span>USERS</span>
              <strong>{{ String(userCount).padStart(2, '0') }}</strong>
            </div>
          </div>
          <div class="hud-live">
            <i></i>
            LIVE TELEMETRY
          </div>
        </div>

        <svg
          ref="svgRef"
          class="graph-svg"
          :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
          preserveAspectRatio="xMidYMid meet"
          @wheel.prevent="onWheel"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        >
          <defs>
            <pattern id="topo-dots" width="26" height="26" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="#7dd3fc" opacity="0.14" />
            </pattern>
            <pattern id="topo-grid" width="130" height="130" patternUnits="userSpaceOnUse">
              <path d="M 130 0 L 0 0 0 130" fill="none" stroke="#7dd3fc" stroke-width="0.6" opacity="0.07" />
            </pattern>
            <radialGradient id="topo-core-face" cx="32%" cy="24%" r="85%">
              <stop offset="0%" stop-color="#3b4d8f" />
              <stop offset="55%" stop-color="#1b2550" />
              <stop offset="100%" stop-color="#0a1024" />
            </radialGradient>
            <radialGradient id="topo-node-face" cx="32%" cy="22%" r="90%">
              <stop offset="0%" stop-color="#1c2a44" />
              <stop offset="100%" stop-color="#0a1120" />
            </radialGradient>
            <linearGradient id="topo-link" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#38bdf8" />
              <stop offset="55%" stop-color="#818cf8" />
              <stop offset="100%" stop-color="#34d399" />
            </linearGradient>
            <linearGradient id="topo-sweep" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.16" />
              <stop offset="100%" stop-color="#38bdf8" stop-opacity="0" />
            </linearGradient>
            <filter id="topo-glow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect :width="WIDTH" :height="HEIGHT" fill="url(#topo-dots)" />
          <rect :width="WIDTH" :height="HEIGHT" fill="url(#topo-grid)" />

          <g :transform="`translate(${tx} ${ty}) scale(${scale})`">
            <!-- 雷达扫描：缓慢旋转的光带，增强控制面氛围 -->
            <g :transform="`translate(${CENTER_X} ${CENTER_Y})`" class="radar">
              <g>
                <path
                  d="M 0 0 L 0 -296 A 296 296 0 0 1 148 -256.3 Z"
                  fill="url(#topo-sweep)"
                />
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from="0"
                  to="360"
                  dur="20s"
                  repeatCount="indefinite"
                />
              </g>
            </g>

            <!-- 轨道刻度 -->
            <line
              v-for="tick in orbitTicks"
              :key="tick.id"
              :x1="tick.x1"
              :y1="tick.y1"
              :x2="tick.x2"
              :y2="tick.y2"
              class="orbit-tick"
              :class="{ major: tick.major }"
            />

            <!-- 轨道参考线 -->
            <circle
              v-for="radius in orbitRadii"
              :key="`orbit-${radius}`"
              :cx="CENTER_X"
              :cy="CENTER_Y"
              :r="radius"
              class="orbit"
            />

            <!-- 节点之间的逻辑互连 -->
            <path
              v-for="edge in meshLinks"
              :key="edge.id"
              :d="edge.d"
              class="mesh-link"
            />

            <!-- 控制面到节点的连接 -->
            <path
              v-for="link in controlLinks"
              :key="link.id"
              :d="link.d"
              class="control-link"
              :class="link.online ? 'online' : 'offline'"
            />

            <!-- 沿链路流动的数据点（仅在线节点） -->
            <g v-for="(link, index) in controlLinks" :key="`packet-${link.id}`">
              <circle v-if="link.online" r="2.1" class="link-packet">
                <animateMotion
                  :path="link.d"
                  dur="4.6s"
                  :begin="`${-0.7 * (index % 6)}s`"
                  repeatCount="indefinite"
                />
              </circle>
            </g>

            <!-- 控制面 -->
            <g class="control-plane" :transform="`translate(${CENTER_X} ${CENTER_Y})`">
              <circle r="112" class="control-aura" />
              <circle r="88" class="control-orbit control-orbit--outer" />
              <circle r="74" class="control-orbit control-orbit--inner" />
              <path
                d="M 0 -58 L 50.2 -29 L 50.2 29 L 0 58 L -50.2 29 L -50.2 -29 Z"
                class="core-hex-edge"
              />
              <path
                d="M 0 -50 L 43.3 -25 L 43.3 25 L 0 50 L -43.3 25 L -43.3 -25 Z"
                class="core-hex"
              />
              <path
                d="M 0 -39 L 33.8 -19.5 L 33.8 19.5 L 0 39 L -33.8 19.5 L -33.8 -19.5 Z"
                class="core-hex-inner"
              />
              <text y="0" class="core-mark" text-anchor="middle">HS</text>
              <text y="18" class="core-sub" text-anchor="middle">CONTROL</text>
              <text y="106" class="core-label" text-anchor="middle">
                {{ connection.version ? `HEADSCALE v${connection.version}` : 'HEADSCALE' }}
              </text>
              <text y="123" class="core-count" text-anchor="middle">
                {{ nodesStore.nodes.length }} NODES ATTACHED
              </text>
            </g>

            <!-- 节点 -->
            <g
              v-for="item in graphNodes"
              :key="item.node.id"
              class="graph-node"
              :class="{
                online: item.node.online,
                offline: !item.node.online,
                dimmed: !matchesFilter(item.node),
                selected: selectedId === item.node.id
              }"
              :transform="`translate(${item.x} ${item.y})`"
              @pointerdown.stop
              @click.stop="selectNode(item.node)"
            >
              <circle r="46" class="node-aura" />
              <circle
                r="34"
                class="node-orbit"
                :style="{ stroke: item.node.online ? userColor(item.node.user?.name) : 'rgba(148, 163, 184, 0.35)' }"
              />
              <circle r="28" class="node-face" />
              <circle v-if="item.node.online" r="28" class="node-sheen" />
              <circle v-if="selectedId === item.node.id" r="41" class="node-selection" />
              <text
                class="node-initial"
                text-anchor="middle"
                dy="4.5"
                :style="{ fill: item.node.online ? userColor(item.node.user?.name) : '#64748b' }"
              >
                {{ initial(item.node.name) }}
              </text>
              <circle cx="21" cy="-21" r="6" class="node-led-glow" :class="{ offline: !item.node.online }" />
              <circle cx="21" cy="-21" r="3" class="node-led" :class="item.node.online ? 'online' : 'offline'" />
              <text class="node-name" text-anchor="middle" y="52">
                {{ shortName(item.node.name) }}
              </text>
              <text class="node-ip" text-anchor="middle" y="67">
                {{ item.node.ipAddresses[0] || 'NO ADDRESS' }}
              </text>
              <title>
                {{ item.node.name }} · {{ item.node.online ? '在线' : '离线' }} ·
                {{ item.node.user?.name || '未知用户' }}
              </title>
            </g>
          </g>
        </svg>

        <div class="legend">
          <span><i class="legend-line control"></i>控制连接</span>
          <span><i class="legend-line online"></i>在线节点</span>
          <span><i class="legend-line offline"></i>离线节点</span>
          <span v-if="showMesh"><i class="legend-line mesh"></i>逻辑互连</span>
        </div>

        <div class="graph-hint">SCROLL ZOOM · DRAG PAN · CLICK NODE</div>

        <div v-if="!nodesStore.nodes.length && !nodesStore.loading" class="graph-empty">
          NO NODE DETECTED
        </div>

        <el-alert
          v-if="nodesStore.error"
          class="graph-error"
          type="error"
          :closable="false"
          show-icon
          :title="nodesStore.error"
        />

        <transition name="detail-panel">
          <aside v-if="selectedNode" class="detail-panel">
            <div class="detail-head">
              <div
                class="detail-avatar"
                :style="{
                  background: `${userColor(selectedNode.user?.name)}1f`,
                  color: userColor(selectedNode.user?.name),
                  borderColor: `${userColor(selectedNode.user?.name)}45`
                }"
              >
                {{ initial(selectedNode.name) }}
              </div>
              <div class="detail-heading">
                <div class="detail-eyebrow">NODE PROFILE</div>
                <div class="detail-name">{{ selectedNode.name }}</div>
                <div class="detail-host">{{ selectedNode.hostname }}</div>
              </div>
              <button class="detail-close" type="button" @click="selectedId = null">
                <el-icon><Close /></el-icon>
              </button>
            </div>

            <div class="detail-status">
              <span class="status-pill" :class="selectedNode.online ? 'online' : 'offline'">
                <i></i>{{ selectedNode.online ? 'ONLINE' : 'OFFLINE' }}
              </span>
              <span class="detail-id mono">#{{ selectedNode.id }}</span>
            </div>

            <dl class="detail-list">
              <div>
                <dt>用户</dt>
                <dd>{{ selectedNode.user?.name || '—' }}</dd>
              </div>
              <div>
                <dt>IP 地址</dt>
                <dd>
                  <span
                    v-for="ip in selectedNode.ipAddresses"
                    :key="ip"
                    class="ip-chip"
                  >{{ ip }}</span>
                  <span v-if="!selectedNode.ipAddresses.length">—</span>
                </dd>
              </div>
              <div>
                <dt>操作系统</dt>
                <dd>{{ selectedNode.os || '—' }}</dd>
              </div>
              <div>
                <dt>最后在线</dt>
                <dd>{{ selectedNode.online ? '当前在线' : formatRelative(selectedNode.lastSeen) }}</dd>
              </div>
              <div>
                <dt>过期时间</dt>
                <dd>{{ selectedNode.expiry ? formatDateTime(selectedNode.expiry) : '永不过期' }}</dd>
              </div>
            </dl>

            <div v-if="selectedNode.approvedRoutes.length" class="detail-routes">
              <div class="detail-section-title">APPROVED ROUTES</div>
              <div class="route-chips">
                <span v-for="prefix in selectedNode.approvedRoutes" :key="prefix" class="route-chip">
                  {{ prefix }}
                </span>
              </div>
            </div>

            <button class="detail-action" type="button" @click="router.push({ name: 'nodes' })">
              在节点管理中查看
              <el-icon><ArrowRight /></el-icon>
            </button>
          </aside>
        </transition>
      </section>
    </template>

    <section v-else class="surface empty-panel">
      <el-empty description="尚未配置 Headscale 连接" :image-size="96">
        <el-button type="primary" @click="router.push({ name: 'connection' })">
          前往连接配置
        </el-button>
      </el-empty>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { NodeResource } from '@shared/types/headscale'
import { useConnectionStore } from '@/stores/connection'
import { useNodesStore } from '@/stores/nodes'
import { formatDateTime, formatRelative } from '@/utils/format'

interface Point {
  x: number
  y: number
}

interface PositionedNode extends Point {
  node: NodeResource
}

interface GraphLink {
  id: string
  d: string
  online?: boolean
}

interface OrbitTick {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  major: boolean
}

const WIDTH = 1200
const HEIGHT = 760
const CENTER_X = WIDTH / 2
const CENTER_Y = 365

const USER_COLORS = [
  '#38bdf8',
  '#818cf8',
  '#a78bfa',
  '#f472b6',
  '#34d399',
  '#fbbf24',
  '#22d3ee',
  '#fb7185'
]

const router = useRouter()
const connection = useConnectionStore()
const nodesStore = useNodesStore()

const svgRef = ref<SVGSVGElement | null>(null)
const search = ref('')
const statusFilter = ref<'all' | 'online' | 'offline'>('all')
const showMesh = ref(true)
const selectedId = ref<string | null>(null)

const scale = ref(1)
const tx = ref(0)
const ty = ref(0)
const dragging = ref(false)

const dragState = {
  startX: 0,
  startY: 0,
  tx: 0,
  ty: 0,
  moved: false
}

const selectedNode = computed<NodeResource | null>(
  () => nodesStore.nodes.find((node) => node.id === selectedId.value) ?? null
)

const userCount = computed(() => {
  const names = new Set(
    nodesStore.nodes.map((node) => node.user?.name).filter((name): name is string => Boolean(name))
  )
  return names.size
})

/** 按用户排序后均匀分布在 1~2 个同心圆上，同一用户的节点相邻，便于展示互连 */
const graphNodes = computed<PositionedNode[]>(() => {
  const sorted = [...nodesStore.nodes].sort((left, right) => {
    const userCompare = (left.user?.name ?? '').localeCompare(right.user?.name ?? '')
    return userCompare !== 0 ? userCompare : left.name.localeCompare(right.name)
  })

  if (!sorted.length) return []

  const rings: NodeResource[][] = []
  if (sorted.length <= 8) {
    rings.push(sorted)
  } else {
    const innerCount = Math.ceil(sorted.length / 2)
    rings.push(sorted.slice(0, innerCount), sorted.slice(innerCount))
  }

  const radii = rings.length === 1 ? [240] : [190, 305]

  return rings.flatMap((ring, ringIndex) => {
    const radius = radii[ringIndex]
    const step = (Math.PI * 2) / ring.length
    const startAngle = -Math.PI / 2 + (ringIndex % 2 === 0 ? 0 : Math.PI / ring.length)

    return ring.map((node, index) => {
      const angle = startAngle + step * index
      return {
        node,
        x: CENTER_X + Math.cos(angle) * radius,
        y: CENTER_Y + Math.sin(angle) * radius
      }
    })
  })
})

const orbitRadii = computed(() => (graphNodes.value.length > 8 ? [190, 305] : [240]))

/** 轨道上的雷达刻度，让背景更有仪表盘质感 */
const orbitTicks = computed<OrbitTick[]>(() =>
  orbitRadii.value.flatMap((radius, ringIndex) =>
    Array.from({ length: 48 }, (_, index) => {
      const angle = (Math.PI * 2 * index) / 48
      const major = index % 6 === 0
      const innerRadius = radius - (major ? 8 : 3)

      return {
        id: `tick-${ringIndex}-${index}`,
        x1: CENTER_X + Math.cos(angle) * innerRadius,
        y1: CENTER_Y + Math.sin(angle) * innerRadius,
        x2: CENTER_X + Math.cos(angle) * radius,
        y2: CENTER_Y + Math.sin(angle) * radius,
        major
      }
    })
  )
)

/** 控制面 -> 节点：从中心圆边缘连到节点圆边缘，避免线条穿过图标 */
const controlLinks = computed<GraphLink[]>(() =>
  graphNodes.value.map((item, index) => ({
    id: `control-${item.node.id}`,
    d: curveBetween(
      { x: CENTER_X, y: CENTER_Y },
      item,
      58,
      36,
      (index % 2 === 0 ? 1 : -1) * 14
    ),
    online: item.node.online
  }))
)

/**
 * 节点间互连：
 * - 在线节点不超过 8 个时，展示全部两两互连（Tailnet 的网状特性）
 * - 更多节点时，只连接同一用户下的相邻节点，避免连线过于密集
 * 注意：这是逻辑拓扑，不代表当前真实的 WireGuard 直连 / DERP 中继状态。
 */
const meshLinks = computed<GraphLink[]>(() => {
  if (!showMesh.value) return []

  const online = graphNodes.value.filter((item) => item.node.online)
  if (online.length < 2) return []

  const links: GraphLink[] = []
  const pushLink = (left: PositionedNode, right: PositionedNode): void => {
    links.push({
      id: `mesh-${left.node.id}-${right.node.id}`,
      d: curveBetween(left, right, 32, 32, 26)
    })
  }

  if (online.length <= 8) {
    for (let i = 0; i < online.length; i += 1) {
      for (let j = i + 1; j < online.length; j += 1) {
        pushLink(online[i], online[j])
      }
    }
    return links
  }

  const groups = new Map<string, PositionedNode[]>()
  for (const item of online) {
    const key = item.node.user?.name || item.node.user?.id || 'unknown'
    const group = groups.get(key)
    if (group) group.push(item)
    else groups.set(key, [item])
  }

  for (const group of groups.values()) {
    for (let i = 0; i < group.length - 1; i += 1) {
      pushLink(group[i], group[i + 1])
    }
  }

  return links
})

function curveBetween(
  from: Point,
  to: Point,
  fromRadius: number,
  toRadius: number,
  bend: number
): string {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy) || 1
  const ux = dx / length
  const uy = dy / length

  const start = { x: from.x + ux * fromRadius, y: from.y + uy * fromRadius }
  const end = { x: to.x - ux * toRadius, y: to.y - uy * toRadius }
  const controlX = (start.x + end.x) / 2 - uy * bend
  const controlY = (start.y + end.y) / 2 + ux * bend

  return `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} Q ${controlX.toFixed(1)} ${controlY.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`
}

function userColor(name?: string): string {
  if (!name) return '#64748b'
  let hash = 0
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0
  }
  return USER_COLORS[hash % USER_COLORS.length]
}

function initial(name: string): string {
  return name.trim().slice(0, 2).toUpperCase()
}

function shortName(name: string): string {
  return name.length > 18 ? `${name.slice(0, 17)}…` : name
}

function matchesFilter(node: NodeResource): boolean {
  if (statusFilter.value === 'online' && !node.online) return false
  if (statusFilter.value === 'offline' && node.online) return false

  const keyword = search.value.trim().toLowerCase()
  if (!keyword) return true

  return [node.name, node.hostname, node.user?.name ?? '', node.os ?? '', ...node.ipAddresses]
    .join(' ')
    .toLowerCase()
    .includes(keyword)
}

async function refresh(): Promise<void> {
  if (!connection.configured) return
  await nodesStore.fetchNodes()
}

function selectNode(node: NodeResource): void {
  selectedId.value = selectedId.value === node.id ? null : node.id
}

function resetView(): void {
  scale.value = 1
  tx.value = 0
  ty.value = 0
  selectedId.value = null
}

function toSvgPoint(event: MouseEvent | WheelEvent, svg: SVGSVGElement): Point {
  const point = svg.createSVGPoint()
  point.x = event.clientX
  point.y = event.clientY

  const matrix = svg.getScreenCTM()
  if (!matrix) return { x: 0, y: 0 }

  const result = point.matrixTransform(matrix.inverse())
  return { x: result.x, y: result.y }
}

function onWheel(event: WheelEvent): void {
  const svg = svgRef.value
  if (!svg) return

  const pointer = toSvgPoint(event, svg)
  const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12
  const nextScale = Math.min(2.4, Math.max(0.55, scale.value * factor))
  if (nextScale === scale.value) return

  const ratio = nextScale / scale.value
  // 以光标位置为锚点缩放：保持光标下的图形坐标不动
  tx.value = pointer.x - ratio * (pointer.x - tx.value)
  ty.value = pointer.y - ratio * (pointer.y - ty.value)
  scale.value = nextScale
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return

  const svg = svgRef.value
  if (!svg) return

  const point = toSvgPoint(event, svg)
  dragging.value = true
  dragState.startX = point.x
  dragState.startY = point.y
  dragState.tx = tx.value
  dragState.ty = ty.value
  dragState.moved = false
  svg.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  if (!dragging.value || !svgRef.value) return

  const point = toSvgPoint(event, svgRef.value)
  const dx = point.x - dragState.startX
  const dy = point.y - dragState.startY

  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragState.moved = true

  tx.value = dragState.tx + dx
  ty.value = dragState.ty + dy
}

function onPointerUp(event: PointerEvent): void {
  if (!dragging.value) return

  dragging.value = false
  const svg = svgRef.value
  if (svg?.hasPointerCapture(event.pointerId)) {
    svg.releasePointerCapture(event.pointerId)
  }

  // 没有发生拖拽时，点击空白处取消选中
  if (!dragState.moved) selectedId.value = null
}

watch(
  () => connection.configured,
  (configured) => {
    if (configured) void refresh()
  },
  { immediate: true }
)
</script>

<style scoped>
.search-input {
  width: 250px;
}

.status-select {
  width: 126px;
}

.mesh-toggle {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--hs-border);
  border-radius: 8px;
  font-size: 13px;
  color: var(--hs-text-secondary);
  background: var(--hs-panel);
}

.mesh-info {
  color: var(--hs-text-muted);
  cursor: help;
}

/* ---------- 画布 ---------- */

.graph-stage {
  --g-bg: #05080f;
  --g-ink: #e8eefc;
  --g-muted: #8ea0bd;
  --g-dim: #64748b;
  --g-line: rgba(148, 163, 184, 0.16);
  --g-cyan: #38bdf8;
  --g-emerald: #34d399;
  --g-violet: #818cf8;

  position: relative;
  height: clamp(560px, calc(100vh - 260px), 760px);
  overflow: hidden;
  border-radius: 16px;
  border: 1px solid rgba(125, 211, 252, 0.14);
  background:
    radial-gradient(85% 95% at 50% 36%, rgba(56, 189, 248, 0.09), transparent 62%),
    radial-gradient(58% 58% at 10% 94%, rgba(129, 140, 248, 0.1), transparent 64%),
    radial-gradient(48% 48% at 94% 6%, rgba(52, 211, 153, 0.07), transparent 62%),
    var(--g-bg);
  box-shadow:
    0 24px 60px rgba(2, 6, 16, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.stage-glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(60% 55% at 50% 52%, rgba(56, 189, 248, 0.06), transparent 70%);
  mix-blend-mode: screen;
}

.graph-svg {
  position: relative;
  z-index: 2;
  width: 100%;
  height: 100%;
  display: block;
  cursor: grab;
  user-select: none;
  touch-action: none;
}

.graph-stage.is-dragging .graph-svg {
  cursor: grabbing;
}

/* ---------- HUD ---------- */

.graph-hud {
  position: absolute;
  z-index: 3;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 22px;
  pointer-events: none;
  background: linear-gradient(to bottom, rgba(4, 7, 14, 0.72), transparent);
  transition: opacity 0.2s ease;
}

.hud-metrics {
  display: flex;
  align-items: center;
  gap: 18px;
}

.hud-metric {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.hud-metric span {
  font-size: 9px;
  letter-spacing: 0.2em;
  color: rgba(142, 160, 189, 0.7);
  font-family: 'Bahnschrift', 'DIN Alternate', 'Segoe UI', sans-serif;
}

.hud-metric strong {
  font-size: 17px;
  font-weight: 600;
  line-height: 1;
  color: var(--g-ink);
  font-family: 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
  letter-spacing: 0.04em;
}

.hud-metric strong.accent {
  color: var(--g-emerald);
  text-shadow: 0 0 14px rgba(52, 211, 153, 0.35);
}

.hud-sep {
  width: 1px;
  height: 24px;
  background: linear-gradient(to bottom, transparent, rgba(125, 211, 252, 0.22), transparent);
}

.hud-live {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 11px;
  border: 1px solid rgba(52, 211, 153, 0.22);
  border-radius: 999px;
  background: rgba(52, 211, 153, 0.07);
  color: rgba(110, 231, 183, 0.9);
  font-size: 9px;
  letter-spacing: 0.18em;
  font-family: 'Bahnschrift', 'DIN Alternate', 'Segoe UI', sans-serif;
  transition: opacity 0.2s ease;
}

/* 详情面板打开时，淡出右侧的 HUD 元素，避免视觉重叠 */
.graph-stage.has-panel .hud-live,
.graph-stage.has-panel .graph-hint {
  opacity: 0;
}

.hud-live i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--g-emerald);
  box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.14);
  animation: live-pulse 2s ease-in-out infinite;
}

@keyframes live-pulse {
  0%,
  100% {
    opacity: 0.5;
    box-shadow: 0 0 0 2px rgba(52, 211, 153, 0.1);
  }
  50% {
    opacity: 1;
    box-shadow: 0 0 0 4px rgba(52, 211, 153, 0.18);
  }
}

.hud-corners {
  position: absolute;
  inset: 10px;
  z-index: 3;
  pointer-events: none;
}

.hud-corners span {
  position: absolute;
  width: 16px;
  height: 16px;
  border-color: rgba(125, 211, 252, 0.32);
  border-style: solid;
  border-width: 0;
}

.hud-corners span:nth-child(1) {
  top: 0;
  left: 0;
  border-top-width: 1px;
  border-left-width: 1px;
}

.hud-corners span:nth-child(2) {
  top: 0;
  right: 0;
  border-top-width: 1px;
  border-right-width: 1px;
}

.hud-corners span:nth-child(3) {
  bottom: 0;
  left: 0;
  border-bottom-width: 1px;
  border-left-width: 1px;
}

.hud-corners span:nth-child(4) {
  bottom: 0;
  right: 0;
  border-bottom-width: 1px;
  border-right-width: 1px;
}

/* ---------- SVG 元素 ---------- */

.orbit {
  fill: none;
  stroke: rgba(125, 211, 252, 0.12);
  stroke-width: 1;
  stroke-dasharray: 2 10;
}

.orbit-tick {
  stroke: rgba(125, 211, 252, 0.16);
  stroke-width: 1;
}

.orbit-tick.major {
  stroke: rgba(125, 211, 252, 0.38);
}

.radar {
  pointer-events: none;
}

.control-link {
  fill: none;
  stroke-width: 1.4;
}

.control-link.online {
  stroke: url(#topo-link);
  opacity: 0.55;
  stroke-dasharray: 5 9;
  animation: link-flow 2.8s linear infinite;
}

.control-link.offline {
  stroke: rgba(100, 116, 139, 0.4);
  stroke-dasharray: 2 8;
}

.mesh-link {
  fill: none;
  stroke: rgba(129, 140, 248, 0.5);
  stroke-width: 1;
  stroke-dasharray: 3 11;
  opacity: 0.22;
}

.link-packet {
  fill: #7dd3fc;
  opacity: 0.9;
  filter: drop-shadow(0 0 4px rgba(56, 189, 248, 0.9));
}

@keyframes link-flow {
  to {
    stroke-dashoffset: -28;
  }
}

.control-aura {
  fill: rgba(56, 189, 248, 0.06);
  filter: url(#topo-glow);
  animation: core-pulse 5s ease-in-out infinite;
}

.control-orbit {
  fill: none;
  stroke: rgba(125, 211, 252, 0.3);
  stroke-width: 1;
}

.control-orbit--outer {
  stroke-dasharray: 2 12;
  transform-box: fill-box;
  transform-origin: center;
  animation: orbit-spin 40s linear infinite;
}

.control-orbit--inner {
  stroke-dasharray: 18 10;
  opacity: 0.45;
  transform-box: fill-box;
  transform-origin: center;
  animation: orbit-spin-reverse 26s linear infinite;
}

@keyframes orbit-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes orbit-spin-reverse {
  to {
    transform: rotate(-360deg);
  }
}

@keyframes core-pulse {
  0%,
  100% {
    opacity: 0.55;
  }
  50% {
    opacity: 1;
  }
}

.core-hex-edge {
  fill: none;
  stroke: rgba(125, 211, 252, 0.45);
  stroke-width: 1.4;
  stroke-linejoin: round;
}

.core-hex {
  fill: url(#topo-core-face);
  stroke: rgba(125, 211, 252, 0.55);
  stroke-width: 1;
  filter: url(#topo-glow);
}

.core-hex-inner {
  fill: none;
  stroke: rgba(125, 211, 252, 0.16);
  stroke-width: 1;
  stroke-linejoin: round;
}

.core-mark {
  fill: #f0f7ff;
  font-size: 21px;
  font-weight: 700;
  letter-spacing: 2px;
  font-family: 'Bahnschrift', 'DIN Alternate', 'Segoe UI', sans-serif;
}

.core-sub {
  fill: rgba(125, 211, 252, 0.7);
  font-size: 7px;
  letter-spacing: 3px;
  font-family: 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
}

.core-label {
  fill: #c7d6ec;
  font-size: 11px;
  letter-spacing: 0.16em;
  font-family: 'Bahnschrift', 'DIN Alternate', 'Segoe UI', sans-serif;
}

.core-count {
  fill: rgba(142, 160, 189, 0.65);
  font-size: 8.5px;
  letter-spacing: 0.14em;
  font-family: 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
}

.graph-node {
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.graph-node.dimmed {
  opacity: 0.14;
}

.node-aura {
  fill: transparent;
}

.graph-node.online .node-aura {
  fill: rgba(52, 211, 153, 0.16);
  filter: url(#topo-glow);
  animation: node-pulse 3.4s ease-in-out infinite;
}

@keyframes node-pulse {
  0%,
  100% {
    opacity: 0.25;
  }
  50% {
    opacity: 0.7;
  }
}

.node-orbit {
  fill: none;
  stroke-width: 1.2;
  opacity: 0.6;
}

.graph-node.offline .node-orbit {
  stroke-dasharray: 3 5;
  opacity: 0.45;
}

.node-face {
  fill: url(#topo-node-face);
  stroke: rgba(148, 163, 184, 0.18);
  stroke-width: 1;
}

.node-sheen {
  fill: rgba(255, 255, 255, 0.03);
}

.graph-node.selected .node-face {
  stroke: rgba(125, 211, 252, 0.9);
  stroke-width: 1.6;
}

.node-selection {
  fill: none;
  stroke: var(--g-cyan);
  stroke-width: 1.2;
  stroke-dasharray: 4 7;
  opacity: 0.8;
  animation: selection-spin 10s linear infinite;
}

@keyframes selection-spin {
  to {
    stroke-dashoffset: -44;
  }
}

.node-led {
  transition: fill 0.2s ease;
}

.node-led.online {
  fill: #34d399;
}

.node-led.offline {
  fill: #475569;
}

.node-led-glow {
  fill: rgba(52, 211, 153, 0.28);
}

.node-led-glow.offline {
  fill: transparent;
}

.node-initial {
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  font-family: 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
  pointer-events: none;
}

.node-name {
  fill: #dbe6f7;
  font-size: 12.5px;
  font-weight: 500;
  letter-spacing: 0.01em;
  paint-order: stroke;
  stroke: #05080f;
  stroke-width: 4px;
  stroke-linejoin: round;
}

.node-ip {
  fill: rgba(142, 160, 189, 0.78);
  font-size: 9.5px;
  letter-spacing: 0.04em;
  font-family: 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
  paint-order: stroke;
  stroke: #05080f;
  stroke-width: 3px;
  stroke-linejoin: round;
}

/* ---------- 图例 / 提示 ---------- */

.legend {
  position: absolute;
  z-index: 3;
  left: 20px;
  bottom: 18px;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 8px 13px;
  border-radius: 8px;
  border: 1px solid rgba(125, 211, 252, 0.14);
  background: rgba(6, 11, 20, 0.6);
  backdrop-filter: blur(10px);
  font-size: 9.5px;
  letter-spacing: 0.12em;
  color: rgba(142, 160, 189, 0.85);
  font-family: 'Bahnschrift', 'DIN Alternate', 'Segoe UI', sans-serif;
  pointer-events: none;
}

.legend span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.legend-line {
  width: 16px;
  height: 0;
  border-top: 1.4px solid rgba(148, 163, 184, 0.5);
  display: inline-block;
}

.legend-line.control {
  border-color: rgba(148, 163, 184, 0.6);
  border-top-style: dashed;
}

.legend-line.online {
  border-color: var(--g-emerald);
  border-top-style: dashed;
}

.legend-line.offline {
  border-color: rgba(100, 116, 139, 0.7);
  border-top-style: dotted;
}

.legend-line.mesh {
  border-color: rgba(129, 140, 248, 0.8);
  border-top-style: dashed;
}

.graph-hint {
  position: absolute;
  z-index: 3;
  right: 20px;
  bottom: 20px;
  font-size: 9px;
  letter-spacing: 0.16em;
  color: rgba(142, 160, 189, 0.5);
  font-family: 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.graph-empty {
  position: absolute;
  z-index: 3;
  left: 50%;
  top: 63%;
  transform: translate(-50%, -50%);
  font-size: 10px;
  letter-spacing: 0.22em;
  color: rgba(142, 160, 189, 0.55);
  font-family: 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
  pointer-events: none;
}

.graph-error {
  position: absolute;
  z-index: 3;
  left: 20px;
  right: 20px;
  bottom: 64px;
}

/* ---------- 详情面板 ---------- */

.detail-panel {
  position: absolute;
  z-index: 4;
  top: 14px;
  right: 14px;
  bottom: 14px;
  width: 304px;
  padding: 20px;
  overflow-y: auto;
  border-radius: 13px;
  border: 1px solid rgba(125, 211, 252, 0.2);
  background:
    linear-gradient(155deg, rgba(16, 24, 42, 0.94), rgba(6, 10, 20, 0.96)),
    rgba(6, 10, 20, 0.94);
  backdrop-filter: blur(18px);
  box-shadow:
    0 28px 70px rgba(0, 0, 0, 0.55),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  color: var(--g-ink);
}

.detail-panel::before {
  content: '';
  position: absolute;
  top: 0;
  left: 18px;
  right: 18px;
  height: 1px;
  background: linear-gradient(to right, transparent, rgba(125, 211, 252, 0.5), transparent);
}

.detail-head {
  display: flex;
  align-items: center;
  gap: 11px;
  margin-bottom: 14px;
}

.detail-avatar {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  border: 1px solid transparent;
  display: grid;
  place-items: center;
  font-size: 13px;
  font-weight: 700;
  font-family: 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
  flex-shrink: 0;
}

.detail-heading {
  min-width: 0;
  flex: 1;
}

.detail-eyebrow {
  font-size: 8.5px;
  letter-spacing: 0.18em;
  color: rgba(125, 211, 252, 0.55);
  font-family: 'Bahnschrift', 'DIN Alternate', 'Segoe UI', sans-serif;
  margin-bottom: 2px;
}

.detail-name {
  font-size: 14.5px;
  font-weight: 650;
  letter-spacing: 0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-host {
  font-size: 10.5px;
  color: rgba(142, 160, 189, 0.7);
  font-family: 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-close {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.03);
  color: rgba(142, 160, 189, 0.8);
  cursor: pointer;
  transition: all 0.15s ease;
}

.detail-close:hover {
  color: #e8eefc;
  border-color: rgba(125, 211, 252, 0.4);
  background: rgba(125, 211, 252, 0.08);
}

.detail-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
}

.detail-id {
  font-size: 10.5px;
  color: rgba(142, 160, 189, 0.55);
}

.detail-list {
  margin: 14px 0 0;
  display: flex;
  flex-direction: column;
  gap: 11px;
}

.detail-list > div {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.detail-list dt {
  font-size: 11px;
  color: rgba(142, 160, 189, 0.7);
  flex-shrink: 0;
}

.detail-list dd {
  margin: 0;
  font-size: 12px;
  text-align: right;
  color: #cfdbee;
  word-break: break-all;
}

.detail-routes {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid rgba(148, 163, 184, 0.12);
}

.detail-section-title {
  font-size: 8.5px;
  letter-spacing: 0.18em;
  color: rgba(125, 211, 252, 0.55);
  font-family: 'Bahnschrift', 'DIN Alternate', 'Segoe UI', sans-serif;
  margin-bottom: 9px;
}

.route-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.route-chip {
  padding: 2px 8px;
  border-radius: 5px;
  font-size: 10.5px;
  font-family: 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
  color: rgba(165, 200, 235, 0.9);
  background: rgba(56, 189, 248, 0.07);
  border: 1px solid rgba(56, 189, 248, 0.16);
}

.detail-action {
  width: 100%;
  height: 34px;
  margin-top: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 8px;
  border: 1px solid rgba(125, 211, 252, 0.3);
  background: rgba(56, 189, 248, 0.1);
  color: #9adcff;
  font-size: 12px;
  letter-spacing: 0.03em;
  cursor: pointer;
  transition: all 0.18s ease;
}

.detail-action:hover {
  border-color: rgba(125, 211, 252, 0.55);
  background: rgba(56, 189, 248, 0.18);
  box-shadow: 0 0 20px rgba(56, 189, 248, 0.12);
}

.detail-panel-enter-active,
.detail-panel-leave-active {
  transition: transform 0.24s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.24s ease;
}

.detail-panel-enter-from,
.detail-panel-leave-to {
  transform: translateX(18px);
  opacity: 0;
}

/* 深色画布内的 Element Plus / 全局类适配 */
.graph-stage :deep(.el-loading-mask) {
  background: rgba(4, 7, 14, 0.72);
  backdrop-filter: blur(3px);
  border-radius: 16px;
}

.graph-stage :deep(.status-pill.online) {
  color: #34d399;
  background: rgba(52, 211, 153, 0.1);
  font-family: 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
  font-size: 9.5px;
  letter-spacing: 0.12em;
}

.graph-stage :deep(.status-pill.offline) {
  color: rgba(148, 163, 184, 0.9);
  background: rgba(148, 163, 184, 0.1);
  font-family: 'Cascadia Code', 'JetBrains Mono', Consolas, monospace;
  font-size: 9.5px;
  letter-spacing: 0.12em;
}

.graph-stage :deep(.ip-chip) {
  color: rgba(165, 200, 235, 0.9);
  background: rgba(56, 189, 248, 0.06);
  border-color: rgba(56, 189, 248, 0.14);
}

.empty-panel {
  padding: 40px 0;
}
</style>
