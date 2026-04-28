// Simple in-memory cache
const drugCache = {}; // drugName -> rxcui
const interactionCache = {}; // sortedRxcuiCombo -> interactions

const getDrugRxcui = (drugName) => {
  const key = drugName.toLowerCase().trim();
  return drugCache[key];
};

const setDrugRxcui = (drugName, rxcui) => {
  const key = drugName.toLowerCase().trim();
  drugCache[key] = rxcui;
};

const getInteractions = (rxcuis) => {
  const sorted = [...rxcuis].sort().join('+');
  return interactionCache[sorted];
};

const setInteractions = (rxcuis, interactions) => {
  const sorted = [...rxcuis].sort().join('+');
  interactionCache[sorted] = interactions;
};

module.exports = {
  getDrugRxcui,
  setDrugRxcui,
  getInteractions,
  setInteractions,
};