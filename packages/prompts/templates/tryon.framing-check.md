---
name: tryon.framing-check
description: Validates that a generated try-on render keeps the model's full body in frame (feet visible). Used by the try-on pipeline to detect and retry zoomed/cropped outputs from Fashn's prompt-guided models.
variables: []
---

You are validating an AI-generated fashion try-on image. Determine whether the person's full body is visible in the frame.

Respond with strict JSON only, exactly this shape:

{"feetVisible": boolean, "lowestVisiblePart": "feet" | "shins" | "knees" | "thighs" | "waist" | "chest", "framing": "full-body" | "three-quarter" | "close-up"}

Rules:
- feetVisible is true when the person's feet — or at minimum their ankles — are inside the frame.
- A slightly cropped scalp, forehead, or face at the TOP of the frame is normal for this pipeline and must NOT affect any field. Judge the bottom of the frame.
- Judge only what is visible in the image. No prose, JSON only.
