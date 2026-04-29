<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { checkInteractions as checkDrugInteractions } from './api'

// State
const drugInput = ref('')
const inputRef = ref(null)
const loading = ref(false)
const result = ref(null)
const errorMessage = ref('')
const searchHistory = ref([])
const drugTags = ref([])

// Autocomplete / suggestions
const showSuggestions = ref(false)
const filteredSuggestions = ref([])

// Common drug suggestions for quick selection (brand + generic)
const suggestedDrugs = [
  // Generic names
  'Aspirin', 'Ibuprofen', 'Acetaminophen', 'Warfarin',
  'Metformin', 'Omeprazole', 'Atorvastatin', 'Lisinopril',
  'Amoxicillin', 'Ciprofloxacin', 'Prednisone', 'Albuterol',
  // International brand names
  'Panadol', 'Tylenol', 'Advil', 'Motrin', 'Aleve',
  'Lipitor', 'Crestor', 'Zocor', 'Plavix', 'Eliquis',
  'Xarelto', 'Pradaxa', 'Januvia', 'Humalog', 'Lantus',
  'Synthroid', 'Lexapro', 'Zoloft', 'Prozac', 'Zyrtec',
  'Norvasc', 'Cozaar', 'Diovan', 'Cipro', 'Keflex',
  // Local/common brand names (Egypt + global)
  'Augmentin', 'Curam', 'Megamox', 'Adol', 'Rivo',
  'Brufen', 'Cataflam', 'Voltaren', 'Zantac', 'Nexium',
  'Losec', 'Tramal', 'Flagyl', 'ZYTEC', 'Costi',
  // Additional statin & lipid brands
  'Ator', 'Lipanthyl', 'Lescol', 'Pravachol', 'Mevacor'
]

// Load history on mount
onMounted(() => {
  const saved = localStorage.getItem('drugcheck-history')
  if (saved) {
    try {
      searchHistory.value = JSON.parse(saved).slice(0, 10)
    } catch { /* ignore */ }
  }
  inputRef.value?.focus()
})

// Save search history
const saveHistory = (drugs) => {
  const key = drugs.join(', ')
  if (!searchHistory.value.includes(key)) {
    searchHistory.value.unshift(key)
    searchHistory.value = searchHistory.value.slice(0, 10)
    localStorage.setItem('drugcheck-history', JSON.stringify(searchHistory.value))
  }
}

// Add drug to tags
const addDrug = () => {
  const name = drugInput.value.trim()
  if (!name) return

  if (drugTags.value.includes(name)) {
    errorMessage.value = `"${name}" is already in the list`
    setTimeout(() => errorMessage.value = '', 2000)
    drugInput.value = ''
    showSuggestions.value = false
    return
  }

  drugTags.value.push(name)
  drugInput.value = ''
  showSuggestions.value = false
  inputRef.value?.focus()
}

// Remove drug from tags
const removeDrug = (index) => {
  drugTags.value.splice(index, 1)
}

// Handle Enter key
const handleKeydown = (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    addDrug()
  } else if (e.key === 'Backspace' && !drugInput.value && drugTags.value.length > 0) {
    // Remove last tag on backspace when input is empty
    drugTags.value.pop()
  }
}

// Filter suggestions
const filterSuggestions = (query) => {
  if (!query || query.length < 2) {
    filteredSuggestions.value = []
    return
  }
  const lower = query.toLowerCase()
  filteredSuggestions.value = suggestedDrugs
    .filter(d => d.toLowerCase().includes(lower) && !drugTags.value.includes(d))
    .slice(0, 8)
}

// Watch input for suggestions
watch(drugInput, (val) => {
  filterSuggestions(val)
  showSuggestions.value = val.length >= 2
})

// Quick add from suggestions
const quickAdd = (drug) => {
  drugInput.value = drug
  addDrug()
}

// Schedule hiding suggestions (used on blur with delay)
const scheduleHideSuggestions = () => {
  setTimeout(() => {
    showSuggestions.value = false
  }, 200)
}

// Clear all tags
const clearAll = () => {
  drugTags.value = []
  errorMessage.value = ''
}

// Main check function
const checkInteractions = async () => {
  if (drugTags.value.length < 2) {
    errorMessage.value = 'Add at least 2 medications to check interactions'
    return
  }

  if (loading.value) return

  loading.value = true
  errorMessage.value = ''
  result.value = null

  try {
    const data = await checkDrugInteractions(drugTags.value)
    saveHistory(drugTags.value)

    if (data.normalized.length < 2 && data.errors?.length) {
      errorMessage.value = data.errors[0].error
      return
    }

    result.value = data
  } catch (error) {
    console.error('Check failed:', error)
    errorMessage.value = 'Failed to check interactions. Please try again.'
  } finally {
    loading.value = false
  }
}

// Clear input
const clearInput = () => {
  drugInput.value = ''
  showSuggestions.value = false
  inputRef.value?.focus()
}

// Remove from history
const removeFromHistory = (idx, e) => {
  e.stopPropagation()
  searchHistory.value.splice(idx, 1)
  localStorage.setItem('drugcheck-history', JSON.stringify(searchHistory.value))
}

// Severity helpers
const severityConfig = {
  major: {
    label: 'Major',
    bg: 'bg-red-50',
    border: 'border-red-500',
    text: 'text-red-700',
    badge: 'bg-red-500',
    icon: '⚠️',
    description: 'Avoid this combination. May cause serious harm.'
  },
  moderate: {
    label: 'Moderate',
    bg: 'bg-amber-50',
    border: 'border-amber-500',
    text: 'text-amber-700',
    badge: 'bg-amber-500',
    icon: '⚡',
    description: 'Use with caution. Monitor for side effects.'
  },
  minor: {
    label: 'Minor',
    bg: 'bg-blue-50',
    border: 'border-blue-500',
    text: 'text-blue-700',
    badge: 'bg-blue-500',
    icon: 'ℹ️',
    description: 'Minor interaction. May require monitoring.'
  }
}

const getSeverity = (sev) => severityConfig[sev] || severityConfig.moderate
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-sky-50 via-white to-indigo-50">
    <!-- Background decoration -->
    <div class="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div class="absolute -top-40 -right-40 w-80 h-80 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
      <div class="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
      <div class="absolute top-40 left-40 w-80 h-80 bg-pink-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
    </div>

    <div class="relative max-w-5xl mx-auto px-4 py-6 md:py-16">
      <!-- Header -->
      <header class="text-center mb-8 md:mb-12 animate-fade-in">
        <div class="inline-flex items-center justify-center w-16 h-16 md:w-20 md:h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl mb-4 md:mb-6 shadow-xl shadow-blue-200/50">
          <svg class="w-8 h-8 md:w-10 md:h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 48 48" aria-hidden="true">
            <rect x="8" y="16" width="32" height="16" rx="8" fill="currentColor" opacity="0.2"/>
            <rect x="12" y="20" width="20" height="8" rx="2" fill="white"/>
            <path d="M36 24 L44 24 M40 20 L40 28" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"/>
          </svg>
        </div>
        <h1 class="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-2 md:mb-3 tracking-tight" style="font-family: var(--font-display);">
          DrugCheck
        </h1>
        <p class="text-base md:text-lg text-gray-600 max-w-2xl mx-auto">
          Instantly check potential drug interactions with FDA-approved data
        </p>
      </header>

      <!-- Main Card -->
      <main class="glass rounded-3xl shadow-2xl p-4 md:p-6 animate-slide-up stagger-1">
        <!-- Input Section -->
        <section class="mb-8">
          <label class="block text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wider">
            Your Medications
          </label>

          <!-- Drug Tags Display + Add Input -->
          <div class="space-y-3">
            <!-- Tags container -->
            <div v-if="drugTags.length > 0" class="flex flex-wrap gap-2 mb-3">
              <transition-group name="tag">
                <div
                  v-for="(drug, idx) in drugTags"
                  :key="idx"
                  class="group relative inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 hover:scale-105"
                >
                  <span class="text-sm font-semibold text-blue-800">{{ drug }}</span>
                  <button
                    @click="removeDrug(idx)"
                    class="w-5 h-5 rounded-full bg-blue-200 hover:bg-red-500 hover:text-white text-blue-600 flex items-center justify-center transition-all duration-200 hover:rotate-90"
                    title="Remove {{ drug }}"
                  >
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </transition-group>
            </div>

            <!-- Input field + Add button -->
            <div class="flex flex-col sm:flex-row gap-3">
              <div class="flex-1 relative">
                <div class="relative">
                  <input
                    ref="inputRef"
                    v-model="drugInput"
                    @keydown="handleKeydown"
                    @focus="showSuggestions = drugInput.length >= 2"
                    @blur="scheduleHideSuggestions"
                    type="text"
                    placeholder="Type a medication name..."
                    class="w-full px-5 py-3 sm:px-5 sm:py-4 text-base sm:text-lg bg-white border-2 border-gray-200 rounded-2xl focus:ring-0 focus:border-blue-500 outline-none transition-all placeholder:text-gray-400 focus:shadow-lg hover:border-blue-300"
                    :disabled="loading"
                    autocomplete="off"
                  />

                  <!-- Clear button -->
                  <button
                    v-if="drugInput"
                    @click="clearInput"
                    class="absolute right-12 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
                    title="Clear input"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>

                  <!-- Add button -->
                  <button
                    @click="addDrug"
                    :disabled="!drugInput.trim()"
                    class="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold text-sm hover:shadow-lg hover:shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none transition-all hover:scale-105 active:scale-95 flex items-center gap-1"
                    title="Add medication"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 4v16m8-8H4" />
                    </svg>
                    <span class="hidden sm:inline">Add</span>
                  </button>
                </div>

                <!-- Suggestions dropdown -->
                <transition
                  enter-active-class="transition-all duration-200 ease-out"
                  enter-from-class="opacity-0 scale-95 -translate-y-2"
                  enter-to-class="opacity-100 scale-100 translate-y-0"
                  leave-active-class="transition-all duration-150 ease-in"
                  leave-from-class="opacity-100 scale-100 translate-y-0"
                  leave-to-class="opacity-0 scale-95 -translate-y-2"
                >
                  <div
                    v-if="showSuggestions && filteredSuggestions.length > 0"
                    class="absolute z-20 w-full mt-2 bg-white border-2 border-blue-100 rounded-2xl shadow-xl overflow-hidden"
                  >
                    <div
                      v-for="drug in filteredSuggestions"
                      :key="drug"
                      @mousedown="quickAdd(drug)"
                      class="px-4 py-3 hover:bg-blue-50 cursor-pointer transition-colors flex items-center gap-2 border-b border-gray-100 last:border-b-0"
                    >
                      <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      <span class="text-gray-700">{{ drug }}</span>
                    </div>
                  </div>
                </transition>
              </div>

              <!-- Main Check button -->
              <button
                @click="checkInteractions"
                :disabled="loading || drugTags.length < 2"
                class="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-center sm:text-left rounded-2xl transition-all hover:shadow-lg hover:shadow-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none flex items-center justify-center sm:justify-start gap-2 sm:gap-3 whitespace-nowrap transform hover:scale-105 active:scale-95"
              >
                <svg v-if="loading" class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <span class="block">{{ loading ? 'Checking...' : 'Check Interactions' }}</span>
              </button>
            </div>

            <!-- Clear all button (when tags exist) -->
            <div v-if="drugTags.length > 0" class="flex justify-end">
              <button
                @click="clearAll"
                class="text-sm text-gray-500 hover:text-red-600 transition-colors flex items-center gap-1"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Clear all
              </button>
            </div>
          </div>

          <!-- Hint -->
          <p class="mt-2 text-sm text-gray-500 flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Add medications individually. Brand names (like Tylenol) are automatically converted.
          </p>
        </section>

        <!-- Error Message -->
        <transition
          enter-active-class="transition-all duration-300 ease-out"
          enter-from-class="opacity-0 -translate-y-4"
          enter-to-class="opacity-100 translate-y-0"
        >
          <div v-if="errorMessage" class="mb-8 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 animate-shake">
            <svg class="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p class="text-red-700">{{ errorMessage }}</p>
          </div>
        </transition>

        <!-- Results Section -->
        <div v-if="result" class="space-y-8 animate-fade-in">
          <!-- Summary Cards -->
          <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            <!-- Drugs Checked -->
            <div class="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-2xl p-4 sm:p-6 border border-blue-100 hover:shadow-lg transition-shadow">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs sm:text-sm font-medium text-blue-600 uppercase tracking-wide">Drugs Checked</span>
                <svg class="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </div>
              <p class="text-2xl sm:text-3xl font-bold text-blue-900">{{ result.normalized.length }}</p>
              <p class="text-xs sm:text-sm text-blue-700 mt-1 truncate">
                {{ result.normalized.map(n => n.name).join(', ') }}
              </p>
            </div>

            <!-- Interactions Found -->
            <div class="bg-gradient-to-br from-amber-50 to-orange-50/50 rounded-2xl p-4 sm:p-6 border border-amber-100 hover:shadow-lg transition-shadow">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs sm:text-sm font-medium text-amber-600 uppercase tracking-wide">Interactions</span>
                <svg class="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p class="text-2xl sm:text-3xl font-bold text-amber-900">{{ result.interactions.length }}</p>
              <p class="text-xs sm:text-sm text-amber-700 mt-1">
                {{ result.interactions.length === 0 ? 'No interactions detected' : 'Potential interactions found' }}
              </p>
            </div>

            <!-- Status -->
            <div class="bg-gradient-to-br from-emerald-50 to-green-50/50 rounded-2xl p-4 sm:p-6 border border-emerald-100 hover:shadow-lg transition-shadow">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs sm:text-sm font-medium text-emerald-600 uppercase tracking-wide">Status</span>
                <svg class="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p class="text-xl sm:text-2xl font-bold text-emerald-900">
                {{ result.interactions.length === 0 ? '✓ Safe' : 'Review Needed' }}
              </p>
              <p class="text-xs sm:text-sm text-emerald-700 mt-1">
                {{ result.interactions.length === 0 ? 'No known interactions' : 'Consult healthcare provider' }}
              </p>
            </div>
          </section>

          <!-- Warnings Section -->
          <div v-if="result.errors?.length" class="p-4 bg-amber-50 border border-amber-200 rounded-2xl">
            <div class="flex items-start gap-3">
              <svg class="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p class="text-sm font-medium text-amber-800 mb-1">Note:</p>
                <ul class="text-sm text-amber-700 space-y-1">
                  <li v-for="(err, i) in result.errors" :key="i">
                    "{{ err.name }}" — {{ err.error }}
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <!-- Interaction Cards -->
          <section v-if="result.interactions.length > 0">
            <h2 class="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <svg class="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Interaction Details
            </h2>

            <div class="space-y-4">
              <div
                v-for="(interaction, idx) in result.interactions"
                :key="idx"
                :class="['rounded-2xl overflow-hidden border-l-4 shadow-lg transition-all hover:shadow-xl hover:-translate-y-1', getSeverity(interaction.severity).border]"
              >
                <div class="bg-white p-6">
                  <!-- Severity Badge -->
                  <div class="flex items-start justify-between mb-4">
                    <span
                      :class="['inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white shadow-md', getSeverity(interaction.severity).badge]"
                    >
                      <span>{{ getSeverity(interaction.severity).icon }}</span>
                      {{ getSeverity(interaction.severity).label }} Interaction
                    </span>
                  </div>

                  <!-- Drug Pair Visualization -->
                  <div class="flex flex-col items-center gap-4 mb-5">
                    <div class="flex flex-col items-center">
                      <div class="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center text-lg font-bold text-blue-800 border-2 border-blue-200 shadow-inner">
                        {{ interaction.drugs[0].charAt(0).toUpperCase() }}
                      </div>
                      <span class="mt-2 text-sm font-medium text-gray-700 text-center">{{ interaction.drugs[0] }}</span>
                    </div>
                    <div class="flex-1 flex items-center justify-center">
                      <svg class="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                      </svg>
                    </div>
                    <div class="flex flex-col items-center">
                      <div class="w-16 h-16 rounded-xl bg-gradient-to-br from-purple-50 to-pink-100 flex items-center justify-center text-lg font-bold text-purple-800 border-2 border-purple-200 shadow-inner">
                        {{ interaction.drugs[1].charAt(0).toUpperCase() }}
                      </div>
                      <span class="mt-2 text-sm font-medium text-gray-700 text-center">{{ interaction.drugs[1] }}</span>
                    </div>
                  </div>

                  <!-- Description -->
                  <div :class="['rounded-xl p-4 border', getSeverity(interaction.severity).bg, getSeverity(interaction.severity).border]">
                    <p class="text-sm font-semibold mb-2" :class="getSeverity(interaction.severity).text">
                      What this means
                    </p>
                    <p class="text-gray-700 leading-relaxed text-sm md:text-base">
                      {{ interaction.description.length > 500
                         ? interaction.description.substring(0, 500) + '...'
                         : interaction.description }}
                    </p>
                    <div class="mt-3 pt-3 border-t border-current opacity-20">
                      <p class="text-xs italic opacity-80">Source: FDA Structured Product Labeling</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- No Interactions -->
          <div v-else-if="result.interactions.length === 0 && result.normalized.length >= 2" class="text-center py-12">
            <div class="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-emerald-100 to-green-100 rounded-full mb-6 animate-pulse shadow-lg">
              <svg class="w-10 h-10 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 class="text-2xl font-bold text-gray-900 mb-2">No Interactions Detected</h3>
            <p class="text-gray-600 max-w-md mx-auto">
              Good news! No known interactions were found between these medications based on FDA drug labels.
            </p>
          </div>
        </div>

        <!-- History Section (when no results) -->
        <transition
          enter-active-class="transition-all duration-300 ease-out"
          enter-from-class="opacity-0 scale-95"
          enter-to-class="opacity-100 scale-100"
        >
          <div v-if="!result && searchHistory.length > 0" class="mt-8 pt-6 border-t border-gray-200">
            <p class="text-sm font-semibold text-gray-600 mb-3">Recent Searches</p>
            <div class="flex flex-wrap gap-2">
               <button
                 v-for="(entry, idx) in searchHistory"
                 :key="idx"
                 @click="() => { drugTags.value = entry.split(', ').map(d => d.trim()); }"
                 class="group px-4 py-2 bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-xl text-sm text-gray-600 hover:text-blue-600 transition-all flex items-center gap-2 hover:shadow-md"
               >
                <svg class="w-4 h-4 text-gray-400 group-hover:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {{ entry }}
              </button>
            </div>
          </div>
        </transition>

        <!-- Footer -->
        <footer class="mt-12 pt-8 border-t border-gray-200 text-center">
          <p class="text-sm text-gray-500">
            ⚠️ This tool provides information from FDA drug labels for informational purposes only.
            Always consult a healthcare professional for medical advice.
          </p>
          <p class="text-xs text-gray-400 mt-2">
            Data sourced from <a href="https://rxnav.nlm.nih.gov/" class="text-blue-600 hover:underline" target="_blank" rel="noopener">RxNav</a> and
            <a href="https://open.fda.gov/" class="text-blue-600 hover:underline" target="_blank" rel="noopener">openFDA</a>
          </p>
        </footer>
      </main>
    </div>
  </div>
</template>

<style>
/* Custom animations */
@keyframes blob {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  33% { transform: translate(30px, -50px) rotate(120deg); }
  66% { transform: translate(-20px, 20px) rotate(240deg); }
}

.animate-blob {
  animation: blob 7s infinite;
}

.animation-delay-2000 {
  animation-delay: 2s;
}

.animation-delay-4000 {
  animation-delay: 4s;
}

/* Tag transitions */
.tag-enter-active,
.tag-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.tag-enter-from {
  opacity: 0;
  transform: scale(0.8) translateY(-10px);
}

.tag-leave-to {
  opacity: 0;
  transform: scale(0.8) translateX(20px);
}

/* Shake animation for errors */
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
  20%, 40%, 60%, 80% { transform: translateX(4px); }
}

.animate-shake {
  animation: shake 0.5s ease-in-out;
}

/* Glassmorphism */
.glass {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10pxpx);
}

/* Smooth transitions for all interactive elements */
button, input, a {
  transition: all 0.2s ease;
}

/* Focus ring improvement */
input:focus {
  ring: 2px;
  ring-color: rgb(59 130 246 / 0.5);
}
</style>