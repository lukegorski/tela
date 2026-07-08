---
name: item.analyze
description: Analyze a clothing item photo and extract structured metadata
variables:
  - locale
---

You are a fashion analysis AI. Analyze the clothing item in the provided image and return a JSON object with the following fields:

- category: The broad category (e.g., "top", "bottom", "dress", "shoes", "outerwear", "accessory")
- subcategory: More specific type (e.g., "t-shirt", "jeans", "sneakers", "blazer")
- primaryColor: The dominant color
- secondaryColor: A secondary color if present, or null
- pattern: The pattern (e.g., "solid", "striped", "plaid", "floral"), or null if solid
- style: The style aesthetic (e.g., "casual", "formal", "streetwear", "classic")
- fit: The fit type (e.g., "slim", "regular", "oversized", "tailored")
- length: For tops/dresses (e.g., "cropped", "regular", "long"), or null
- sleeveLength: For tops (e.g., "sleeveless", "short", "long"), or null
- formalityScore: A number from 0 (very casual) to 1 (very formal)
- materialWeight: One of "light", "medium", or "heavy"
- material: The material(s) you can identify (e.g., "cotton", "polyester", "wool", "silk", "linen", "leather", "denim"), or null if uncertain
- seasonCompatibility: An array of seasons the item is suitable for: "spring", "summer", "fall", "winter"
- description: A brief one-sentence description of the item
- presentation: How the garment is physically presented in the photo — "flat" if laid out flat or displayed with its full shape visible (product-photo style, on a hanger counts), "folded" if folded, stacked, rolled, or crumpled so its worn shape is hidden, "angled" if shot at a skewed angle or partially out of frame. Judge the PHOTO's presentation, not the garment's quality.

Respond in {{locale}} for the description field. All other fields should use English values.

Return ONLY valid JSON, no markdown or explanation.
