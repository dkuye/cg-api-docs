<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import JsonFoldViewer from './JsonFoldViewer.vue'
import {
  resolveSchemaToTree,
  generateMockFromSchema,
  generateSchemaJsonRepresentation,
  type SchemaField
} from '../utils/swaggerParser'

// --- State ---
const route = useRoute()
const router = useRouter()
const swaggerDoc = ref<any>(null)
const isLoadingDoc = ref<boolean>(false)
const docError = ref<string>('')
const swaggerSourceType = ref<'default' | 'url' | 'upload'>('default')
const swaggerUrlInput = ref<string>('/swagger.json')
const uploadedFileName = ref<string>('')

// Theme State (default dark mode)
const theme = ref<'light' | 'dark'>('dark')

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
}

watch(theme, (newTheme) => {
  if (newTheme === 'dark') {
    document.documentElement.classList.add('dark')
    localStorage.setItem('theme', 'dark')
  } else {
    document.documentElement.classList.remove('dark')
    localStorage.setItem('theme', 'light')
  }
}, { immediate: true })

// Config & Headers
const getSavedHeaders = () => {
  const saved = localStorage.getItem('globalHeaders')
  if (saved) {
    try {
      return JSON.parse(saved)
    } catch (e) {
      // fallback
    }
  }
  return [
    { key: 'Authorization', value: 'Bearer ', enabled: false },
    { key: 'Content-Type', value: 'application/json', enabled: true }
  ]
}

const apiServerUrl = ref<string>('')
const globalHeaders = ref<{ key: string; value: string; enabled: boolean }[]>(getSavedHeaders())

// Persist Global Headers when modified
watch(globalHeaders, (newHeaders) => {
  localStorage.setItem('globalHeaders', JSON.stringify(newHeaders))
}, { deep: true })

function onApiHostInput() {
  if (!apiServerUrl.value.trim()) {
    localStorage.removeItem('customApiServerUrl')
  } else {
    localStorage.setItem('customApiServerUrl', apiServerUrl.value)
  }
}

// Sidebar Filter
const searchQuery = ref<string>('')
const selectedMethodFilter = ref<string>('ALL')
const expandedTags = ref<Record<string, boolean>>({})

// Selected Endpoint
const selectedEndpoint = ref<{
  path: string;
  method: string;
  details: any;
} | null>(null)

// Endpoint Parameters State (bound to input forms)
const paramValues = ref<Record<string, any>>({})
const bodyParamText = ref<string>('')

// Try It Out Execution State
const isSendingRequest = ref<boolean>(false)
const requestResponse = ref<{
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  timeMs: number;
  error?: string;
  curlCommand?: string;
} | null>(null)

// Tab state for Response View
const responseTab = ref<'body' | 'headers' | 'curl'>('body')

// Methods list filters
const methodsList = ['ALL', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH']

// --- Helper Functions ---
function getMethodColorClass(method: string) {
  const m = method.toUpperCase()
  if (m === 'GET') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (m === 'POST') return 'bg-blue-50 text-blue-700 border-blue-200'
  if (m === 'PUT') return 'bg-amber-50 text-amber-700 border-amber-200'
  if (m === 'DELETE') return 'bg-rose-50 text-rose-700 border-rose-200'
  return 'bg-slate-50 text-slate-700 border-slate-200'
}

function getMethodBadgeClass(method: string) {
  const m = method.toUpperCase()
  if (m === 'GET') return 'bg-emerald-500 text-white'
  if (m === 'POST') return 'bg-blue-500 text-white'
  if (m === 'PUT') return 'bg-amber-500 text-white'
  if (m === 'DELETE') return 'bg-rose-500 text-white'
  return 'bg-slate-500 text-white'
}

// --- Fetch & Parse Swagger Document ---
async function loadSwaggerDoc() {
  isLoadingDoc.value = true
  docError.value = ''
  selectedEndpoint.value = null
  requestResponse.value = null

  try {
    let docData: any = null

    if (swaggerSourceType.value === 'default') {
      const res = await fetch('/swagger.json')
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`)
      docData = await res.json()
    } else if (swaggerSourceType.value === 'url') {
      const res = await fetch(swaggerUrlInput.value)
      if (!res.ok) throw new Error(`Failed to fetch URL. HTTP status: ${res.status}. Check CORS.`)
      docData = await res.json()
    }

    if (docData) {
      processLoadedDoc(docData)
    }
  } catch (err: any) {
    console.error(err)
    docError.value = `Failed to load Swagger JSON: ${err.message || err}`
  } finally {
    isLoadingDoc.value = false
  }
}

function processLoadedDoc(data: any) {
  swaggerDoc.value = data
  
  // Set default API Server URL from host and basePath if no custom override exists
  const savedCustomUrl = localStorage.getItem('customApiServerUrl')
  if (savedCustomUrl) {
    apiServerUrl.value = savedCustomUrl
  } else {
    const scheme = data.schemes && data.schemes[0] ? `${data.schemes[0]}://` : 'http://'
    const host = data.host || window.location.host
    const basePath = data.basePath || ''
    apiServerUrl.value = `${scheme}${host}${basePath}`
  }

  // Default expand all tags on initial load
  if (data.paths) {
    const tags = new Set<string>()
    Object.values(data.paths).forEach((methods: any) => {
      Object.values(methods).forEach((op: any) => {
        if (op.tags && op.tags[0]) {
          tags.add(op.tags[0])
        }
      });
    });
    tags.forEach(tag => {
      expandedTags.value[tag] = true
    })
  }
}

// Handle file upload
function handleFileUpload(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  uploadedFileName.value = file.name
  isLoadingDoc.value = true
  docError.value = ''

  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target?.result as string)
      processLoadedDoc(data)
    } catch (err: any) {
      docError.value = `Error parsing JSON file: ${err.message}`
    } finally {
      isLoadingDoc.value = false
    }
  }
  reader.onerror = () => {
    docError.value = 'Failed to read file.'
    isLoadingDoc.value = false
  }
  reader.readAsText(file)
}

// --- Parse Endpoints Grouped by Tags ---
const parsedEndpoints = computed(() => {
  if (!swaggerDoc.value || !swaggerDoc.value.paths) return []

  const endpoints: { path: string; method: string; details: any; tag: string }[] = []

  for (const [path, pathItem] of Object.entries(swaggerDoc.value.paths)) {
    for (const [method, op] of Object.entries(pathItem as any)) {
      if (['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].includes(method)) {
        const details = op as any
        const tag = details.tags && details.tags[0] ? details.tags[0] : 'General'
        endpoints.push({
          path,
          method: method.toUpperCase(),
          details,
          tag
        })
      }
    }
  }
  return endpoints
})

// Filter and group endpoints
const filteredGroupedEndpoints = computed(() => {
  const query = searchQuery.value.toLowerCase().trim()
  const methodFilter = selectedMethodFilter.value

  const filtered = parsedEndpoints.value.filter(ep => {
    const matchesQuery =
      ep.path.toLowerCase().includes(query) ||
      (ep.details.summary && ep.details.summary.toLowerCase().includes(query)) ||
      (ep.details.description && ep.details.description.toLowerCase().includes(query)) ||
      ep.tag.toLowerCase().includes(query)

    const matchesMethod = methodFilter === 'ALL' || ep.method === methodFilter

    return matchesQuery && matchesMethod
  })

  // Group by Tag
  const groups: Record<string, typeof filtered> = {}
  filtered.forEach(ep => {
    if (!groups[ep.tag]) {
      groups[ep.tag] = []
    }
    groups[ep.tag]!.push(ep)
  })

  return groups
})

// Statistics computed
const apiStats = computed(() => {
  if (!parsedEndpoints.value.length) return null

  const countsByMethod: Record<string, number> = {}
  parsedEndpoints.value.forEach(ep => {
    countsByMethod[ep.method] = (countsByMethod[ep.method] || 0) + 1
  })

  const tagSet = new Set<string>()
  parsedEndpoints.value.forEach(ep => tagSet.add(ep.tag))

  return {
    total: parsedEndpoints.value.length,
    tagsCount: tagSet.size,
    methods: countsByMethod
  }
})

// --- Sidebar Actions ---
function toggleTag(tag: string) {
  expandedTags.value[tag] = !expandedTags.value[tag]
}

function selectEndpoint(ep: { path: string; method: string; details: any }) {
  selectedEndpoint.value = ep
  requestResponse.value = null
  paramValues.value = {}
  bodyParamText.value = ''

  // Initialize input parameter fields with defaults
  if (ep.details.parameters) {
    ep.details.parameters.forEach((param: any) => {
      // Setup mock / default values
      if (param.in === 'body') {
        const mockObj = generateMockFromSchema(param.schema, swaggerDoc.value.definitions)
        bodyParamText.value = mockObj ? JSON.stringify(mockObj, null, 2) : '{}'
      } else {
        let defVal = param.default !== undefined ? param.default : ''
        if (param.type === 'boolean') {
          defVal = param.default !== undefined ? String(param.default) === 'true' : false
        }
        paramValues.value[param.name] = defVal
      }
    })
  }

  // Update Route Query Parameters
  if (route.query.path !== ep.path || route.query.method !== ep.method) {
    router.push({
      path: route.path,
      query: {
        ...route.query,
        path: ep.path,
        method: ep.method
      }
    })
  }
}

// Synchronize selected endpoint with route query params
watch([parsedEndpoints, () => route.query.path, () => route.query.method], ([endpoints, path, method]) => {
  if (endpoints && endpoints.length && path && method) {
    const matched = endpoints.find(
      (ep) => ep.path === path && ep.method === String(method).toUpperCase()
    )
    if (matched) {
      if (
        !selectedEndpoint.value ||
        selectedEndpoint.value.path !== matched.path ||
        selectedEndpoint.value.method !== matched.method
      ) {
        selectEndpoint(matched)
      }
    }
  } else if (endpoints && endpoints.length && (!path || !method)) {
    selectedEndpoint.value = null
  }
}, { immediate: true })

function clearSelection() {
  selectedEndpoint.value = null
  router.push({
    path: route.path,
    query: {
      ...route.query,
      path: undefined,
      method: undefined
    }
  })
}

// --- Request Execution Runner ---
async function runRequest() {
  if (!selectedEndpoint.value) return

  isSendingRequest.value = true
  requestResponse.value = null
  responseTab.value = 'body'

  const { path, method, details } = selectedEndpoint.value

  // 1. Construct Headers
  const headers = new Headers()
  
  // Apply Global Active Headers
  globalHeaders.value.forEach(h => {
    if (h.enabled && h.key.trim() && h.value.trim()) {
      headers.append(h.key.trim(), h.value.trim())
    }
  })

  // Apply Parameter specific headers & prepare Query/Path Params
  const queryParams = new URLSearchParams()
  let finalPath = path

  if (details.parameters) {
    details.parameters.forEach((param: any) => {
      const val = paramValues.value[param.name]
      if (val === undefined || val === '') return

      if (param.in === 'path') {
        finalPath = finalPath.replace(`{${param.name}}`, encodeURIComponent(String(val)))
      } else if (param.in === 'query') {
        queryParams.append(param.name, String(val))
      } else if (param.in === 'header') {
        headers.append(param.name, String(val))
      }
    })
  }

  // 2. Assemble Body
  let bodyData: any = null
  const bodyParam = details.parameters?.find((p: any) => p.in === 'body')
  if (bodyParam) {
    bodyData = bodyParamText.value
  }

  // Handle Query String
  const queryString = queryParams.toString()
  const requestUrl = `${apiServerUrl.value.replace(/\/$/, '')}${finalPath}${queryString ? '?' + queryString : ''}`

  // Generate Curl Command Preview
  let curl = `curl -X ${method} "${requestUrl}"`
  headers.forEach((v, k) => {
    curl += ` \\\n  -H "${k}: ${v}"`
  })
  if (bodyData && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    // Escape single quotes for bash safe rendering
    const escapedBody = bodyData.replace(/'/g, "'\\''")
    curl += ` \\\n  -d '${escapedBody}'`
  }

  const startTime = performance.now()

  try {
    const fetchOptions: RequestInit = {
      method,
      headers
    }

    if (bodyData && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      fetchOptions.body = bodyData
    }

    const res = await fetch(requestUrl, fetchOptions)
    const endTime = performance.now()
    const timeMs = Math.round(endTime - startTime)

    // Extract Headers
    const resHeaders: Record<string, string> = {}
    res.headers.forEach((v, k) => {
      resHeaders[k] = v
    })

    // Parse Body
    let text = ''
    try {
      const blob = await res.blob()
      text = await blob.text()
      // Try to format if it is JSON
      const parsed = JSON.parse(text)
      text = JSON.stringify(parsed, null, 2)
    } catch {
      // Use raw text if parse fails
    }

    requestResponse.value = {
      status: res.status,
      statusText: res.statusText || getStatusText(res.status),
      headers: resHeaders,
      body: text,
      timeMs,
      curlCommand: curl
    }
  } catch (err: any) {
    const endTime = performance.now()
    requestResponse.value = {
      status: 0,
      statusText: 'Network Error',
      headers: {},
      body: '',
      timeMs: Math.round(endTime - startTime),
      error: err.message || 'The request was blocked. This is likely a CORS policy issue on the target server, or the server is offline.',
      curlCommand: curl
    }
  } finally {
    isSendingRequest.value = false
  }
}

// Fallback status text resolver
function getStatusText(status: number): string {
  const codes: Record<number, string> = {
    200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content',
    400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
    409: 'Conflict', 422: 'Unprocessable Entity', 500: 'Internal Server Error',
    502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout'
  }
  return codes[status] || 'Unknown'
}

// --- Header Management ---
function addGlobalHeader() {
  globalHeaders.value.push({ key: '', value: '', enabled: true })
}

function removeGlobalHeader(index: number) {
  globalHeaders.value.splice(index, 1)
}

// --- Helper for formatting responses schema ---
function getResponseSchemaTree(schema: any) {
  if (!schema || !swaggerDoc.value) return null
  return resolveSchemaToTree(schema, swaggerDoc.value.definitions)
}

function getResponseSchemaJson(schema: any) {
  if (!schema || !swaggerDoc.value) return ''
  const representation = generateSchemaJsonRepresentation(schema, swaggerDoc.value.definitions)
  return JSON.stringify(representation, null, 2)
}

function getResponseSchemaObj(schema: any) {
  if (!schema || !swaggerDoc.value) return null
  return generateSchemaJsonRepresentation(schema, swaggerDoc.value.definitions)
}

function tryParseJson(val: any) {
  if (typeof val !== 'string') return null
  try {
    return JSON.parse(val)
  } catch (e) {
    return null
  }
}

// Clipboard copying
const copySuccess = ref<boolean>(false)
function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text)
  copySuccess.value = true
  setTimeout(() => {
    copySuccess.value = false
  }, 2000)
}

// On Mount
onMounted(() => {
  const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
  theme.value = savedTheme || 'dark'
  loadSwaggerDoc()
})

// Watch source type trigger
watch(swaggerSourceType, () => {
  if (swaggerSourceType.value === 'default') {
    swaggerUrlInput.value = '/swagger.json'
    loadSwaggerDoc()
  }
})
</script>

<template>
  <div class="flex h-screen w-screen overflow-hidden bg-slate-50 dark:bg-slate-950 font-sans transition-colors duration-200">
    
    <!-- LEFT SIDEBAR -->
    <aside class="flex flex-col w-80 md:w-96 border-r border-slate-200 dark:border-slate-800 bg-slate-900 text-slate-300 select-none overflow-hidden shrink-0">
      
      <!-- Logo / Title -->
      <div 
        @click="clearSelection" 
        class="flex items-center gap-3 px-6 py-5 bg-slate-950 border-b border-slate-800 cursor-pointer hover:bg-slate-900/40 transition-colors"
      >
        <div class="flex items-center justify-center w-9 h-9 rounded-xl bg-indigo-500 text-white shadow-md shadow-indigo-500/20">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
        </div>
        <div>
          <h1 class="text-base font-bold text-white tracking-tight leading-none">Swagger Viewer</h1>
          <p class="text-xs text-slate-400 mt-1 font-mono">v2.0 Reader</p>
        </div>
      </div>

      <!-- Search & Filters -->
      <div class="p-4 bg-slate-950/40 border-b border-slate-800/80 space-y-3">
        <!-- Search bar -->
        <div class="relative">
          <span class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
          </span>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search endpoints, paths..."
            class="w-full pl-9 pr-4 py-2 bg-slate-850 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all"
          />
        </div>

        <!-- Method filters -->
        <div class="flex flex-wrap gap-1">
          <button
            v-for="method in methodsList"
            :key="method"
            @click="selectedMethodFilter = method"
            class="px-2.5 py-1 rounded text-xs font-semibold uppercase tracking-wider transition-all border"
            :class="selectedMethodFilter === method
              ? 'bg-indigo-600 text-white border-indigo-500 shadow'
              : 'bg-slate-800/50 text-slate-400 border-slate-800 hover:bg-slate-800'"
          >
            {{ method }}
          </button>
        </div>
      </div>

      <!-- Scrollable Menu list -->
      <div class="flex-1 overflow-y-auto py-4 px-2 space-y-2">
        <div v-if="Object.keys(filteredGroupedEndpoints).length === 0" class="text-center py-8 text-slate-500 text-sm">
          No endpoints match filters
        </div>

        <!-- Groups -->
        <div
          v-for="(endpoints, tag) in filteredGroupedEndpoints"
          :key="tag"
          class="border border-slate-800/50 rounded-lg overflow-hidden bg-slate-850/20"
        >
          <!-- Collapsible Header -->
          <button
            @click="toggleTag(tag)"
            class="flex items-center justify-between w-full px-4 py-3 bg-slate-850 hover:bg-slate-800/60 transition-colors text-left"
          >
            <span class="text-sm font-bold text-white tracking-wide flex items-center gap-2">
              <span class="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
              {{ tag }}
            </span>
            <span class="flex items-center gap-2">
              <span class="px-2 py-0.5 text-2xs bg-slate-800 rounded-full text-slate-400">{{ endpoints.length }}</span>
              <svg
                class="w-4 h-4 text-slate-500 transition-transform duration-255"
                :class="expandedTags[tag] ? 'rotate-185' : ''"
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
              </svg>
            </span>
          </button>

          <!-- Submenus -->
          <div
            v-show="expandedTags[tag]"
            class="border-t border-slate-800/40 bg-slate-900/50 divide-y divide-slate-850/60"
          >
            <button
              v-for="ep in endpoints"
              :key="ep.path + ep.method"
              @click="selectEndpoint(ep)"
              class="flex items-center w-full px-3 py-2.5 hover:bg-slate-800/30 text-left transition-all group"
              :class="selectedEndpoint?.path === ep.path && selectedEndpoint?.method === ep.method
                ? 'bg-indigo-950/40 border-l-2 border-indigo-500 text-indigo-300'
                : 'border-l-2 border-transparent text-slate-400 hover:text-slate-200'"
            >
              <!-- Method badge -->
              <span
                class="w-14 text-center px-1.5 py-0.5 rounded text-2xs font-extrabold border shrink-0 tracking-widest uppercase mr-3 font-mono transition-colors"
                :class="getMethodColorClass(ep.method)"
              >
                {{ ep.method }}
              </span>

              <!-- Path -->
              <span class="text-xs truncate font-mono tracking-tight flex-1">
                {{ ep.path }}
              </span>

              <!-- Hover active dot -->
              <span class="w-1.5 h-1.5 rounded-full bg-indigo-500 scale-0 group-hover:scale-100 transition-transform shrink-0 ml-1"></span>
            </button>
          </div>
        </div>
      </div>
    </aside>

    <!-- RIGHT CONTENT AREA -->
    <main class="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-slate-950 transition-colors duration-200">
      
      <!-- TOP BAR -->
      <header class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-4 md-elevation-1 z-10 shrink-0 transition-colors duration-200">
        <!-- Brand / Document Info -->
        <div class="flex items-center gap-4">
          <div v-if="swaggerDoc?.info" class="space-y-1">
            <h2 class="text-base font-bold text-slate-800 dark:text-white tracking-tight">
              {{ swaggerDoc.info.title }}
            </h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1.5">
              <span class="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-2xs font-bold text-slate-600 dark:text-slate-350">v{{ swaggerDoc.info.version }}</span>
              <span v-if="swaggerDoc.basePath" class="text-slate-400 dark:text-slate-500">Base Path: <code class="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-2xs text-slate-700 dark:text-slate-300">{{ swaggerDoc.basePath }}</code></span>
            </p>
          </div>
          <div v-else>
            <h2 class="text-base font-bold text-slate-800 dark:text-white">API Documentation Viewer</h2>
            <p class="text-xs text-slate-500 dark:text-slate-400">Select or load a specification file to begin</p>
          </div>
        </div>

        <!-- Inputs / Actions -->
        <div class="flex items-center gap-3">
          
          <!-- Theme Toggle Button -->
          <button
            @click="toggleTheme"
            class="flex items-center justify-center p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all cursor-pointer"
            title="Toggle theme (Light / Dark)"
          >
            <!-- Moon icon (show in light mode) -->
            <svg v-if="theme === 'light'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
            </svg>
            <!-- Sun icon (show in dark mode) -->
            <svg v-else class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M14 12a2 2 0 11-4 0 2 2 0 014 0z"/>
            </svg>
          </button>

          <!-- Source selection dropdown -->
          <div class="flex items-center rounded-lg bg-slate-100 dark:bg-slate-800 p-1 text-xs border border-slate-200 dark:border-slate-700 transition-colors">
            <button
              @click="swaggerSourceType = 'default'"
              class="px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer"
              :class="swaggerSourceType === 'default'
                ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'"
            >
              Default
            </button>
            <button
              @click="swaggerSourceType = 'url'"
              class="px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer"
              :class="swaggerSourceType === 'url'
                ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'"
            >
              URL
            </button>
            <button
              @click="swaggerSourceType = 'upload'"
              class="px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer"
              :class="swaggerSourceType === 'upload'
                ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'"
            >
              Upload
            </button>
          </div>

          <!-- Dynamic Source Controls -->
          <div v-if="swaggerSourceType === 'url'" class="flex items-center gap-2">
            <input
              v-model="swaggerUrlInput"
              type="text"
              placeholder="https://example.com/swagger.json"
              class="px-3 py-1.5 bg-slate-50 dark:bg-slate-850 border border-slate-300 dark:border-slate-700 rounded-lg text-xs w-48 focus:outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-100"
            />
            <button
              @click="loadSwaggerDoc"
              class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
            >
              Load
            </button>
          </div>

          <div v-if="swaggerSourceType === 'upload'" class="relative">
            <label class="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-750 dark:text-slate-350 transition-colors">
              <svg class="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
              </svg>
              {{ uploadedFileName || 'Choose File' }}
              <input type="file" accept=".json" @change="handleFileUpload" class="hidden" />
            </label>
          </div>

        </div>
      </header>

      <!-- Global Headers Bar (Collapsible panel for premium developer controls) -->
      <section class="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-3 flex flex-wrap gap-4 items-center z-5 transition-colors duration-200">
        <div class="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
          </svg>
          Global Request Headers
        </div>
        
        <!-- Base URL Override -->
        <div class="flex items-center gap-2 text-xs border-r border-slate-200 dark:border-slate-800 pr-4">
          <span class="text-slate-500 dark:text-slate-400">API Host:</span>
          <input
            v-model="apiServerUrl"
            @input="onApiHostInput"
            type="text"
            placeholder="http://localhost:8080"
            class="px-2 py-1 bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded text-xs w-48 font-mono focus:outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-100"
          />
        </div>

        <!-- Render list of Headers -->
        <div class="flex items-center flex-wrap gap-2 flex-1">
          <div
            v-for="(header, idx) in globalHeaders"
            :key="idx"
            class="flex items-center gap-1 bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded px-2 py-0.5 text-xs font-mono group"
          >
            <!-- Checkbox toggle -->
            <input type="checkbox" v-model="header.enabled" class="rounded text-indigo-600 dark:text-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400 w-3 h-3 cursor-pointer" />
            
            <input
              v-model="header.key"
              type="text"
              placeholder="Header-Name"
              class="bg-transparent border-none p-0 w-24 text-2xs focus:outline-none font-bold text-slate-700 dark:text-slate-300"
            />
            <span class="text-slate-400 dark:text-slate-500">:</span>
            <input
              v-model="header.value"
              type="text"
              placeholder="value"
              class="bg-transparent border-none p-0 w-32 text-2xs focus:outline-none text-slate-600 dark:text-slate-400"
            />
            
            <button
              @click="removeGlobalHeader(idx)"
              class="text-slate-400 hover:text-rose-500 transition-colors ml-1"
            >
              <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
              </svg>
            </button>
          </div>

          <button
            @click="addGlobalHeader"
            class="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-850 dark:hover:text-indigo-300 font-bold flex items-center gap-1 transition-colors"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
            </svg>
            Add Header
          </button>
        </div>
      </section>

      <!-- MAIN CONTENT PANEL -->
      <div class="flex-1 overflow-y-auto p-6 space-y-6 relative transition-colors duration-200">
        <!-- Document Loading Spinner -->
        <div v-if="isLoadingDoc" class="absolute inset-0 bg-white/70 dark:bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-20">
          <div class="flex flex-col items-center gap-3">
            <div class="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
            <p class="text-sm font-semibold text-slate-600 dark:text-slate-400">Loading documentation...</p>
          </div>
        </div>

        <!-- Document Loading Error -->
        <div v-if="docError" class="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 text-rose-800 dark:text-rose-300 p-4 rounded-xl flex items-start gap-3">
          <svg class="w-5 h-5 text-rose-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
          </svg>
          <div>
            <h4 class="font-bold text-sm">Error Loading Schema</h4>
            <p class="text-xs text-rose-700 dark:text-rose-400 mt-1">{{ docError }}</p>
            <button @click="loadSwaggerDoc" class="mt-2 text-xs font-bold text-rose-900 dark:text-rose-450 underline hover:no-underline cursor-pointer">Retry</button>
          </div>
        </div>

        <!-- NO SELECTED ENDPOINT: Show general API summary dashboard -->
        <div v-if="!selectedEndpoint && swaggerDoc" class="max-w-4xl mx-auto space-y-6 py-6 animate-fade-in">
          <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 md-elevation-1 space-y-4 transition-colors duration-200">
            <div class="flex items-start justify-between">
              <div>
                <h3 class="text-xl font-extrabold text-slate-800 dark:text-white">{{ swaggerDoc.info.title }}</h3>
                <p class="text-xs text-slate-400 mt-1 font-mono">Specification v{{ swaggerDoc.swagger || '2.0' }}</p>
              </div>
              <span class="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 rounded-full text-xs font-bold text-indigo-700 dark:text-indigo-400 font-mono">
                API Version {{ swaggerDoc.info.version }}
              </span>
            </div>
            
            <p class="text-sm text-slate-600 dark:text-slate-350 leading-relaxed whitespace-pre-wrap">
              {{ swaggerDoc.info.description || 'No description provided.' }}
            </p>

            <div v-if="swaggerDoc.info.contact && Object.keys(swaggerDoc.info.contact).length" class="border-t border-slate-100 pt-4 flex gap-4 text-xs text-slate-500">
              <div v-if="swaggerDoc.info.contact.name">
                <span class="font-semibold text-slate-700">Contact:</span> {{ swaggerDoc.info.contact.name }}
              </div>
              <div v-if="swaggerDoc.info.contact.email">
                <span class="font-semibold text-slate-700">Email:</span>
                <a :href="'mailto:' + swaggerDoc.info.contact.email" class="text-indigo-600 hover:underline ml-0.5">{{ swaggerDoc.info.contact.email }}</a>
              </div>
            </div>
          </div>

          <!-- Statistics Cards -->
          <div v-if="apiStats" class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 md-elevation-1 flex items-center gap-4 transition-colors duration-200">
              <div class="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                </svg>
              </div>
              <div>
                <h4 class="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Total Endpoints</h4>
                <p class="text-2xl font-black text-slate-800 dark:text-white mt-0.5">{{ apiStats.total }}</p>
              </div>
            </div>

            <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 md-elevation-1 flex items-center gap-4 transition-colors duration-200">
              <div class="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
              </div>
              <div>
                <h4 class="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Categories / Tags</h4>
                <p class="text-2xl font-black text-slate-800 dark:text-white mt-0.5">{{ apiStats.tagsCount }}</p>
              </div>
            </div>

            <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 md-elevation-1 flex items-center gap-4 transition-colors duration-200">
              <div class="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
              </div>
              <div class="flex-1">
                <h4 class="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">HTTP Methods Breakdown</h4>
                <div class="flex gap-2 mt-1.5">
                  <span v-for="(cnt, method) in apiStats.methods" :key="method" class="text-2xs font-mono font-bold px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-slate-650 dark:text-slate-350">
                    {{ method }}: {{ cnt }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ENDPOINT DETAILS SCREEN -->
        <div v-if="selectedEndpoint" class="max-w-5xl mx-auto space-y-6">
          
          <!-- Endpoint Header Card -->
          <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 md-elevation-1 space-y-4 transition-colors duration-200">
            <div class="flex flex-wrap items-center gap-3">
              <span class="px-3 py-1 rounded-lg text-xs font-black tracking-widest uppercase" :class="getMethodBadgeClass(selectedEndpoint.method)">
                {{ selectedEndpoint.method }}
              </span>
              <h3 class="text-lg font-mono font-bold text-slate-800 dark:text-white tracking-tight select-all">
                {{ selectedEndpoint.path }}
              </h3>
            </div>
            
            <div class="space-y-1.5">
              <h4 class="text-base font-extrabold text-slate-800 dark:text-white">
                {{ selectedEndpoint.details.summary || 'Endpoint Details' }}
              </h4>
              <p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">
                {{ selectedEndpoint.details.description || 'No detailed description available.' }}
              </p>
            </div>

            <!-- Meta details (produces, consumes) -->
            <div class="flex flex-wrap gap-4 text-2xs text-slate-500 dark:text-slate-450 pt-3 border-t border-slate-100 dark:border-slate-800 font-mono">
              <div v-if="selectedEndpoint.details.consumes?.length">
                <span class="font-bold text-slate-700 dark:text-slate-300">Consumes:</span>
                <code v-for="c in selectedEndpoint.details.consumes" :key="c" class="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1 py-0.5 rounded ml-1">{{ c }}</code>
              </div>
              <div v-if="selectedEndpoint.details.produces?.length">
                <span class="font-bold text-slate-700 dark:text-slate-300">Produces:</span>
                <code v-for="p in selectedEndpoint.details.produces" :key="p" class="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1 py-0.5 rounded ml-1">{{ p }}</code>
              </div>
              <div v-if="selectedEndpoint.details.security?.length">
                <span class="font-bold text-slate-700">Security:</span>
                <span class="text-indigo-600 font-bold ml-1 flex inline-items items-center gap-0.5">
                  <svg class="w-3 h-3 inline" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"/>
                  </svg>
                  Bearer Token
                </span>
              </div>
            </div>
          </div>

          <!-- Layout Split: Left (Parameters Form), Right (Runner Response) -->
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            <!-- Parameters Card (Column span 7) -->
            <div class="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 md-elevation-1 space-y-6 transition-colors duration-200">
              <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <h4 class="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  </svg>
                  Request Parameters
                </h4>
                <button
                  @click="runRequest"
                  :disabled="isSendingRequest"
                  class="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-350 text-white rounded-xl text-xs font-extrabold transition-all shadow-md shadow-indigo-500/10 cursor-pointer"
                >
                  <span v-if="isSendingRequest" class="w-3.5 h-3.5 border-2 border-indigo-200 border-t-white rounded-full animate-spin shrink-0"></span>
                  <svg v-else class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                  </svg>
                  {{ isSendingRequest ? 'Sending...' : 'Try it Out' }}
                </button>
              </div>

              <!-- Parameter Form Fields -->
              <div v-if="selectedEndpoint.details.parameters && selectedEndpoint.details.parameters.length" class="space-y-5">
                
                <div v-for="param in selectedEndpoint.details.parameters" :key="param.name" class="space-y-1.5">
                  
                  <div class="flex items-center justify-between text-xs font-mono">
                    <span class="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      {{ param.name }}
                      <span v-if="param.required" class="text-rose-500 font-extrabold text-base leading-none" title="Required">*</span>
                    </span>
                    <span class="text-slate-400 dark:text-slate-500 text-2xs">
                      {{ param.type || 'object' }} ({{ param.in }})
                    </span>
                  </div>

                  <p v-if="param.description" class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-sans">
                    {{ param.description }}
                  </p>

                  <!-- Dynamic inputs by parameter type -->
                  <div v-if="param.in !== 'body'" class="relative">
                    <select
                      v-if="param.type === 'boolean'"
                      v-model="paramValues[param.name]"
                      class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono focus:outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-100"
                    >
                      <option :value="true">true</option>
                      <option :value="false">false</option>
                    </select>
                    
                    <input
                      v-else
                      v-model="paramValues[param.name]"
                      :type="param.type === 'integer' || param.type === 'number' ? 'number' : 'text'"
                      :placeholder="param.required ? 'Value is required' : 'Optional'"
                      class="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono focus:outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-100"
                      :class="param.required && !paramValues[param.name] ? 'border-amber-200 dark:border-amber-900/60' : ''"
                    />
                  </div>

                  <!-- Body Payload JSON editor -->
                  <div v-else class="space-y-2">
                    <div class="flex items-center justify-between">
                      <span class="text-2xs text-indigo-600 dark:text-indigo-400 font-bold font-mono">Raw Application/JSON Payload</span>
                      <button
                        @click="() => {
                          const mockObj = generateMockFromSchema(param.schema, swaggerDoc.definitions)
                          bodyParamText = mockObj ? JSON.stringify(mockObj, null, 2) : '{}'
                        }"
                        class="text-2xs text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 underline font-bold cursor-pointer"
                      >
                        Reset Mock JSON
                      </button>
                    </div>
                    <textarea
                      v-model="bodyParamText"
                      rows="10"
                      class="w-full p-3 bg-slate-900 dark:bg-slate-950 border border-slate-800 dark:border-slate-800 rounded-xl font-mono text-xs text-slate-100 focus:outline-none focus:border-indigo-500 leading-normal"
                    ></textarea>
                  </div>
                </div>

              </div>
              <div v-else class="text-center py-6 text-slate-400 dark:text-slate-550 text-xs leading-normal">
                This endpoint does not require any parameters.
              </div>
            </div>

            <!-- Runner Results Card (Column span 5) -->
            <div class="lg:col-span-5 space-y-6">
              
              <!-- Response Block -->
              <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 md-elevation-1 space-y-4 min-h-[300px] flex flex-col transition-colors duration-200">
                <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
                  <h4 class="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                    <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    Execution Response
                  </h4>
                  
                  <span v-if="requestResponse" class="font-mono text-2xs font-bold text-slate-400 flex items-center gap-2">
                    <!-- Status Badge -->
                    <span
                      class="px-2 py-0.5 rounded text-2xs font-extrabold tracking-wider"
                      :class="requestResponse.status >= 200 && requestResponse.status < 300
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'"
                    >
                      {{ requestResponse.status }} {{ requestResponse.statusText }}
                    </span>
                    <span>{{ requestResponse.timeMs }}ms</span>
                  </span>
                </div>

                <!-- Loader state -->
                <div v-if="isSendingRequest" class="flex-1 flex flex-col items-center justify-center py-12 gap-3 text-slate-500 dark:text-slate-400">
                  <div class="w-8 h-8 border-3 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                  <span class="text-xs font-medium">Executing HTTP call...</span>
                </div>

                <!-- No request sent yet -->
                <div v-else-if="!requestResponse" class="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400 dark:text-slate-500 space-y-2 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-xl my-4">
                  <svg class="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                  </svg>
                  <div>
                    <h5 class="font-bold text-xs text-slate-600 dark:text-slate-300">Pending Execution</h5>
                    <p class="text-2xs text-slate-400 dark:text-slate-500 mt-1 max-w-[200px]">Click "Try it Out" to execute this API endpoint locally.</p>
                  </div>
                </div>

                <!-- Response Renders -->
                <div v-else class="flex-1 flex flex-col overflow-hidden min-h-0 space-y-3">
                  
                  <!-- Response navigation tabs -->
                  <div class="flex border-b border-slate-100 dark:border-slate-800 text-xs shrink-0 font-mono">
                    <button
                      @click="responseTab = 'body'"
                      class="px-3 py-1.5 border-b-2 font-bold transition-all cursor-pointer"
                      :class="responseTab === 'body' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-350'"
                    >
                      Body
                    </button>
                    <button
                      @click="responseTab = 'headers'"
                      class="px-3 py-1.5 border-b-2 font-bold transition-all cursor-pointer"
                      :class="responseTab === 'headers' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-350'"
                    >
                      Headers
                    </button>
                    <button
                      @click="responseTab = 'curl'"
                      class="px-3 py-1.5 border-b-2 font-bold transition-all"
                      :class="responseTab === 'curl' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'"
                    >
                      CURL
                    </button>
                  </div>

                  <!-- Tab Panels -->
                  <div class="flex-1 overflow-auto rounded-xl relative min-h-0">
                    
                    <!-- Copy to clipboard button -->
                    <button
                      v-if="requestResponse.body || requestResponse.curlCommand"
                      @click="copyToClipboard(responseTab === 'body' ? requestResponse.body : (responseTab === 'headers' ? JSON.stringify(requestResponse.headers, null, 2) : requestResponse.curlCommand || ''))"
                      class="absolute top-2 right-2 p-1.5 bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white rounded-md transition-all text-xs flex items-center gap-1 cursor-pointer z-5"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
                      </svg>
                      {{ copySuccess ? 'Copied!' : 'Copy' }}
                    </button>

                    <!-- Error Alert -->
                    <div v-if="requestResponse.error" class="bg-rose-50 border border-rose-100 text-rose-800 p-4 rounded-xl space-y-1">
                      <p class="text-xs font-bold font-sans">Request Failed (TypeError)</p>
                      <p class="text-2xs text-rose-600 font-mono leading-normal">{{ requestResponse.error }}</p>
                      <p class="text-2xs text-slate-500 font-sans mt-3 border-t border-rose-200/50 pt-2 leading-relaxed">
                        <span class="font-bold text-slate-600">Tip:</span> Ensure the API Server ({{ apiServerUrl }}) is running and configures CORS headers correctly. Alternatively, check your network connection.
                      </p>
                    </div>

                    <!-- JSON Body Rendering -->
                    <div v-else-if="responseTab === 'body'" class="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl overflow-auto h-full text-2xs md:text-xs">
                      <div v-if="tryParseJson(requestResponse.body)">
                        <JsonFoldViewer :value="tryParseJson(requestResponse.body)" />
                      </div>
                      <pre v-else class="text-2xs leading-normal select-text font-mono whitespace-pre-wrap text-slate-700 dark:text-slate-350"><code>{{ requestResponse.body || 'No Response Body content' }}</code></pre>
                    </div>

                    <!-- Headers Rendering -->
                    <div v-else-if="responseTab === 'headers'" class="p-3 bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1 overflow-auto h-full text-2xs font-mono text-slate-700 dark:text-slate-300">
                      <div v-for="(v, k) in requestResponse.headers" :key="k" class="flex py-0.5 border-b border-slate-100 dark:border-slate-800 last:border-0 select-text">
                        <span class="font-bold text-slate-700 dark:text-slate-300 mr-2 shrink-0">{{ k }}:</span>
                        <span class="text-slate-600 dark:text-slate-400 break-all">{{ v }}</span>
                      </div>
                    </div>

                    <!-- Curl Code Block -->
                    <pre v-else-if="responseTab === 'curl'" class="p-4 bg-slate-900 text-slate-200 text-2xs font-mono overflow-auto rounded-xl select-text leading-normal"><code>{{ requestResponse.curlCommand }}</code></pre>

                  </div>
                </div>

              </div>

            </div>

          </div>

          <!-- RESPONSE SCHEMAS SECTION (Swagger Definitions Explorer) -->
          <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 md-elevation-1 space-y-4 transition-colors duration-200">
            <h4 class="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"/>
              </svg>
              Response Specifications
            </h4>

            <div class="space-y-4">
              <div
                v-for="(respDetails, statusCode) in selectedEndpoint.details.responses"
                :key="statusCode"
                class="border border-slate-100 dark:border-slate-800 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-850/30"
              >
                <!-- Status code badge + description -->
                <div class="flex items-center gap-3">
                  <span
                    class="px-2 py-0.5 rounded text-2xs font-mono font-black"
                    :class="parseInt(String(statusCode)) >= 200 && parseInt(String(statusCode)) < 300
                      ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-350'
                      : 'bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-350'"
                  >
                    {{ statusCode }}
                  </span>
                  <span class="text-xs font-bold text-slate-800 dark:text-white">{{ respDetails.description || 'Response details' }}</span>
                </div>

                <!-- JSON expected response structure representation -->
                <div v-if="respDetails.schema" class="mt-3 bg-white dark:bg-slate-905 border border-slate-100 dark:border-slate-800 rounded-xl p-4">
                  <div class="text-2xs font-bold text-slate-500 dark:text-slate-450 uppercase tracking-wider mb-2.5 font-mono">Response Payload Model Schema</div>
                  <div class="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-850 rounded-lg overflow-x-auto">
                    <JsonFoldViewer :value="getResponseSchemaObj(respDetails.schema)" />
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>

    </main>

  </div>
</template>

<style scoped>
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-fade-in {
  animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.rotate-185 {
  transform: rotate(180deg);
}

.bg-slate-850 {
  background-color: #1e293b;
}

.bg-slate-950 {
  background-color: #020617;
}

.text-2xs {
  font-size: 0.65rem;
}

.text-3xs {
  font-size: 0.55rem;
}

.z-5 {
  z-index: 5;
}
</style>
