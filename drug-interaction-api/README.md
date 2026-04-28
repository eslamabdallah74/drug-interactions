# Drug Interaction Checker

A full-stack application for checking potential drug-drug interactions using FDA Structured Product Labeling data.

## Architecture

- **Backend**: Express.js REST API that normalizes drug names via RxNav and checks interactions via openFDA
- **Frontend**: Vue.js 3 SPA with TypeScript
- **Data Sources**: 
  - RxNav API (drug name normalization to RxCUI)
  - openFDA Drug Label API (interaction data from FDA labels)

## Features

- Check drug interactions between 2+ medications
- Real-time search with RxNorm normalization
- Severity classification (major/moderate/minor)
- In-memory caching for reduced API calls
- Responsive, modern UI
- Detailed interaction descriptions from FDA sources

## Quick Start

### Backend Setup

```bash
cd /home/eslam/work/drug-interaction-api
npm install
node index.js
```

The API will be available at `http://localhost:3001`

### Frontend Setup

```bash
cd /home/eslam/work/frontend
npm install
npm run dev
```

The app will be available at the Vite dev server URL (typically `http://localhost:5173`)

## API Endpoints

### GET /interactions

Check drug interactions.

**Query Parameters:**
- `drugs` (required): Comma-separated list of drug names

**Example:**
```bash
curl "http://localhost:3001/interactions?drugs=warfarin,aspirin,ibuprofen"
```

**Response:**
```json
{
  "input": ["warfarin", "aspirin"],
  "normalized": [
    {"name": "warfarin", "rxcui": "11289", "cached": false},
    {"name": "aspirin", "rxcui": "1191", "cached": false}
  ],
  "interactions": [
    {
      "drugs": ["warfarin", "aspirin"],
      "description": "7 DRUG INTERACTIONS...",
      "severity": "major",
      "source": "FDA Structured Product Labeling (openFDA)"
    }
  ]
}
```

### GET /health

Health check endpoint.

## Project Structure

```
drug-interaction-api/
├── index.js                 # Express server
├── services/
│   └── interactionService.js # RxNav + openFDA integration
├── utils/
│   └── cache.js             # In-memory caching
└── package.json

frontend/
├── src/
│   ├── App.vue             # Main application component
│   ├── main.ts             # Vue app initialization
│   └── assets/
│       ├── base.css        # CSS variables & base styles
│       └── main.css        # Global styles
└── index.html              # HTML entry point
```

## How It Works

1. **Drug Normalization**: Drug names are normalized to RxCUI identifiers using RxNav's approximateTerm API
2. **Label Retrieval**: FDA labels are fetched for each drug via openFDA using generic name search
3. **Interaction Detection**: Each drug's label is scanned for mentions of other drugs in interaction sections
4. **Severity Scoring**: Interactions are classified based on keywords (contraindicated, monitor, etc.)
5. **Caching**: Both drug normalization results and interaction pairs are cached to reduce API calls

## Note on Data Sources

The original RxNav Drug Interaction API was discontinued in January 2024. This application uses:
- **RxNav**: Still active for drug name normalization (RxCUI assignment)
- **openFDA**: Active source of FDA drug label data containing interaction information

## Testing

### Example Queries

```bash
# Two drugs with known interactions
curl "http://localhost:3001/interactions?drugs=warfarin,aspirin"

# NSAID combination
curl "http://localhost:3001/interactions?drugs=aspirin,ibuprofen"

# Three+ drugs
curl "http://localhost:3001/interactions?drugs=aspirin,ibuprofen,warfarin"
```

## License

MIT
