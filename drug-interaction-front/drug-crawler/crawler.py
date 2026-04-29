#!/usr/bin/env python3
"""
MVP drug crawler — Egyptian-market brands enriched with RxNorm + openFDA.

Pipeline:
  1. Read brand-name seed list (data/seeds.json — auto-created on first run).
  2. RxNorm: brand -> active ingredient(s) + RxCUI (US-centric, misses EG-only brands).
  3. Fallback: data/manual_ingredients.json maps EG-only brands -> ingredient names.
  4. openFDA label: ingredient -> side effects, interactions, warnings, indications.
  5. Write data/drugs.json — ready for a Vue frontend to fetch().

Usage:
  pip install -r requirements.txt
  python crawler.py

To extend coverage, append to data/seeds.json and (for EG-only brands) to
data/manual_ingredients.json, then re-run.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).parent
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)

SEEDS_FILE = DATA / "seeds.json"
MANUAL_FILE = DATA / "manual_ingredients.json"
OUTPUT_FILE = DATA / "drugs.json"

RXNORM = "https://rxnav.nlm.nih.gov/REST"
OPENFDA = "https://api.fda.gov/drug/label.json"

REQUEST_DELAY = 0.2

# Egyptian-market focused: popular OTC + Rx brands sold in EG pharmacies.
DEFAULT_SEEDS = [
    # Analgesics / paracetamol
    "Panadol", "Adol", "Rivo", "Ezamol", "Setamol", "Cetal", "Abimol",
    "Paramol", "Tylenol", "Solpadeine",
    # NSAIDs
    "Brufen", "Profinal", "Spedifen", "Cataflam", "Voltaren", "Catafast",
    "Declophen", "Olfen", "Rofenac", "Movalis", "Mobic", "Ketofan",
    "Ketolac", "Toradol", "Profenid", "Naprosyn", "Aleve", "Celebrex",
    "Arcoxia", "Indocid", "Feldene", "Tilcotil", "Tramal", "Ponstan",
    "Lecaspar", "Aspirin",
    # Antibiotics
    "Augmentin", "Amoxil", "Curam", "Ospamox", "Megamox", "Hibiotic",
    "Velosef", "Keflex", "Ceporex", "Suprax", "Rocephin", "Megapen",
    "Flumox", "Unictam", "Klacid", "Klaricid", "Zithromax", "E-mycin",
    "Rovamycin", "Cipro", "Tavanic", "Tarivid", "Vibramycin", "Septrin",
    "Bactrim", "Flagyl",
    # GI
    "Antinal", "Antopral", "Nexium", "Omez", "Losec", "Controloc",
    "Pantoloc", "Pariet", "Zantac", "Pepcid", "Famotic", "Antepsin",
    "Motilium", "Costi", "Buscopan", "Imodium", "Reglan", "Primperan",
    "Maalox", "Mucogel", "Gaviscon", "Disflatyl", "Spasmofree",
    "Duphalac", "Movicol",
    # Allergy / antihistamines
    "Telfast", "Claritine", "Zyrtec", "Allerfen", "Aerius", "Atarax",
    "Periactin", "Histop", "Avil", "Clarinase",
    # Cough / cold / throat
    "Comtrex", "Sinufed", "Coldex", "Strepsils", "Difflam", "Bisolvon",
    "Toplexil", "Robitussin", "Mucosolvan",
    # Nasal / inhaled
    "Otrivin", "Nasivin", "Rhinocort", "Flixonase",
    # Respiratory
    "Ventolin", "Symbicort", "Seretide", "Pulmicort", "Atrovent",
    "Foradil", "Spiriva", "Singulair",
    # Cardiovascular - beta blockers / CCB
    "Concor", "Tenormin", "Betaloc", "Dilatrend", "Nebilet",
    "Norvasc", "Amlor", "Adalat", "Isoptin", "Cardizem",
    # ACE / ARB
    "Tritace", "Coversyl", "Capoten", "Renitec", "Vasotec", "Zestril",
    "Diovan", "Cozaar", "Micardis", "Aprovel", "Olmetec",
    # Statins / antiplatelet / anticoag
    "Lipitor", "Crestor", "Zocor", "Plavix", "Brilinta",
    "Marevan", "Xarelto", "Eliquis",
    # Diuretics
    "Lasix", "Aldactone", "Natrilix",
    # Diabetes
    "Glucophage", "Cidophage", "Diamicron", "Amaryl", "Daonil",
    "Januvia", "Galvus", "Forxiga", "Jardiance", "Ozempic",
    "Lantus", "Mixtard", "Actrapid",
    # Endocrine / thyroid
    "Synthroid", "Eltroxin", "Neo-mercazole",
    # Psych / neuro
    "Prozac", "Zoloft", "Lustral", "Cipralex", "Cymbalta", "Effexor",
    "Wellbutrin", "Anafranil", "Tryptizol", "Citol", "Cidamex",
    "Xanax", "Lyrica", "Neurontin", "Tegretol", "Depakine", "Lamictal",
    "Topamax", "Keppra", "Risperdal", "Seroquel", "Haldol", "Largactil",
    # Antifungal / antiparasitic / antiviral
    "Daktarin", "Canesten", "Nizoral", "Lamisil", "Diflucan", "Sporanox",
    "Tamiflu", "Zovirax", "Valtrex",
    "Distocide", "Vermox", "Zentel", "Fasigyn", "Alinia",
    # Steroids
    "Decadron", "Solu-Cortef", "Solu-Medrol",
    # Eye drops
    "Tobrex", "Tobradex", "Xalatan",
    # Dermatology / topical
    "Fucidin", "Bactroban", "Elocon", "Diprosone", "Locoid",
    "Retin-A", "Differin", "Roaccutane",
    # Gynecology
    "Yasmin", "Microgynon", "Provera", "Duphaston", "Cytotec",
    # EG enzyme / anti-inflammatory
    "Alphintern", "Reparil",
]

# EG-only brands that RxNorm won't resolve. Manual mapping to active ingredient(s);
# openFDA enrichment then runs against the ingredient name.
DEFAULT_MANUAL = {
    # Paracetamol
    "Adol": ["Acetaminophen"],
    "Rivo": ["Acetaminophen"],
    "Ezamol": ["Acetaminophen"],
    "Setamol": ["Acetaminophen"],
    "Cetal": ["Acetaminophen"],
    "Abimol": ["Acetaminophen"],
    "Paramol": ["Acetaminophen", "Codeine"],
    "Solpadeine": ["Acetaminophen", "Codeine", "Caffeine"],
    # NSAIDs
    "Brufen": ["Ibuprofen"],
    "Profinal": ["Ibuprofen"],
    "Spedifen": ["Ibuprofen"],
    "Cataflam": ["Diclofenac"],
    "Catafast": ["Diclofenac"],
    "Declophen": ["Diclofenac"],
    "Olfen": ["Diclofenac"],
    "Rofenac": ["Diclofenac"],
    "Movalis": ["Meloxicam"],
    "Ketofan": ["Ketoprofen"],
    "Profenid": ["Ketoprofen"],
    "Ketolac": ["Ketorolac"],
    "Arcoxia": ["Etoricoxib"],
    "Indocid": ["Indomethacin"],
    "Feldene": ["Piroxicam"],
    "Tilcotil": ["Tenoxicam"],
    "Tramal": ["Tramadol"],
    "Ponstan": ["Mefenamic Acid"],
    "Lecaspar": ["Aspirin"],
    # Antibiotics
    "Curam": ["Amoxicillin", "Clavulanate"],
    "Ospamox": ["Amoxicillin"],
    "Megamox": ["Amoxicillin", "Clavulanate"],
    "Hibiotic": ["Cephradine"],
    "Velosef": ["Cephradine"],
    "Ceporex": ["Cephalexin"],
    "Megapen": ["Ampicillin", "Cloxacillin"],
    "Flumox": ["Flucloxacillin"],
    "Unictam": ["Ampicillin", "Sulbactam"],
    "Klacid": ["Clarithromycin"],
    "Klaricid": ["Clarithromycin"],
    "E-mycin": ["Erythromycin"],
    "Rovamycin": ["Spiramycin"],
    "Tavanic": ["Levofloxacin"],
    "Tarivid": ["Ofloxacin"],
    "Septrin": ["Sulfamethoxazole", "Trimethoprim"],
    # GI
    "Antinal": ["Nifuroxazide"],
    "Antopral": ["Omeprazole"],
    "Omez": ["Omeprazole"],
    "Controloc": ["Pantoprazole"],
    "Pantoloc": ["Pantoprazole"],
    "Pariet": ["Rabeprazole"],
    "Famotic": ["Famotidine"],
    "Antepsin": ["Sucralfate"],
    "Motilium": ["Domperidone"],
    "Costi": ["Domperidone"],
    "Primperan": ["Metoclopramide"],
    "Maalox": ["Aluminum Hydroxide", "Magnesium Hydroxide"],
    "Mucogel": ["Aluminum Hydroxide", "Magnesium Hydroxide"],
    "Disflatyl": ["Simethicone"],
    "Spasmofree": ["Hyoscine Butylbromide"],
    "Duphalac": ["Lactulose"],
    "Movicol": ["Polyethylene Glycol"],
    # Allergy
    "Telfast": ["Fexofenadine"],
    "Claritine": ["Loratadine"],
    "Allerfen": ["Cetirizine"],
    "Aerius": ["Desloratadine"],
    "Histop": ["Cyproheptadine"],
    "Avil": ["Pheniramine"],
    "Clarinase": ["Loratadine", "Pseudoephedrine"],
    # Cough / cold / throat
    "Comtrex": ["Acetaminophen", "Phenylephrine", "Chlorpheniramine"],
    "Sinufed": ["Pseudoephedrine"],
    "Coldex": ["Acetaminophen", "Pseudoephedrine", "Chlorpheniramine"],
    "Strepsils": ["Amylmetacresol", "Dichlorobenzyl Alcohol"],
    "Difflam": ["Benzydamine"],
    "Bisolvon": ["Bromhexine"],
    "Toplexil": ["Oxomemazine"],
    "Robitussin": ["Guaifenesin"],
    "Mucosolvan": ["Ambroxol"],
    # Nasal
    "Otrivin": ["Xylometazoline"],
    "Nasivin": ["Oxymetazoline"],
    "Flixonase": ["Fluticasone"],
    # Respiratory
    "Seretide": ["Fluticasone", "Salmeterol"],
    "Foradil": ["Formoterol"],
    # Cardiovascular
    "Concor": ["Bisoprolol"],
    "Betaloc": ["Metoprolol"],
    "Dilatrend": ["Carvedilol"],
    "Nebilet": ["Nebivolol"],
    "Amlor": ["Amlodipine"],
    "Isoptin": ["Verapamil"],
    "Tritace": ["Ramipril"],
    "Coversyl": ["Perindopril"],
    "Renitec": ["Enalapril"],
    "Aprovel": ["Irbesartan"],
    "Olmetec": ["Olmesartan"],
    "Marevan": ["Warfarin"],
    "Natrilix": ["Indapamide"],
    # Diabetes
    "Cidophage": ["Metformin"],
    "Diamicron": ["Gliclazide"],
    "Daonil": ["Glibenclamide"],
    "Galvus": ["Vildagliptin"],
    "Mixtard": ["Insulin"],
    "Actrapid": ["Insulin"],
    # Endocrine
    "Eltroxin": ["Levothyroxine"],
    "Neo-mercazole": ["Carbimazole"],
    # Psych / neuro
    "Lustral": ["Sertraline"],
    "Cipralex": ["Escitalopram"],
    "Anafranil": ["Clomipramine"],
    "Tryptizol": ["Amitriptyline"],
    "Citol": ["Citalopram"],
    "Cidamex": ["Acetazolamide"],
    "Depakine": ["Valproate"],
    "Largactil": ["Chlorpromazine"],
    # Antifungal / antiparasitic
    "Daktarin": ["Miconazole"],
    "Canesten": ["Clotrimazole"],
    "Distocide": ["Praziquantel"],
    "Zentel": ["Albendazole"],
    "Fasigyn": ["Tinidazole"],
    # Steroids
    "Solu-Cortef": ["Hydrocortisone"],
    "Solu-Medrol": ["Methylprednisolone"],
    # Eye
    "Tobrex": ["Tobramycin"],
    "Tobradex": ["Tobramycin", "Dexamethasone"],
    # Dermatology
    "Fucidin": ["Fusidic Acid"],
    "Diprosone": ["Betamethasone"],
    "Locoid": ["Hydrocortisone Butyrate"],
    "Roaccutane": ["Isotretinoin"],
    # Gynecology
    "Microgynon": ["Levonorgestrel", "Ethinyl Estradiol"],
    "Duphaston": ["Dydrogesterone"],
    # EG enzyme / anti-inflammatory
    "Alphintern": ["Trypsin", "Chymotrypsin"],
    "Reparil": ["Aescin"],
    # Fallback for brands RxNorm missed in earlier runs
    "Toradol": ["Ketorolac"],
    "Amoxil": ["Amoxicillin"],
    "Rocephin": ["Ceftriaxone"],
    "Losec": ["Omeprazole"],
    "Atarax": ["Hydroxyzine"],
    "Periactin": ["Cyproheptadine"],
    "Adalat": ["Nifedipine"],
    "Capoten": ["Captopril"],
    "Forxiga": ["Dapagliflozin"],
    "Elocon": ["Mometasone"],
    "Yasmin": ["Drospirenone", "Ethinyl Estradiol"],
}


def load_json(path: Path, default):
    if not path.exists():
        path.write_text(json.dumps(default, indent=2, ensure_ascii=False))
        print(f"Wrote default -> {path}")
        return default
    return json.loads(path.read_text())


def slugify(name: str) -> str:
    return "-".join(name.lower().split())


def lookup_rxnorm_ingredients(client: httpx.Client, brand: str) -> list[dict]:
    """Resolve a brand name to its active ingredient(s) via RxNorm."""
    r = client.get(f"{RXNORM}/rxcui.json", params={"name": brand})
    if r.status_code != 200:
        return []
    ids = (r.json().get("idGroup") or {}).get("rxnormId") or []
    if not ids:
        return []

    rxcui = ids[0]
    r = client.get(
        f"{RXNORM}/rxcui/{rxcui}/related.json", params={"tty": "IN"}
    )
    if r.status_code != 200:
        return []

    groups = (r.json().get("relatedGroup") or {}).get("conceptGroup") or []
    ingredients: list[dict] = []
    for group in groups:
        for concept in group.get("conceptProperties") or []:
            ingredients.append(
                {"name": concept["name"], "rxcui": concept["rxcui"]}
            )
    return ingredients


def lookup_openfda_label(client: httpx.Client, ingredient: str) -> dict:
    """Fetch the first openFDA label entry for an active ingredient.

    Tries `generic_name` then `substance_name` — coverage varies by drug.
    """
    for field in ("openfda.generic_name", "openfda.substance_name"):
        r = client.get(
            OPENFDA, params={"search": f'{field}:"{ingredient}"', "limit": 1}
        )
        if r.status_code != 200:
            continue
        results = r.json().get("results") or []
        if not results:
            continue
        label = results[0]
        return {
            "side_effects": label.get("adverse_reactions") or [],
            "interactions": label.get("drug_interactions") or [],
            "warnings": label.get("warnings") or [],
            "indications": label.get("indications_and_usage") or [],
        }
    return {}


def build() -> None:
    seeds: list[str] = load_json(SEEDS_FILE, DEFAULT_SEEDS)
    manual: dict[str, list[str]] = load_json(MANUAL_FILE, DEFAULT_MANUAL)
    print(f"Crawling {len(seeds)} EG-market brands "
          f"({len(manual)} have manual ingredient fallbacks)\n")

    drugs: list[dict] = []
    label_cache: dict[str, dict] = {}

    headers = {"User-Agent": "drug-crawler-mvp/0.1"}
    with httpx.Client(timeout=30.0, headers=headers) as client:
        for index, brand in enumerate(seeds, start=1):
            ingredients = lookup_rxnorm_ingredients(client, brand)
            time.sleep(REQUEST_DELAY)

            source = "rxnorm"
            if not ingredients and brand in manual:
                ingredients = [{"name": n, "rxcui": None} for n in manual[brand]]
                source = "manual"

            status = f"{len(ingredients)}x {source}" if ingredients else "no match"
            print(f"[{index}/{len(seeds)}] {brand:<14} {status}")

            enriched: list[dict] = []
            for ingredient in ingredients:
                name = ingredient["name"]
                key = name.lower()
                if key not in label_cache:
                    label_cache[key] = lookup_openfda_label(client, name)
                    time.sleep(REQUEST_DELAY)
                enriched.append({**ingredient, **label_cache[key]})

            drugs.append(
                {
                    "id": slugify(brand),
                    "brand_name": brand,
                    "market": "EG",
                    "source": source if ingredients else "unresolved",
                    "ingredients": enriched,
                }
            )

    OUTPUT_FILE.write_text(
        json.dumps({"drugs": drugs}, indent=2, ensure_ascii=False)
    )

    matched = sum(1 for d in drugs if d["ingredients"])
    with_label = sum(
        1 for d in drugs if any(i.get("side_effects") for i in d["ingredients"])
    )
    print(
        f"\nWrote {len(drugs)} drugs ({matched} resolved, "
        f"{with_label} with FDA label data) -> {OUTPUT_FILE}"
    )


if __name__ == "__main__":
    build()
