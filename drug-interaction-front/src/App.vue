<script setup>
import { ref, computed, onMounted } from 'vue'
import { checkInteractions as checkDrugInteractions } from './api'

// State
const drugInput = ref('')
const inputRef = ref(null)
const loading = ref(false)
const result = ref(null)
const errorMessage = ref('')
const searchHistory = ref([])

// Common drug suggestions for quick selection
const suggestedDrugs = [
  'Aspirin', 'Ibuprofen', 'Acetaminophen', 'Warfarin',
  'Metformin', 'Omeprazole', 'Atorvastatin', 'Lisinopril'
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

// Main check function
const checkInteractions = async () => {
  if (!drugInput.value.trim()) {
    errorMessage.value = 'Please enter at least two drug names'
    return
  }

  const drugs = drugInput.value
    .split(',')
    .map(d => d.trim())
    .filter(d => d.length > 0)

  if (drugs.length < 2) {
    errorMessage.value = 'Enter at least 2 drugs to check interactions'
    return
  }

  if (loading.value) return

  loading.value = true
  errorMessage.value = ''
  result.value = null

  try {
    const data = await checkDrugInteractions(drugs)
    saveHistory(drugs)

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

// Quick fill from history or suggestions
const fillInput = (text) => {
  drugInput.value = text
  inputRef.value?.focus()
}

// Clear input
const clearInput = () => {
  drugInput.value = ''
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

    <div class="relative max-w-5xl mx-auto px-4 py-8 md:py-16">
      <!-- Header -->
      <header class="text-center mb-12 md:mb-16 animate-fade-in">
        <div class="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl mb-6 shadow-xl shadow-blue-200/50">
          <svg class="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 48 48" aria-hidden="true">
            <rect x="8" y="16" width="32" height="16" rx="8" fill="currentColor" opacity="0.2"/>
            <rect x="12" y="20" width="20" height="8" rx="2" fill="white"/>
            <path d="M36 24 L44 24 M40 20 L40 28" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"/>
          </svg>
        </div>
        <h1 class="text-4xl md:text-5xl font-bold text-gray-900 mb-3 tracking-tight" style="font-family: var(--font-display);">
          DrugCheck
        </h1>
        <p class="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto">
          Instantly check potential drug interactions with FDA-approved data
        </p>
      </header>

      <!-- Main Card -->
      <main class="glass rounded-3xl shadow-2xl p-6 md:p-10 animate-slide-up stagger-1">
        <!-- Input Section -->
        <section class="mb-8">
          <label for="drug-input" class="block text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wider">
            Enter Medications (comma-separated)
          </label>

          <!-- Suggestions Bar -->
          <div v-if="!result && suggestedDrugs.length && !drugInput" class="flex flex-wrap gap-2 mb-4">
            <span class="text-sm text-gray-500 py-1">Try:</span>
            <button
              v-for="drug in suggestedDrugs"
              :key="drug"
              @click="fillInput(drug)"
              class="px-3 py-1 bg-white border border-gray-200 rounded-full text-sm text-gray-700 hover:border-blue-300 hover:text-blue-600 transition-all hover:shadow-md"
            >
              {{ drug }}
            </button>
          </div>

          <!-- History Bar -->
          <div v-if="searchHistory.value.length && !result" class="flex flex-wrap gap-2 items-center mb-4">
            <span class="text-sm text-gray-500 py-1">Recent:</span>
            <button
              v-for="(entry, idx) in searchHistory.value"
              :key="idx"
              @click="fillInput(entry)"
              class="group px-3 py-1 bg-gray-50 rounded-full text-sm text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-all flex items-center gap-1"
            >
              {{ entry }}
              <button
                @click="removeFromHistory(idx, $event)"
                class="w-4 h-4 rounded-full bg-gray-200 group-hover:bg-red-100 text-gray-400 group-hover:text-red-500 flex items-center justify-center transition-colors"
                aria-label="Remove from history"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </button>
          </div>

          <!-- Input Field -->
          <div class="relative">
            <div class="flex gap-3">
              <div class="flex-1 relative">
                <input
                  ref="inputRef"
                  id="drug-input"
                  v-model="drugInput"
                  @keydown.enter.prevent="checkInteractions"
                  type="text"
                  placeholder="e.g., warfarin, aspirin, ibuprofen"
                  class="w-full px-5 py-4 text-base bg-white border-2 border-gray-200 rounded-2xl focus:ring-0 focus:border-blue-500 outline-none transition-all placeholder:text-gray-400 focus:shadow-lg"
                  :disabled="loading"
                  aria-describedby="input-hint"
                />
                <button
                  v-if="drugInput"
                  @click="clearInput"
                  class="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
                  aria-label="Clear input"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <button
                @click="checkInteractions"
                :disabled="loading"
                class="px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-2xl transition-all hover:shadow-lg hover:shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none flex items-center gap-2 whitespace-nowrap"
              >
                <svg v-if="loading" class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>{{ loading ? 'Checking...' : 'Check Interactions' }}</span>
              </button>
            </div>
            <p id="input-hint" class="mt-2 text-sm text-gray-500">
              Enter two or more medication names separated by commas
            </p>
          </div>
        </section>

        <!-- Error Message -->
        <div v-if="errorMessage" class="mb-8 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 animate-fade-in">
          <svg class="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p class="text-red-700">{{ errorMessage }}</p>
        </div>

        <!-- Results Section -->
        <div v-if="result" class="space-y-8 animate-fade-in">
          <!-- Summary Cards -->
          <section class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <!-- Drugs Checked -->
            <div class="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-2xl p-6 border border-blue-100">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-medium text-blue-600 uppercase tracking-wide">Drugs Checked</span>
                <svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </div>
              <p class="text-3xl font-bold text-blue-900">{{ result.normalized.length }}</p>
              <p class="text-sm text-blue-700 mt-1 truncate">
                {{ result.normalized.map(n => n.name).join(', ') }}
              </p>
            </div>

            <!-- Interactions Found -->
            <div class="bg-gradient-to-br from-amber-50 to-orange-50/50 rounded-2xl p-6 border border-amber-100">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-medium text-amber-600 uppercase tracking-wide">Interactions</span>
                <svg class="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p class="text-3xl font-bold text-amber-900">{{ result.interactions.length }}</p>
              <p class="text-sm text-amber-700 mt-1">
                {{ result.interactions.length === 0 ? 'No interactions detected' : 'Potential interactions found' }}
              </p>
            </div>

            <!-- Status -->
            <div class="bg-gradient-to-br from-emerald-50 to-green-50/50 rounded-2xl p-6 border border-emerald-100">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-medium text-emerald-600 uppercase tracking-wide">Status</span>
                <svg class="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p class="text-xl font-bold text-emerald-900">
                {{ result.interactions.length === 0 ? '✓ Safe' : 'Review Needed' }}
              </p>
              <p class="text-sm text-emerald-700 mt-1">
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
              <div v-for="(interaction, idx) in result.interactions" :key="idx"
                   :class="['rounded-2xl overflow-hidden border-l-4 shadow-lg transition-all hover:shadow-xl', getSeverity(interaction.severity).border]">
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
                  <div class="flex items-center gap-4 mb-5">
                    <div class="flex flex-col items-center">
                      <div class="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center text-lg font-bold text-blue-800 border-2 border-blue-200">
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
                      <div class="w-16 h-16 rounded-xl bg-gradient-to-br from-purple-50 to-pink-100 flex items-center justify-center text-lg font-bold text-purple-800 border-2 border-purple-200">
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
            <div class="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-emerald-100 to-green-100 rounded-full mb-6 animate-pulse">
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

    <!-- Animating background blobs -->
    <style>
      @keyframes blob {
        0%, 100% { transform: translate(0, 0) scale(1); }
        33% { transform: translate(30px, -50px) scale(1.1); }
        66% { transform: translate(-20px, 20px) scale(0.9); }
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
    </style>
  </div>
</template>
