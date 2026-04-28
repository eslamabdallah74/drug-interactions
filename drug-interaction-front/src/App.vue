<script setup>
import { ref } from 'vue'
import { checkInteractions as checkDrugInteractions } from './api'

const drugInput = ref('warfarin, aspirin')
const loading = ref(false)
const result = ref(null)
const errorMessage = ref('')

const checkInteractions = async () => {
  if (!drugInput.value.trim()) {
    errorMessage.value = 'Please enter at least two drug names separated by commas'
    return
  }

  const drugs = drugInput.value.split(',').map(d => d.trim()).filter(d => d.length > 0)

  if (drugs.length < 2) {
    errorMessage.value = 'Please enter at least two drug names'
    return
  }

  loading.value = true
  errorMessage.value = ''
  result.value = null

  try {
    console.log('Starting interaction check for drugs:', drugs);
    const data = await checkDrugInteractions(drugs)
    console.log('API result:', data)

    if (data.interactions.length === 0 && data.normalized.length < 2) {
      errorMessage.value = data.errors?.[0]?.error || 'Failed to check interactions'
      console.log('Errors:', data.errors)
      return
    }

    result.value = data
  } catch (error) {
    errorMessage.value = 'Failed to check interactions. Please try again.'
    console.error('Error:', error)
  } finally {
    loading.value = false
  }
}

const getSeverityColor = (severity) => {
  const colors = {
    major: '#dc3545',
    moderate: '#fd7e14',
    minor: '#ffc107'
  }
  return colors[severity] || '#6c757d'
}

const getSeverityLabel = (severity) => {
  const labels = {
    major: '⚠️  Major',
    moderate: '⚠️ Moderate',
    minor: 'ℹ️  Minor'
  }
  return labels[severity] || severity
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
    <div class="max-w-3xl mx-auto">
      <!-- Header -->
      <div class="text-center mb-8">
         <div class="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg">
           <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 32 32">
             <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10h4v5H5zM12 10h4v5h-4zM19 10h4v5h-4zM5 20h4v5H5zM12 20h4v5h-4zM19 20h4v5h-4z"/>
           </svg>
         </div>
         <h1 class="text-3xl font-bold text-gray-900 mb-2">DrugCheck</h1>
         <p class="text-gray-600">Check for potential drug interactions</p>
      </div>

      <!-- Input Section -->
      <div class="bg-white rounded-2xl shadow-lg p-6 mb-6">
        <label class="block text-sm font-medium text-gray-700 mb-2">
          Enter drug names (separated by commas)
        </label>
        <div class="flex gap-4">
          <input
            v-model="drugInput"
            @keyup.enter="checkInteractions"
            type="text"
            placeholder="e.g., aspirin, ibuprofen"
            class="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
          />
          <button
            @click="checkInteractions"
            :disabled="loading"
            class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg hover:shadow-xl"
          >
            <svg v-if="loading" class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {{ loading ? 'Checking...' : 'Check Interactions' }}
          </button>
        </div>

        <div class="mt-4 text-sm text-gray-500">
          <p class="font-medium text-gray-600 mb-1">Examples:</p>
          <div class="flex flex-wrap gap-2">
            <button @click="drugInput='warfarin, aspirin'" class="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-sm transition">warfarin, aspirin</button>
            <button @click="drugInput='aspirin, ibuprofen'" class="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-sm transition">aspirin, ibuprofen</button>
            <button @click="drugInput='aspirin, ibuprofen, warfarin'" class="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-sm transition">3+ drugs</button>
          </div>
        </div>

        <div v-if="errorMessage" class="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p class="text-red-700 font-medium flex items-center gap-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            {{ errorMessage }}
          </p>
        </div>
      </div>

      <!-- Results -->
      <div v-if="result" class="space-y-6">
        <!-- Summary -->
        <div class="bg-white rounded-2xl shadow-lg p-6">
          <h2 class="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
            </svg>
            Check Results
          </h2>
          
          <div class="grid grid-cols-2 gap-4 mb-4">
            <div class="bg-blue-50 rounded-xl p-4">
              <p class="text-sm text-blue-600 font-medium">Drugs Checked</p>
              <p class="text-2xl font-bold text-blue-900">{{ result.normalized.length }}</p>
              <p class="text-sm text-blue-700 mt-1">{{ result.normalized.map(n => n.name).join(', ') }}</p>
            </div>
            <div class="bg-amber-50 rounded-xl p-4">
              <p class="text-sm text-amber-600 font-medium">Interactions Found</p>
              <p class="text-2xl font-bold text-amber-900">{{ result.interactions.length }}</p>
            </div>
          </div>

          <div v-if="result.errors?.length" class="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
            <p class="text-sm text-yellow-700 font-medium mb-2">⚠️ Warning:</p>
            <p class="text-sm text-yellow-700" v-for="err in result.errors" :key="err.name">
              "{{ err.name }}" - {{ err.error }}
            </p>
          </div>
        </div>

        <!-- Interaction Cards -->
        <div v-if="result.interactions.length > 0">
          <h2 class="text-xl font-semibold text-gray-900 mb-4">Interaction Details</h2>
          <div class="space-y-4">
            <div 
              v-for="(interaction, index) in result.interactions" 
              :key="index"
              class="bg-white rounded-2xl shadow-lg border-l-4 overflow-hidden"
              :style="{ borderLeftColor: getSeverityColor(interaction.severity) }"
            >
              <div class="p-6">
                <div class="flex items-start justify-between mb-3">
                  <span 
                    class="px-3 py-1 rounded-full text-sm font-semibold text-white"
                    :style="{ backgroundColor: getSeverityColor(interaction.severity) }"
                  >
                    {{ getSeverityLabel(interaction.severity) }}
                  </span>
                </div>

                <div class="flex items-center gap-3 mb-4">
                  <span class="px-3 py-1.5 bg-gray-100 rounded-full text-sm font-medium text-gray-700">
                    {{ interaction.drugs[0] }}
                  </span>
                  <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                  </svg>
                  <span class="px-3 py-1.5 bg-gray-100 rounded-full text-sm font-medium text-gray-700">
                    {{ interaction.drugs[1] }}
                  </span>
                </div>

                <div class="bg-gray-50 rounded-xl p-4 mb-4">
                  <p class="text-sm text-gray-500 font-medium mb-2">Source</p>
                  <p class="text-sm text-gray-700">{{ interaction.source }}</p>
                </div>

                <div>
                  <p class="text-sm text-gray-500 font-medium mb-2">Details</p>
                  <p class="text-gray-800 leading-relaxed text-sm">
                    {{ interaction.description.substring(0, 500) }}
                    <span v-if="interaction.description.length > 500">...</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="bg-white rounded-2xl shadow-lg p-8 text-center">
          <svg class="w-16 h-16 text-green-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <h3 class="text-xl font-semibold text-gray-900 mb-2">No Interactions Detected</h3>
          <p class="text-gray-600">Good news! No known interactions were found between these medications.</p>
        </div>

        <div class="text-center text-xs text-gray-400 py-4">
          <p>Disclaimer: This tool provides information from FDA drug labels. Always consult a healthcare professional for medical advice.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* All styles inlined via Tailwind-like classes */
</style>
