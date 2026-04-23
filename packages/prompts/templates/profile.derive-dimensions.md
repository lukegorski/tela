---
name: profile.derive_dimensions
description: Extract 5 numerical style dimensions from a prose style profile
variables:
  - profile_text
---

You are analyzing a written style profile to extract 5 numerical scores on continuous 0–1 scales. Each dimension represents a fundamental axis of personal style. Read the profile and assign a score to each dimension based on the evidence in the text.

Dimensions:

1. **minimalMaximal** (0 = minimalist, 1 = maximalist)
   - 0.0–0.3: Pared-back, few pieces, neutral palette, "less is more"
   - 0.4–0.6: Balanced, intentional but not stark
   - 0.7–1.0: Layered, accessorized, bold combinations

2. **classicTrendy** (0 = timeless, 1 = fashion-forward)
   - 0.0–0.3: Classic staples, never goes out of style, conservative shapes
   - 0.4–0.6: Mostly timeless with some current pieces
   - 0.7–1.0: Embraces trends, follows current styles, willing to experiment

3. **casualFormal** (0 = relaxed, 1 = polished)
   - 0.0–0.3: Predominantly casual, t-shirts, jeans, sneakers
   - 0.4–0.6: Smart casual, mix of dressed-up and dressed-down
   - 0.7–1.0: Tailored, structured, dressy

4. **subtleBold** (0 = neutral/muted, 1 = vibrant/statement)
   - 0.0–0.3: Neutral palette (white, beige, gray, navy, black), no patterns
   - 0.4–0.6: Mostly neutral with occasional accents
   - 0.7–1.0: Bright colors, bold patterns, statement pieces

5. **structuredFluid** (0 = tailored, 1 = soft/draped)
   - 0.0–0.3: Sharp lines, structured tailoring, fitted silhouettes
   - 0.4–0.6: Mix of structured and relaxed silhouettes
   - 0.7–1.0: Flowing, draped, oversized, soft fabrics

Also extract a confidence score for each dimension (0.0 = unsure, 1.0 = very confident based on strong evidence in the text).

Also extract any specific signals — patterns, colors, or styles the user clearly loves or avoids — as tag/strength pairs. Use these tag formats:
- `avoid-color:black` (strength -1.0 means strongly avoid)
- `loves-pattern:stripes` (strength +0.7 means loves)
- `loves-fabric:linen`

Return ONLY valid JSON in this exact shape:

{
  "dimensions": {
    "minimalMaximal": 0.0,
    "classicTrendy": 0.0,
    "casualFormal": 0.0,
    "subtleBold": 0.0,
    "structuredFluid": 0.0
  },
  "confidence": {
    "minimalMaximal": 0.0,
    "classicTrendy": 0.0,
    "casualFormal": 0.0,
    "subtleBold": 0.0,
    "structuredFluid": 0.0
  },
  "signals": [
    { "tag": "loves-color:navy", "strength": 0.8 }
  ]
}

The style profile:

{{profile_text}}
