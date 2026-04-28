const express = require('express');
const cors = require('cors');
const interactionService = require('./services/interactionService');

const app = express();
const PORT = 3001;

// Enable CORS for frontend (allow any localhost port for dev)
app.use(cors({
  origin: (origin, callback) => {
    const allowed = !origin || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')
    callback(null, allowed)
  },
  credentials: true
}));

// Parse query parameters
app.use(express.urlencoded({ extended: true }));

// GET /interactions?drugs=drug1,drug2,drug3
app.get('/interactions', async (req, res) => {
  console.log('\n=== New Request ===');
  
  const drugsParam = req.query.drugs;
  
  // Validate presence of drugs parameter
  if (!drugsParam) {
    return res.status(400).json({
      error: 'Missing required query parameter: drugs',
      example: 'GET /interactions?drugs=aspirin,ibuprofen',
    });
  }

  // Split by comma, trim whitespace, remove duplicates
  const drugNames = [...new Set(
    drugsParam
      .split(',')
      .map(d => d.trim())
      .filter(d => d.length > 0)
  )];

  if (drugNames.length < 2) {
    return res.status(400).json({
      error: 'At least 2 unique drug names are required',
      provided: drugNames,
    });
  }

  console.log(`Processing ${drugNames.length} drug(s): ${drugNames.join(', ')}`);

  // Normalize each drug name to RxCUI
  const normalized = [];
  const errors = [];

  for (const drugName of drugNames) {
    const result = await interactionService.getRxcui(drugName);
    
    if (result.rxcui) {
      normalized.push({ name: result.name, rxcui: String(result.rxcui), cached: result.cached || false });
    } else {
      errors.push({ name: result.name, error: result.error });
    }
  }

  if (normalized.length === 0) {
    return res.status(400).json({
      error: 'None of the provided drugs could be found',
      input: drugNames,
      errors: errors,
    });
  }

  // Fetch interactions
  let interactions = [];
  if (normalized.length >= 2) {
    try {
      interactions = await interactionService.getInteractions(normalized);
    } catch (error) {
      return res.status(500).json({
        error: 'Failed to fetch interactions',
        message: error.message,
        normalized: normalized,
      });
    }
  }

  // Build response
  const response = {
    input: drugNames,
    normalized: normalized,
    interactions: interactions,
  };

  if (errors.length > 0) {
    response.errors = errors;
  }

  console.log(`[RESPONSE] Returning ${interactions.length} interaction(s)\n`);
  
  res.json(response);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'drug-interaction-api' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Drug Interaction API running on http://localhost:${PORT}`);
  console.log(`Try: curl "http://localhost:${PORT}/interactions?drugs=aspirin,ibuprofen"`);
});