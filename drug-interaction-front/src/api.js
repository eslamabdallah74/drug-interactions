import manualIngredientsData from '../drug-crawler/data/manual_ingredients.json';

// API endpoints
const RXNAV_BASE = 'https://rxnav.nlm.nih.gov/REST';
const OPENFDA_BASE = 'https://api.fda.gov/drug/label.json';
const RXNAV_RXCUI_BASE = 'https://rxnav.nlm.nih.gov/REST/rxcui';

// Optional: Create .env file with VITE_OPENFDA_API_KEY=your_key for higher rate limits
const OPENFDA_API_KEY = import.meta.env.VITE_OPENFDA_API_KEY || '';

// In-memory caches
const drugCache = {};
const interactionCache = {};
const activeIngredientCache = {};

// Local drug database state
let localDrugDB = null;
let localDBLoading = false;
let localDBLoadPromise = null;

// Manual ingredient mapping from drug-crawler data (normalized to lowercase)
const manualIngredientMap = Object.fromEntries(
  Object.entries(manualIngredientsData).map(([brand, ingredients]) => [
    brand.toLowerCase(),
    ingredients.map(ing => ing.toLowerCase())
  ])
);

// Helper: Build openFDA API key parameter
const getApiKeyParam = () => OPENFDA_API_KEY ? `&api_key=${OPENFDA_API_KEY}` : '';

// Fallback: Search local drug database for brand name
const searchLocalDB = (drugName) => {
  if (!localDrugDB) return null;
  const normalized = drugName.toLowerCase().trim();

  // Exact brand name match
  const exactMatch = localDrugDB.find(d =>
    d.brand_name?.toLowerCase() === normalized ||
    d.id?.toLowerCase() === normalized
  );
  if (exactMatch) return exactMatch;

  // Partial brand name match
  const partialMatch = localDrugDB.find(d =>
    d.brand_name?.toLowerCase().includes(normalized) ||
    d.id?.toLowerCase().includes(normalized)
  );
  return partialMatch || null;
};

// Get RxCUI from local database
const getRxcuiFromLocalDB = (drugName) => {
  const record = searchLocalDB(drugName);
  if (record && record.ingredients && record.ingredients.length > 0) {
    // Return first ingredient's RxCUI if available
    const rxcui = record.ingredients[0]?.rxcui;
    if (rxcui) return rxcui;
  }
  return null;
};

// Preload local database in the background
const loadLocalDrugDB = async () => {
  if (localDrugDB) return localDrugDB;
  if (localDBLoading) await localDBLoadPromise;

  if (localDrugDB) return localDrugDB;

  localDBLoading = true;
  localDBLoadPromise = (async () => {
    try {
      // Use Vite's base URL for correct path in both dev and production
      const baseUrl = import.meta.env.BASE_URL || '/';
      const response = await fetch(`${baseUrl}data/drugs.json`);
      if (!response.ok) throw new Error(`Failed to load: ${response.status}`);
      const data = await response.json();
      localDrugDB = data.drugs || [];
      console.log(`[LOCAL DB] Loaded ${localDrugDB.length} drugs from local data`);
      return localDrugDB;
    } catch (error) {
      console.error('[LOCAL DB] Failed to load drugs.json:', error.message);
      localDrugDB = [];
      return localDrugDB;
    }
  })();

  await localDBLoadPromise;
  localDBLoading = false;
  return localDrugDB;
};

const preloadLocalDB = () => {
  loadLocalDrugDB().catch(err => {
    console.error('[LOCAL DB] Preload failed:', err.message);
  });
};

// Start preloading immediately
preloadLocalDB();

// Get active ingredients from local database
const getActiveIngredientsFromLocalDB = async (drugName) => {
  await loadLocalDrugDB(); // Ensure DB is loaded

  const normalized = drugName.toLowerCase().trim();
  const record = searchLocalDB(drugName);

  if (record && record.ingredients) {
    return record.ingredients
      .map(ing => ing.name?.toLowerCase().trim())
      .filter(name => name && name.length > 0);
  }
  return [];
};

const getRxcui = async (drugName) => {
  const trimmedDrug = drugName.trim();
  const cacheKey = trimmedDrug.toLowerCase();

  if (drugCache[cacheKey]) {
    console.log(`[CACHE HIT] Drug "${trimmedDrug}" -> RxCUI: ${drugCache[cacheKey]}`);
    return { name: trimmedDrug, rxcui: drugCache[cacheKey], cached: true };
  }

  try {
    console.log(`[API CALL] Fetching RxCUI for "${trimmedDrug}"`);
    const response = await fetch(`${RXNAV_BASE}/approximateTerm.json?term=${encodeURIComponent(trimmedDrug)}&maxEntries=1`);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`RxNav API error ${response.status}: ${errorText.substring(0, 100)}`);
    }

    const data = await response.json();
    const candidates = data?.approximateGroup?.candidate || [];

    if (candidates.length === 0) {
      // Fallback 1: Try openFDA to find drug info and extract RxCUI
      const fdaRxcui = await getRxcuiFromOpenFDA(trimmedDrug);
      if (fdaRxcui) {
        drugCache[cacheKey] = fdaRxcui;
        console.log(`[API RESULT] Drug "${trimmedDrug}" -> RxCUI (via openFDA): ${fdaRxcui}`);
        return { name: trimmedDrug, rxcui: fdaRxcui, cached: false };
      }

      // Fallback 2: Try RxNav exact name lookup
      const exactRxcui = await getRxcuiExact(trimmedDrug);
      if (exactRxcui) {
        drugCache[cacheKey] = exactRxcui;
        console.log(`[API RESULT] Drug "${trimmedDrug}" -> RxCUI (exact match): ${exactRxcui}`);
        return { name: trimmedDrug, rxcui: exactRxcui, cached: false };
      }

      // Fallback 3: Ensure local DB is loaded, then try local database
      await loadLocalDrugDB();
      const localRecord = searchLocalDB(trimmedDrug);
      if (localRecord) {
        // Use synthetic RxCUI: "local_{id}" to distinguish from real ones
        const syntheticRxcui = `local_${localRecord.id}`;
        drugCache[cacheKey] = syntheticRxcui;
        console.log(`[LOCAL DB] Drug "${trimmedDrug}" -> synthetic RxCUI: ${syntheticRxcui}`);
        return { name: trimmedDrug, rxcui: syntheticRxcui, cached: false };
      }

      // Fallback 4: Check manual ingredient map (quick in-memory)
      const normalized = trimmedDrug.toLowerCase();
      if (manualIngredientMap[normalized]) {
        // Generate pseudo-RxCUI based on drug name
        const pseudoRxcui = `manual_${normalized.replace(/[^a-z0-9]/g, '_')}`;
        drugCache[cacheKey] = pseudoRxcui;
        console.log(`[MANUAL MAP] Drug "${trimmedDrug}" -> pseudo RxCUI: ${pseudoRxcui}`);
        return { name: trimmedDrug, rxcui: pseudoRxcui, cached: false };
      }

      return { name: trimmedDrug, rxcui: null, error: 'Drug not found in any source', cached: false };
    }

    const rxcui = candidates[0].rxcui;
    drugCache[cacheKey] = rxcui;
    console.log(`[API RESULT] Drug "${trimmedDrug}" -> RxCUI: ${rxcui}`);
    return { name: trimmedDrug, rxcui: rxcui, cached: false };
  } catch (error) {
    console.error(`[API ERROR] Failed to fetch RxCUI for "${trimmedDrug}":`, error.message);
    return { name: trimmedDrug, rxcui: null, error: error.message, cached: false };
  }
};

// Fallback: Query openFDA to get RxCUI from drug label
const getRxcuiFromOpenFDA = async (drugName) => {
  try {
    console.log(`[FALLBACK] Trying openFDA API for "${drugName}"`);
    const apiKeyParam = getApiKeyParam();
    // Try different field queries
    const queries = [
      `openfda.generic_name:"${drugName.toLowerCase()}"`,
      `openfda.brand_name:"${drugName.toLowerCase()}"`,
      `openfda.substance_name:"${drugName.toLowerCase()}"`,
      `openfda.generic_name:"${drugName.toLowerCase()}%25"` // wildcard at end
    ];

    for (const query of queries) {
      const url = `${OPENFDA_BASE}?search=${encodeURIComponent(query)}&sort=effective_time:desc&limit=1${apiKeyParam}`;
      const response = await fetch(url);

      if (!response.ok) continue;

      const data = await response.json();
      const results = data?.results || [];
      if (results.length > 0 && results[0].openfda?.rxcui) {
        return results[0].openfda.rxcui[0];
      }
    }
  } catch (error) {
    console.error(`[FALLBACK ERROR] openFDA lookup failed for "${drugName}":`, error.message);
  }
  return null;
};

// Fallback: Try RxNav exact name lookup
const getRxcuiExact = async (drugName) => {
  try {
    console.log(`[FALLBACK] Trying exact RxNav lookup for "${drugName}"`);
    const response = await fetch(`${RXNAV_RXCUI_BASE}/name.json?name=${encodeURIComponent(drugName)}&maxEntries=1`);

    if (!response.ok) return null;

    const data = await response.json();
    const candidates = data?.candidates || [];

    if (candidates.length > 0 && candidates[0].rxcui) {
      return candidates[0].rxcui;
    }
  } catch (error) {
    console.error(`[FALLBACK ERROR] Exact RxNav lookup failed for "${drugName}":`, error.message);
  }
  return null;
};

const getActiveIngredients = async (rxcui, drugName = null) => {
  if (!rxcui) return [];

  const cacheKey = `ing:${rxcui}`;
  if (activeIngredientCache[cacheKey]) {
    console.log(`[CACHE HIT] Active ingredients for RxCUI ${rxcui} -> [${activeIngredientCache[cacheKey].join(', ')}]`);
    return activeIngredientCache[cacheKey];
  }

  // Check manual map first (fastest) - use drugName if available
  if (drugName) {
    const normalized = drugName.toLowerCase().trim();
    if (manualIngredientMap[normalized]) {
      const ingredients = manualIngredientMap[normalized];
      console.log(`[MANUAL MAP] ${drugName} -> [${ingredients.join(', ')}]`);
      activeIngredientCache[cacheKey] = ingredients;
      return ingredients;
    }
  }

  // Check local DB for synthetic RxCUI
  if ((rxcui.startsWith('local_') || rxcui.startsWith('manual_')) && !localDrugDB) {
    await loadLocalDrugDB();
  }

  if (rxcui.startsWith('local_') && localDrugDB) {
    const localId = rxcui.replace('local_', '');
    const record = localDrugDB.find(d => d.id === localId);
    if (record && record.ingredients) {
      const ingredients = record.ingredients
        .map(ing => ing.name?.toLowerCase().trim())
        .filter(name => name && name.length > 0);
      if (ingredients.length > 0) {
        console.log(`[LOCAL DB] ${rxcui} (${drugName || record.brand_name}) -> [${ingredients.join(', ')}]`);
        activeIngredientCache[cacheKey] = ingredients;
        return ingredients;
      }
    }
  }

  // Try RxNav API for real RxCUIs
  try {
    console.log(`[API CALL] Fetching active ingredients for RxCUI ${rxcui}`);
    const response = await fetch(`${RXNAV_BASE}/rxcui/${rxcui}/properties.json`);

    if (!response.ok) {
      console.error(`[API ERROR] Failed to fetch properties for RxCUI ${rxcui}: ${response.status}`);
    } else {
      const data = await response.json();

      // RxNav returns active_ingredients as an array of objects with 'name' property
      const ingredients = (data?.active_ingredients || [])
        .map(ing => ing.name?.trim())
        .filter(name => name && name.length > 0);

      if (ingredients.length > 0) {
        // Deduplicate and normalize to lowercase
        const uniqueIngredients = [...new Set(ingredients.map(n => n.toLowerCase()))];
        activeIngredientCache[cacheKey] = uniqueIngredients;
        console.log(`[API RESULT] RxCUI ${rxcui} -> Active ingredients: [${uniqueIngredients.join(', ')}]`);
        return uniqueIngredients;
      }

      // If API returns no active_ingredients, this might be a single-ingredient drug where the RxCUI itself represents the ingredient
      // Use the drug name (normalized) as the active ingredient
      if (drugName) {
        const normalizedName = drugName.toLowerCase().trim();
        console.log(`[API NOTE] RxCUI ${rxcui} has no explicit active_ingredients; using drug name as ingredient: "${normalizedName}"`);
        activeIngredientCache[cacheKey] = [normalizedName];
        return [normalizedName];
      }
    }
  } catch (error) {
    console.error(`[API ERROR] Failed to fetch active ingredients for RxCUI ${rxcui}:`, error.message);
  }

   // Fallback: Try local DB by drug name if available
   if (drugName) {
     const localIngredients = await getActiveIngredientsFromLocalDB(drugName);
     if (localIngredients.length > 0) {
       activeIngredientCache[cacheKey] = localIngredients;
       console.log(`[LOCAL DB] RxCUI ${rxcui} (${drugName}) -> Active ingredients: [${localIngredients.join(', ')}]`);
       return localIngredients;
     }
   }

   return [];
 };

const fetchDrugLabel = async (drugName, rxcui = null, activeIngredients = null) => {
  try {
    console.log(`[API CALL] Fetching FDA label for "${drugName}"${rxcui ? `" (RxCUI: ${rxcui})` : ''}`);
    const apiKeyParam = getApiKeyParam();

    // Strategy 1: Query by RxCUI (most precise) - only for real RxCUIs
    if (rxcui && !rxcui.startsWith('local_') && !rxcui.startsWith('manual_')) {
      const rxcuiQuery = encodeURIComponent(`openfda.rxcui:"${rxcui}"`);
      const rxcuiUrl = `${OPENFDA_BASE}?search=${rxcuiQuery}&sort=effective_time:desc&limit=1${apiKeyParam}`;
      const rxcuiResponse = await fetch(rxcuiUrl);

      if (rxcuiResponse.ok) {
        const rxcuiData = await rxcuiResponse.json();
        const rxcuiResults = rxcuiData?.results || [];
        if (rxcuiResults.length > 0) {
          console.log(`[FOUND] FDA label via RxCUI for "${drugName}"`);
          return rxcuiResults[0];
        }
      }
      console.log(`[NO MATCH] No FDA label found via RxCUI for "${drugName}", trying name-based queries`);
    } else if (rxcui) {
      console.log(`[SKIP] Synthetic RxCUI ${rxcui}, using active ingredient queries`);
    }

    // Strategy 2: Build query list - start with provided drugName, then active ingredients
    const queries = [];

    // Always try the original drug name as brand/generic
    queries.push(`openfda.generic_name:"${drugName.toLowerCase()}"`);
    queries.push(`openfda.brand_name:"${drugName.toLowerCase()}"`);
    queries.push(`openfda.substance_name:"${drugName.toLowerCase()}"`);

    // If we have active ingredients, try those too (these are more reliable)
    if (activeIngredients && Array.isArray(activeIngredients)) {
      for (const ing of activeIngredients) {
        const ingLower = ing.toLowerCase();
        queries.push(`openfda.generic_name:"${ingLower}"`);
        queries.push(`openfda.substance_name:"${ingLower}"`);
      }
    }

    // Try each query until we find a match
    for (const query of queries) {
      const url = `${OPENFDA_BASE}?search=${encodeURIComponent(query)}&sort=effective_time:desc&limit=1${apiKeyParam}`;
      const response = await fetch(url);

      if (!response.ok) continue;

      const data = await response.json();
      const results = data?.results || [];

      if (results.length > 0) {
        console.log(`[FOUND] FDA label for "${drugName}" via query: ${query}`);
        return results[0];
      }
    }

    console.log(`[NO DATA] No FDA label found for "${drugName}"`);
    return null;
  } catch (error) {
    console.error(`[API ERROR] Failed to fetch FDA label:`, error.message);
    return null;
  }
};

const getDrugNamesFromOpenfda = (openfda) => {
  const names = [];
  if (!openfda) return names;
  if (openfda.generic_name) names.push(...openfda.generic_name.map(n => n.toLowerCase()));
  if (openfda.brand_name) names.push(...openfda.brand_name.map(n => n.toLowerCase()));
  if (openfda.substance_name) names.push(...openfda.substance_name.map(n => n.toLowerCase()));
  return [...new Set(names)];
};

const extractInteractionText = (label) => {
  const texts = [];
  if (label.drug_interactions && Array.isArray(label.drug_interactions)) {
    texts.push(...label.drug_interactions);
  }
  if (label.drug_interactions_table && Array.isArray(label.drug_interactions_table)) {
    texts.push(...label.drug_interactions_table);
  }
  if (label.warnings && Array.isArray(label.warnings)) {
    texts.push(...label.warnings);
  }
  if (label.contraindications && Array.isArray(label.contraindications)) {
    texts.push(...label.contraindications);
  }
  return texts;
};

const determineSeverity = (text) => {
  const t = text.toLowerCase();
  if (t.includes('contraindicated') || t.includes('contraindication') || t.includes('severe') || t.includes('black box') || t.includes('boxed warning')) return 'major';
  if (t.includes('monitor') || t.includes('caution') || t.includes('warning') || t.includes('serious')) return 'moderate';
  if (t.includes('mild') || t.includes('minor')) return 'mild';
  return 'moderate';
};

export const checkInteractions = async (drugNames) => {
  const normalized = [];
  const errors = [];

  // Normalize each drug name
  for (const drugName of drugNames) {
    const result = await getRxcui(drugName);
    if (result.rxcui) {
      normalized.push({ name: result.name, rxcui: String(result.rxcui), cached: result.cached || false });
    } else {
      errors.push({ name: result.name, error: result.error });
    }
  }

  if (normalized.length < 2) {
    return { input: drugNames, normalized, interactions: [], errors };
  }

  // Get interactions
  const interactions = await getInteractions(normalized);

  return { input: drugNames, normalized, interactions, errors };
};

const getInteractions = async (normalized) => {
  const rxcuiValues = normalized.map(r => r.rxcui);
  const nameMap = {};
  normalized.forEach(r => { nameMap[r.rxcui] = r.name; });

  const cacheKey = [...rxcuiValues].sort().join('+');
  if (interactionCache[cacheKey]) {
    console.log(`[CACHE HIT] Interactions for ${cacheKey}`);
    return interactionCache[cacheKey];
  }

  const allInteractions = [];
  const seenPairs = new Set();

  // Step 1: Fetch active ingredients for all drugs in parallel
  const activeIngredientsMap = {};
  await Promise.all(normalized.map(async (drug) => {
    // Pass drug.name for local DB fallback
    const ingredients = await getActiveIngredients(drug.rxcui, drug.name);
    activeIngredientsMap[drug.rxcui] = ingredients;
  }));

  // Step 2: Fetch FDA labels for all drugs in parallel (using RxCUI + active ingredients)
  const drugLabels = {};
  const labelsPromises = normalized.map(async (drug) => {
    const ingredients = activeIngredientsMap[drug.rxcui] || [];
    const label = await fetchDrugLabel(drug.name, drug.rxcui, ingredients);
    if (label) drugLabels[drug.rxcui] = label;
  });
  await Promise.all(labelsPromises);

  // Step 3: Check all pairs for interactions using active ingredient names
  for (let i = 0; i < rxcuiValues.length; i++) {
    for (let j = i + 1; j < rxcuiValues.length; j++) {
      const rxcuiA = rxcuiValues[i];
      const rxcuiB = rxcuiValues[j];
      const drugA = nameMap[rxcuiA];
      const drugB = nameMap[rxcuiB];
      const pairKey = [rxcuiA, rxcuiB].sort().join(':');
      if (seenPairs.has(pairKey)) continue;

      const labelA = drugLabels[rxcuiA];
      const labelB = drugLabels[rxcuiB];
      let foundInteraction = false;
      let interactionTexts = [];

      // Get all search names for drug B (active ingredients + any names from its label)
      const activeIngredientsB = activeIngredientsMap[rxcuiB] || [];
      const labelBNames = labelB ? getDrugNamesFromOpenfda(labelB.openfda || {}) : [];
      const searchNamesB = [...new Set([
        ...activeIngredientsB,
        ...labelBNames,
        drugB.toLowerCase()
      ])];

      // Search in label A
      if (labelA) {
        const texts = extractInteractionText(labelA);
        for (const text of texts) {
          const textLower = text.toLowerCase();
          for (const name of searchNamesB) {
            if (textLower.includes(name.toLowerCase())) {
              foundInteraction = true;
              interactionTexts.push(text);
              break;
            }
          }
          if (foundInteraction) break;
        }
      }

      // If not found, search in label B for drug A
      if (!foundInteraction && labelB) {
        const activeIngredientsA = activeIngredientsMap[rxcuiA] || [];
        const labelANames = labelA ? getDrugNamesFromOpenfda(labelA.openfda || {}) : [];
        const searchNamesA = [...new Set([
          ...activeIngredientsA,
          ...labelANames,
          drugA.toLowerCase()
        ])];

        const texts = extractInteractionText(labelB);
        for (const text of texts) {
          const textLower = text.toLowerCase();
          for (const name of searchNamesA) {
            if (textLower.includes(name.toLowerCase())) {
              foundInteraction = true;
              interactionTexts.push(text);
              break;
            }
          }
          if (foundInteraction) break;
        }
      }

      if (foundInteraction && interactionTexts.length > 0) {
        seenPairs.add(pairKey);
        const fullDescription = interactionTexts
          .map(t => t.replace(/\s+/g, ' ').trim())
          .filter(t => t.length > 20)
          .slice(0, 3)
          .join(' | ');
        const maxSeverity = interactionTexts
          .map(t => determineSeverity(t))
          .reduce((max, curr) => {
            const order = { minor: 0, moderate: 1, major: 2 };
            return order[curr] > order[max] ? curr : max;
          }, 'minor');

        allInteractions.push({
          drugs: [drugA, drugB],
          description: fullDescription.substring(0, 2000),
          severity: maxSeverity,
          source: 'FDA Structured Product Labeling (openFDA)',
        });
      }
    }
  }

  interactionCache[cacheKey] = allInteractions;
  return allInteractions;
};
