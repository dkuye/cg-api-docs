<script setup lang="ts">
import { ref, computed } from 'vue'

const props = withDefaults(
  defineProps<{
    value: any
    isLast?: boolean
    depth?: number
  }>(),
  {
    isLast: true,
    depth: 0,
  }
)

const isExpanded = ref(true)

function toggleExpand() {
  isExpanded.value = !isExpanded.value
}

const isObject = computed(() => {
  return props.value !== null && typeof props.value === 'object' && !Array.isArray(props.value)
})

const isArray = computed(() => {
  return props.value !== null && Array.isArray(props.value)
})

const isPrimitive = computed(() => {
  return !isObject.value && !isArray.value
})

const objectKeys = computed(() => {
  if (isObject.value) {
    return Object.keys(props.value)
  }
  return []
})

// Format primitive values for display
const formattedValue = computed(() => {
  if (props.value === null) return 'null'
  if (typeof props.value === 'string') return `"${props.value}"`
  return String(props.value)
})

// Get colors for primitive values matching standard JSON theme
const primitiveClass = computed(() => {
  if (props.value === null) return 'text-slate-400 dark:text-slate-500 font-bold'
  if (typeof props.value === 'string') return 'text-emerald-600 dark:text-emerald-400 font-semibold'
  if (typeof props.value === 'number') return 'text-blue-600 dark:text-blue-400 font-bold'
  if (typeof props.value === 'boolean') return 'text-amber-600 dark:text-amber-400 font-bold'
  return 'text-slate-700 dark:text-slate-300'
})
</script>

<template>
  <div class="font-mono text-2xs md:text-xs leading-relaxed select-text inline-block align-top">
    <!-- Primitive Type -->
    <span v-if="isPrimitive" :class="primitiveClass">
      {{ formattedValue }}<span v-if="!isLast" class="text-slate-400 dark:text-slate-600 font-sans mr-0.5">,</span>
    </span>

    <!-- Object / Array Type -->
    <span v-else>
      <!-- Collapsible header -->
      <span class="inline-flex items-center cursor-pointer select-none group" @click.stop="toggleExpand">
        <!-- Expand/Collapse Chevron icon -->
        <svg
          class="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300 transition-transform duration-150 transform mr-0.5"
          :class="isExpanded ? 'rotate-90' : 'rotate-0'"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" />
        </svg>

        <!-- Opening Brace/Bracket -->
        <span class="text-slate-700 dark:text-slate-300 font-bold">{{ isObject ? '{' : '[' }}</span>
        
        <!-- Collapsed placeholder summary -->
        <span v-if="!isExpanded" class="mx-1.5 px-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 rounded text-3xs font-semibold py-0.2">
          {{ isObject ? `... ${objectKeys.length} keys` : `... ${value.length} items` }}
        </span>
        
        <span v-if="!isExpanded" class="text-slate-700 dark:text-slate-300 font-bold">
          {{ isObject ? '}' : ']' }}<span v-if="!isLast" class="text-slate-400 dark:text-slate-600 font-sans">,</span>
        </span>
      </span>

      <!-- Expanded children -->
      <div v-show="isExpanded" class="pl-4 border-l border-slate-200/50 dark:border-slate-800 ml-1.5 mt-0.5 space-y-0.5">
        <!-- If Object -->
        <template v-if="isObject">
          <div v-for="(key, index) in objectKeys" :key="key" class="flex items-start flex-wrap">
            <span class="text-indigo-600 dark:text-indigo-400 font-semibold">"{{ key }}"</span>
            <span class="text-slate-400 dark:text-slate-600 mx-1 font-sans">:</span>
            <JsonFoldViewer
              :value="value[key]"
              :isLast="index === objectKeys.length - 1"
              :depth="depth + 1"
            />
          </div>
        </template>

        <!-- If Array -->
        <template v-else-if="isArray">
          <div v-for="(item, index) in value" :key="index" class="flex items-start">
            <JsonFoldViewer
              :value="item"
              :isLast="index === value.length - 1"
              :depth="depth + 1"
            />
          </div>
        </template>
      </div>

      <!-- Closing Brace/Bracket when expanded -->
      <div v-show="isExpanded" class="text-slate-700 dark:text-slate-300 font-bold ml-1.5 mt-0.5">
        {{ isObject ? '}' : ']' }}<span v-if="!isLast" class="text-slate-400 dark:text-slate-600 font-sans">,</span>
      </div>
    </span>
  </div>
</template>
