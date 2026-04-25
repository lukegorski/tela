"use client";

import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useDictionary } from "@/components/DictionaryProvider";

export default function LanguageSettingsContent() {
  const { dict, lang } = useDictionary();

  return (
    <>
      <h1 className="text-sm font-semibold tracking-widest uppercase mb-6">
        {dict.settings.language}
      </h1>
      <LanguageSwitcher currentLang={lang} />
    </>
  );
}
