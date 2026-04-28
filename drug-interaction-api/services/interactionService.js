const axios = require('axios');
const cache = require('../utils/cache');

const RXNAOM_BASE = 'https://rxnav.nlm.nih.gov/REST';
const OPENFDA_BASE = 'https://api.fda.gov/drug/label.json';

const getRxcui = async (drugName) => {
  const trimmedDrug = drugName.trim();
  const cached = cache.getDrugRxcui(trimmedDrug);
  if (cached) {
    console.log(`[CACHE HIT] Drug "${trimmedDrug}" -> RxCUI: ${cached}`);
    return { name: trimmedDrug, rxcui: cached, cached: true };
  }
  try {
    console.log(`[API CALL] Fetching RxCUI for "${trimmedDrug}"`);
    const response = await axios.get(`${RXNAOM_BASE}/approximateTerm.json`, {
      params: { term: trimmedDrug, maxEntries: 1 },
      timeout: 10000,
    });
    const candidates = response.data?.approximateGroup?.candidate || [];
    if (candidates.length === 0) {
      console.log(`[NOT FOUND] No RxCUI found for "${trimmedDrug}"`);
      return { name: trimmedDrug, rxcui: null, error: 'Drug not found', cached: false };
    }
    const rxcui = candidates[0].rxcui;
    cache.setDrugRxcui(trimmedDrug, rxcui);
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
    const response = await axios.get(OPENFDA_BASE, {
      params: {
        search: `openfda.generic_name:"${drugName.toLowerCase()}"`,
        sort: 'effective_time:desc',
        limit: 1,
      },
      timeout: 10000,
    });
    const results = response.data?.results || [];
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

const getInteractions = async (rxcuiList) => {
  const validRxcuis = rxcuiList.filter(r => r.rxcui && !r.error);
  if (validRxcuis.length < 2) {
    console.log('[SKIP] Need at least 2 valid RxCUI values');
    return [];
  }
  const rxcuiValues = validRxcuis.map(r => r.rxcui);
  const nameMap = {};
  validRxcuis.forEach(r => { nameMap[r.rxcui] = r.name; });
  const cached = cache.getInteractions(rxcuiValues);
  if (cached) {
    console.log(`[CACHE HIT] Interactions for ${rxcuiValues.join('+')}`);
    return cached;
  }
  const allInteractions = [];
  const seenPairs = new Set();
  const drugLabels = {};
  for (const rxcui of rxcuiValues) {
    const label = await fetchDrugLabel(nameMap[rxcui]);
    if (label) drugLabels[rxcui] = label;
  }
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
        const fullDescription = interactionTexts.map(t => t.replace(/\s+/g, ' ').trim()).filter(t => t.length > 20).slice(0, 3).join(' | ');
        const maxSeverity = interactionTexts.map(t => determineSeverity(t)).reduce((max, curr) => {
          const order = { minor: 0, moderate: 1, major: 2 };
          return order[curr] > order[max] ? curr : max;
        }, 'minor');
        allInteractions.push({
          drugs: [drugA, drugB],
          description: fullDescription.substring(0, 2000),
          severity: maxSeverity,
          source: 'FDA Structured Product Labeling (openFDA)',
        });
        console.log(`[MATCH] Found interaction: ${drugA} <-> ${drugB} (${maxSeverity})`);
      }
    }
  }
  cache.setInteractions(rxcuiValues, allInteractions);
  console.log(`[RESULT] Total unique interaction pairs found: ${allInteractions.length}`);
  return allInteractions;
};

module.exports = { getRxcui, getInteractions };
