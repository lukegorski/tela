import { redirect } from "next/navigation";

// Per Phase 14 P2: legacy /admin/stylist was a single textarea. We replaced
// it with /admin/{rules, examples, prompts}. Redirect preserves the legacy
// URL for bookmark compat.
export default function StylistPage() {
  redirect("/admin/rules");
}
