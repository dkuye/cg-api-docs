<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import {
  resolveSchemaToTree,
  generateMockFromSchema,
  type SchemaField
} from '../utils/swaggerParser'

// --- State ---
const swaggerDoc = ref<any>(null)
const isLoadingDoc = ref<boolean>(false)
const docError = ref<string>('')
const swaggerSourceType = ref<'default' | 'url' | 'upload'>('default')
const swaggerUrlInput = ref<string>('/swagger.json')
const uploadedFileName = ref<string>('')

// Config & Headers
const apiServerUrl = ref<string>('')
const globalHeaders = ref<{ key: string; value: string; enabled: boolean }[]>([
  { key: 'Authorization', value: 'Bearer ', enabled: false },
  { key: 'Content-Type', value: 'application/json', enabled: true }
])

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
  
  // Set default API Server URL from host and basePath
  const scheme = data.schemes && data.schemes[0] ? `${data.schemes[0]}://` : 'http://'
  const host = data.host || window.location.host
  const basePath = data.basePath || ''
  apiServerUrl.value = `${scheme}${host}${basePath}`

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
    groups[ep.tag].push(ep)
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
  <div class="flex h-screen w-screen overflow-hidden bg-slate-50 font-sans">
    
    <!-- LEFT SIDEBAR -->
    <aside class="flex flex-col w-80 md:w-96 border-r border-slate-200 bg-slate-900 text-slate-300 select-none overflow-hidden shrink-0">
      
      <!-- Logo / Title -->
      <div class="flex items-center gap-3 px-6 py-5 bg-slate-950 border-b border-slate-800">
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
    <main class="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      
      <!-- TOP BAR -->
      <header class="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 md-elevation-1 z-10 shrink-0">
        <!-- Brand / Document Info -->
        <div class="flex items-center gap-4">
          <div v-if="swaggerDoc?.info" class="space-y-1">
            <h2 class="text-base font-bold text-slate-800 tracking-tight">
              {{ swaggerDoc.info.title }}
            </h2>
            <p class="text-xs text-slate-500 font-mono flex items-center gap-1.5">
              <span class="px-1.5 py-0.5 bg-slate-100 rounded text-2xs font-bold text-slate-600">v{{ swaggerDoc.info.version }}</span>
              <span v-if="swaggerDoc.basePath" class="text-slate-400">Base Path: <code class="bg-slate-100 px-1 py-0.5 rounded text-2xs">{{ swaggerDoc.basePath }}</code></span>
            </p>
          </div>
          <div v-else>
            <h2 class="text-base font-bold text-slate-800">API Documentation Viewer</h2>
            <p class="text-xs text-slate-500">Select or load a specification file to begin</p>
          </div>
        </div>

        <!-- Inputs / Actions -->
        <div class="flex items-center gap-3">
          
          <!-- Source selection dropdown -->
          <div class="flex items-center rounded-lg bg-slate-100 p-1 text-xs border border-slate-200">
            <button
              @click="swaggerSourceType = 'default'"
              class="px-3 py-1.5 rounded-md font-semibold transition-all"
              :class="swaggerSourceType === 'default' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'"
            >
              Default
            </button>
            <button
              @click="swaggerSourceType = 'url'"
              class="px-3 py-1.5 rounded-md font-semibold transition-all"
              :class="swaggerSourceType === 'url' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'"
            >
              URL
            </button>
            <button
              @click="swaggerSourceType = 'upload'"
              class="px-3 py-1.5 rounded-md font-semibold transition-all"
              :class="swaggerSourceType === 'upload' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'"
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
              class="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs w-48 focus:outline-none focus:border-indigo-500"
            />
            <button
              @click="loadSwaggerDoc"
              class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors"
            >
              Load
            </button>
          </div>

          <div v-if="swaggerSourceType === 'upload'" class="relative">
            <label class="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold cursor-pointer hover:bg-slate-50 transition-colors">
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
      <section class="bg-white border-b border-slate-200 px-6 py-3 flex flex-wrap gap-4 items-center z-5">
        <div class="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
          <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
          </svg>
          Global Request Headers
        </div>
        
        <!-- Base URL Override -->
        <div class="flex items-center gap-2 text-xs border-r border-slate-200 pr-4">
          <span class="text-slate-500">API Host:</span>
          <input
            v-model="apiServerUrl"
            type="text"
            placeholder="http://localhost:8080"
            class="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs w-48 font-mono focus:outline-none focus:border-indigo-500"
          />
        </div>

        <!-- Render list of Headers -->
        <div class="flex items-center flex-wrap gap-2 flex-1">
          <div
            v-for="(header, idx) in globalHeaders"
            :key="idx"
            class="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded px-2 py-0.5 text-xs font-mono group"
          >
            <!-- Checkbox toggle -->
            <input type="checkbox" v-model="header.enabled" class="rounded text-indigo-600 focus:ring-indigo-500 w-3 h-3 cursor-pointer" />
            
            <input
              v-model="header.key"
              type="text"
              placeholder="Header-Name"
              class="bg-transparent border-none p-0 w-24 text-2xs focus:outline-none font-bold text-slate-700"
            />
            <span class="text-slate-400">:</span>
            <input
              v-model="header.value"
              type="text"
              placeholder="value"
              class="bg-transparent border-none p-0 w-32 text-2xs focus:outline-none text-slate-600"
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
            class="text-xs text-indigo-600 hover:text-indigo-850 font-bold flex items-center gap-1 transition-colors"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
            </svg>
            Add Header
          </button>
        </div>
      </section>

      <!-- MAIN CONTENT PANEL -->
      <div class="flex-1 overflow-y-auto p-6 space-y-6 relative">
        <!-- Document Loading Spinner -->
        <div v-if="isLoadingDoc" class="absolute inset-0 bg-white/70 backdrop-blur-xs flex items-center justify-center z-20">
          <div class="flex flex-col items-center gap-3">
            <div class="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
            <p class="text-sm font-semibold text-slate-600">Loading documentation...</p>
          </div>
        </div>

        <!-- Document Loading Error -->
        <div v-if="docError" class="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex items-start gap-3">
          <svg class="w-5 h-5 text-rose-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
          </svg>
          <div>
            <h4 class="font-bold text-sm">Error Loading Schema</h4>
            <p class="text-xs text-rose-700 mt-1">{{ docError }}</p>
            <button @click="loadSwaggerDoc" class="mt-2 text-xs font-bold text-rose-900 underline hover:no-underline">Retry</button>
          </div>
        </div>

        <!-- NO SELECTED ENDPOINT: Show general API summary dashboard -->
        <div v-if="!selectedEndpoint && swaggerDoc" class="max-w-4xl mx-auto space-y-6 py-6 animate-fade-in">
          <div class="bg-white rounded-2xl border border-slate-200 p-6 md-elevation-1 space-y-4">
            <div class="flex items-start justify-between">
              <div>
                <h3 class="text-xl font-extrabold text-slate-800">{{ swaggerDoc.info.title }}</h3>
                <p class="text-xs text-slate-400 mt-1 font-mono">Specification v{{ swaggerDoc.swagger || '2.0' }}</p>
              </div>
              <span class="px-2.5 py-1 bg-indigo-50 border border-indigo-100 rounded-full text-xs font-bold text-indigo-700 font-mono">
                API Version {{ swaggerDoc.info.version }}
              </span>
            </div>
            
            <p class="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
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
            <div class="bg-white rounded-2xl border border-slate-200 p-5 md-elevation-1 flex items-center gap-4">
              <div class="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                </svg>
              </div>
              <div>
                <h4 class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Endpoints</h4>
                <p class="text-2xl font-black text-slate-800 mt-0.5">{{ apiStats.total }}</p>
              </div>
            </div>

            <div class="bg-white rounded-2xl border border-slate-200 p-5 md-elevation-1 flex items-center gap-4">
              <div class="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
              </div>
              <div>
                <h4 class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Categories / Tags</h4>
                <p class="text-2xl font-black text-slate-800 mt-0.5">{{ apiStats.tagsCount }}</p>
              </div>
            </div>

            <div class="bg-white rounded-2xl border border-slate-200 p-5 md-elevation-1 flex items-center gap-4">
              <div class="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
              </div>
              <div class="flex-1">
                <h4 class="text-xs font-semibold text-slate-400 uppercase tracking-wider">HTTP Methods Breakdown</h4>
                <div class="flex gap-2 mt-1.5">
                  <span v-for="(cnt, method) in apiStats.methods" :key="method" class="text-2xs font-mono font-bold px-1.5 py-0.5 bg-slate-100 rounded text-slate-600">
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
          <div class="bg-white rounded-2xl border border-slate-200 p-6 md-elevation-1 space-y-4">
            <div class="flex flex-wrap items-center gap-3">
              <span class="px-3 py-1 rounded-lg text-xs font-black tracking-widest uppercase" :class="getMethodBadgeClass(selectedEndpoint.method)">
                {{ selectedEndpoint.method }}
              </span>
              <h3 class="text-lg font-mono font-bold text-slate-800 tracking-tight select-all">
                {{ selectedEndpoint.path }}
              </h3>
            </div>
            
            <div class="space-y-1.5">
              <h4 class="text-base font-extrabold text-slate-800">
                {{ selectedEndpoint.details.summary || 'Endpoint Details' }}
              </h4>
              <p class="text-sm text-slate-500 leading-relaxed whitespace-pre-wrap">
                {{ selectedEndpoint.details.description || 'No detailed description available.' }}
              </p>
            </div>

            <!-- Meta details (produces, consumes) -->
            <div class="flex flex-wrap gap-4 text-2xs text-slate-500 pt-3 border-t border-slate-100 font-mono">
              <div v-if="selectedEndpoint.details.consumes?.length">
                <span class="font-bold text-slate-700">Consumes:</span>
                <code v-for="c in selectedEndpoint.details.consumes" :key="c" class="bg-slate-100 px-1 py-0.5 rounded ml-1">{{ c }}</code>
              </div>
              <div v-if="selectedEndpoint.details.produces?.length">
                <span class="font-bold text-slate-700">Produces:</span>
                <code v-for="p in selectedEndpoint.details.produces" :key="p" class="bg-slate-100 px-1 py-0.5 rounded ml-1">{{ p }}</code>
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
            <div class="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 md-elevation-1 space-y-6">
              <div class="flex items-center justify-between pb-3 border-b border-slate-100">
                <h4 class="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  </svg>
                  Request Parameters
                </h4>
                <button
                  @click="runRequest"
                  :disabled="isSendingRequest"
                  class="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-extrabold transition-all shadow-md shadow-indigo-500/10 cursor-pointer"
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
                    <span class="font-bold text-slate-700 flex items-center gap-1.5">
                      {{ param.name }}
                      <span v-if="param.required" class="text-rose-500 font-extrabold text-base leading-none" title="Required">*</span>
                    </span>
                    <span class="text-slate-400 text-2xs">
                      {{ param.type || 'object' }} ({{ param.in }})
                    </span>
                  </div>

                  <p v-if="param.description" class="text-xs text-slate-500 leading-relaxed font-sans">
                    {{ param.description }}
                  </p>

                  <!-- Dynamic inputs by parameter type -->
                  <div v-if="param.in !== 'body'" class="relative">
                    <select
                      v-if="param.type === 'boolean'"
                      v-model="paramValues[param.name]"
                      class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:border-indigo-500"
                    >
                      <option :value="true">true</option>
                      <option :value="false">false</option>
                    </select>
                    
                    <input
                      v-else
                      v-model="paramValues[param.name]"
                      :type="param.type === 'integer' || param.type === 'number' ? 'number' : 'text'"
                      :placeholder="param.required ? 'Value is required' : 'Optional'"
                      class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:border-indigo-500"
                      :class="param.required && !paramValues[param.name] ? 'border-amber-200' : ''"
                    />
                  </div>

                  <!-- Body Payload JSON editor -->
                  <div v-else class="space-y-2">
                    <div class="flex items-center justify-between">
                      <span class="text-2xs text-indigo-600 font-bold font-mono">Raw Application/JSON Payload</span>
                      <button
                        @click="() => {
                          const mockObj = generateMockFromSchema(param.schema, swaggerDoc.definitions)
                          bodyParamText = mockObj ? JSON.stringify(mockObj, null, 2) : '{}'
                        }"
                        class="text-2xs text-slate-400 hover:text-indigo-600 underline font-bold"
                      >
                        Reset Mock JSON
                      </button>
                    </div>
                    <textarea
                      v-model="bodyParamText"
                      rows="10"
                      class="w-full p-3 bg-slate-900 border border-slate-800 rounded-xl font-mono text-xs text-slate-100 focus:outline-none focus:border-indigo-500 leading-normal"
                    ></textarea>
                  </div>
                </div>

              </div>
              <div v-else class="text-center py-6 text-slate-400 text-xs leading-normal">
                This endpoint does not require any parameters.
              </div>
            </div>

            <!-- Runner Results Card (Column span 5) -->
            <div class="lg:col-span-5 space-y-6">
              
              <!-- Response Block -->
              <div class="bg-white rounded-2xl border border-slate-200 p-6 md-elevation-1 space-y-4 min-h-[300px] flex flex-col">
                <div class="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
                  <h4 class="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
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
                <div v-if="isSendingRequest" class="flex-1 flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
                  <div class="w-8 h-8 border-3 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                  <span class="text-xs font-medium">Executing HTTP call...</span>
                </div>

                <!-- No request sent yet -->
                <div v-else-if="!requestResponse" class="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400 space-y-2 border-2 border-dashed border-slate-100 rounded-xl my-4">
                  <svg class="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                  </svg>
                  <div>
                    <h5 class="font-bold text-xs text-slate-600">Pending Execution</h5>
                    <p class="text-2xs text-slate-400 mt-1 max-w-[200px]">Click "Try it Out" to execute this API endpoint locally.</p>
                  </div>
                </div>

                <!-- Response Renders -->
                <div v-else class="flex-1 flex flex-col overflow-hidden min-h-0 space-y-3">
                  
                  <!-- Response navigation tabs -->
                  <div class="flex border-b border-slate-100 text-xs shrink-0 font-mono">
                    <button
                      @click="responseTab = 'body'"
                      class="px-3 py-1.5 border-b-2 font-bold transition-all"
                      :class="responseTab === 'body' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'"
                    >
                      Body
                    </button>
                    <button
                      @click="responseTab = 'headers'"
                      class="px-3 py-1.5 border-b-2 font-bold transition-all"
                      :class="responseTab === 'headers' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'"
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
                    <pre v-else-if="responseTab === 'body'" class="p-4 bg-slate-950 text-emerald-400 text-2xs leading-normal select-text font-mono h-full overflow-auto rounded-xl"><code>{{ requestResponse.body || 'No Response Body content' }}</code></pre>

                    <!-- Headers Rendering -->
                    <div v-else-if="responseTab === 'headers'" class="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 overflow-auto h-full text-2xs font-mono">
                      <div v-for="(v, k) in requestResponse.headers" :key="k" class="flex py-0.5 border-b border-slate-100 last:border-0 select-text">
                        <span class="font-bold text-slate-700 mr-2 shrink-0">{{ k }}:</span>
                        <span class="text-slate-600 break-all">{{ v }}</span>
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
          <div class="bg-white rounded-2xl border border-slate-200 p-6 md-elevation-1 space-y-4">
            <h4 class="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"/>
              </svg>
              Response Specifications
            </h4>

            <div class="space-y-4">
              <div
                v-for="(respDetails, statusCode) in selectedEndpoint.details.responses"
                :key="statusCode"
                class="border border-slate-100 rounded-xl p-4 bg-slate-50/50"
              >
                <!-- Status code badge + description -->
                <div class="flex items-center gap-3">
                  <span
                    class="px-2 py-0.5 rounded text-2xs font-mono font-black"
                    :class="parseInt(statusCode) >= 200 && parseInt(statusCode) < 300
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'"
                  >
                    {{ statusCode }}
                  </span>
                  <span class="text-xs font-bold text-slate-800">{{ respDetails.description || 'Response details' }}</span>
                </div>

                <!-- Tree view schema for the response -->
                <div v-if="respDetails.schema" class="mt-3 bg-white border border-slate-100 rounded-xl p-3">
                  <div class="text-2xs font-bold text-slate-500 uppercase tracking-wider mb-2 font-mono">Response Payload Model Schema</div>
                  <div class="overflow-x-auto text-xs font-mono text-slate-800">
                    <!-- Recursive rendering of tree schema -->
                    <table class="w-full text-left border-collapse">
                      <thead>
                        <tr class="border-b border-slate-100 text-2xs text-slate-400 font-bold uppercase font-mono">
                          <th class="py-1.5 px-2">Field Name</th>
                          <th class="py-1.5 px-2">Type</th>
                          <th class="py-1.5 px-2">Required</th>
                          <th class="py-1.5 px-2">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        <!-- Display fields list -->
                        <tr
                          v-for="field in [getResponseSchemaTree(respDetails.schema)]"
                          :key="field?.name"
                          class="align-top border-b last:border-0 border-slate-50 text-2xs"
                        >
                          <td colspan="4" class="py-2">
                            <!-- Recursive Component inline rendering -->
                            <div class="space-y-2">
                              <!-- Object Type root details -->
                              <div v-if="field?.properties" class="pl-2 space-y-1">
                                <div class="font-bold text-indigo-600 select-all" v-if="field.ref">
                                  Definition: {{ field.ref }}
                                </div>
                                <div v-for="prop in field.properties" :key="prop.name" class="flex flex-col py-1.5 border-b border-slate-50 last:border-0 pl-1">
                                  <div class="flex items-center flex-wrap gap-2 text-2xs">
                                    <span class="font-bold text-slate-700 select-all">{{ prop.name }}</span>
                                    <span class="px-1 py-0.2 bg-slate-100 text-slate-500 rounded text-3xs font-bold lowercase">{{ prop.type }}</span>
                                    <span v-if="prop.required" class="text-rose-500 font-bold font-sans">*</span>
                                    <span class="text-slate-400 text-3xs flex-1 truncate max-w-sm select-all">{{ prop.description }}</span>
                                  </div>
                                  
                                  <!-- Recursive properties visualization for objects inside objects -->
                                  <div v-if="prop.properties" class="pl-4 mt-1 border-l border-slate-200 space-y-1">
                                    <div v-for="subProp in prop.properties" :key="subProp.name" class="flex items-center gap-2 py-0.5 text-2xs">
                                      <span class="font-semibold text-slate-600 select-all">{{ subProp.name }}</span>
                                      <span class="px-1 py-0.1 bg-slate-50 text-slate-400 rounded text-3xs">{{ subProp.type }}</span>
                                      <span v-if="subProp.required" class="text-rose-500 font-bold">*</span>
                                      <span class="text-slate-400 text-3xs truncate select-all">{{ subProp.description }}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <!-- Array Type root details -->
                              <div v-else-if="field?.items" class="pl-2 space-y-1">
                                <div class="text-slate-500 font-bold">Array of items:</div>
                                <div class="pl-3 border-l border-slate-200">
                                  <div v-if="field.items.properties">
                                    <div class="font-bold text-indigo-600 text-2xs" v-if="field.items.ref">Definition: {{ field.items.ref }}</div>
                                    <div v-for="prop in field.items.properties" :key="prop.name" class="flex items-center gap-2 py-1 text-2xs border-b border-slate-50 last:border-0">
                                      <span class="font-bold text-slate-700 select-all">{{ prop.name }}</span>
                                      <span class="px-1 py-0.2 bg-slate-100 text-slate-500 rounded text-3xs font-bold lowercase">{{ prop.type }}</span>
                                      <span v-if="prop.required" class="text-rose-500 font-bold">*</span>
                                      <span class="text-slate-400 text-3xs select-all">{{ prop.description }}</span>
                                    </div>
                                  </div>
                                  <div v-else>
                                    <span class="font-bold text-slate-700 select-all">{{ field.items.name }}</span>
                                    <span class="px-1 py-0.2 bg-slate-100 text-slate-500 rounded text-3xs lowercase font-bold ml-2">{{ field.items.type }}</span>
                                    <span class="text-slate-400 text-3xs ml-2 select-all">{{ field.items.description }}</span>
                                  </div>
                                </div>
                              </div>

                              <!-- Primitive Type root details -->
                              <div v-else class="pl-2 flex items-center gap-2">
                                <span class="font-semibold text-slate-600">Value Type:</span>
                                <span class="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600 uppercase font-bold">{{ field?.type }}</span>
                                <span class="text-slate-400 select-all">{{ field?.description }}</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
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
