const RXNAV_BASE = 'https://rxnav.nlm.nih.gov/REST';
const OPENFDA_BASE = 'https://api.fda.gov/drug/label.json';
// Optional: Set VITE_OPENFDA_API_KEY in .env file for higher rate limits
const OPENFDA_API_KEY = import.meta.env.VITE_OPENFDA_API_KEY || '';

const getApiKeyParam = () => OPENFDA_API_KEY ? `&api_key=${OPENFDA_API_KEY}` : '';

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
      return { name: trimmedDrug, rxcui: null, error: 'Drug not found', cached: false };
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

const fetchDrugLabel = async (drugName) => {
  try {
    console.log(`[API CALL] Fetching FDA label for "${drugName}"`);
    const apiKeyParam = getApiKeyParam();
    const response = await fetch(`${OPENFDA_BASE}?search=openfda.generic_name:"${encodeURIComponent(drugName.toLowerCase())}"&sort=effective_time:desc&limit=1${apiKeyParam}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData?.error || `FDA API error ${response.status}`;
      console.error(`[API ERROR] ${errorMsg}`);
      return null;
    }

    const data = await response.json();
    const results = data?.results || [];

    if (results.length === 0) {
      console.log(`[NO DATA] No FDA label found for "${drugName}"`);
      return null;
    }

    console.log(`[FOUND] FDA label for "${drugName}"`);
    return results[0];
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
  const drugLabels = {};

  // Fetch labels for all drugs in parallel
  const labelsPromises = normalized.map(async (drug) => {
    const label = await fetchDrugLabel(drug.name);
    if (label) drugLabels[drug.rxcui] = label;
  });

  await Promise.all(labelsPromises);

  // Check all pairs
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

      if (labelA) {
        const texts = extractInteractionText(labelA);
        const searchNames = getDrugNamesFromOpenfda(labelB?.openfda || {}).concat(drugB.toLowerCase());
        for (const text of texts) {
          const textLower = text.toLowerCase();
          for (const name of searchNames) {
            if (textLower.includes(name)) {
              foundInteraction = true;
              interactionTexts.push(text);
              break;
            }
          }
          if (foundInteraction) break;
        }
      }

      if (!foundInteraction && labelB) {
        const texts = extractInteractionText(labelB);
        const searchNames = getDrugNamesFromOpenfda(labelA?.openfda || {}).concat(drugA.toLowerCase());
        for (const text of texts) {
          const textLower = text.toLowerCase();
          for (const name of searchNames) {
            if (textLower.includes(name)) {
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
