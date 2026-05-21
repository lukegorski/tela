/**
 * Typography primitives for the (legal) route group.
 *
 * These match the rest of the Tela design system:
 *   - Inter (loaded by (legal)/layout.tsx via next/font/google)
 *   - Neutral palette with first-class dark mode
 *   - Tracked-uppercase section headers, mirroring the SettingsMenu /
 *     page-header pattern used elsewhere in the app
 *   - Lowercase document title, mirroring the "tela" wordmark voice
 *
 * Used by every legal page (Privacy, Terms, Cookie, Biometric, DMCA).
 */
import type { ReactNode } from 'react';

export function PageTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="mt-4 text-3xl sm:text-4xl font-semibold tracking-tight lowercase text-neutral-900 dark:text-neutral-100">
      {children}
    </h1>
  );
}

export function EffectiveLine({ effective, updated }: { effective: string; updated?: string }) {
  return (
    <p className="mt-3 text-xs font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
      Effective: {effective}
      {updated ? (
        <>
          <span aria-hidden> · </span>
          Last updated: {updated}
        </>
      ) : null}
    </p>
  );
}

export function Section({ children }: { children: ReactNode }) {
  return <section className="mt-12 first:mt-8">{children}</section>;
}

export function H2({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-sm font-semibold tracking-widest uppercase text-neutral-400 dark:text-neutral-500 mb-4">
      {children}
    </h2>
  );
}

export function H3({ children }: { children: ReactNode }) {
  return (
    <h3 className="mt-6 mb-2 text-base font-semibold text-neutral-900 dark:text-neutral-100">
      {children}
    </h3>
  );
}

export function P({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm sm:text-base leading-relaxed text-neutral-700 dark:text-neutral-300 mt-3 first:mt-0">
      {children}
    </p>
  );
}

/** Inline emphasis used inside paragraphs. */
export function Strong({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-neutral-900 dark:text-neutral-100">{children}</strong>;
}

/** Inline emphasis used inside paragraphs (italic). */
export function Em({ children }: { children: ReactNode }) {
  return <em className="italic">{children}</em>;
}

/** Unstyled inline code, used for things like email addresses. */
export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="font-mono text-[0.9em] text-neutral-900 dark:text-neutral-100">{children}</code>
  );
}

export function UL({ children }: { children: ReactNode }) {
  return (
    <ul className="mt-3 list-disc pl-6 space-y-1.5 text-sm sm:text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
      {children}
    </ul>
  );
}

export function OL({ children }: { children: ReactNode }) {
  return (
    <ol className="mt-3 list-decimal pl-6 space-y-1.5 text-sm sm:text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
      {children}
    </ol>
  );
}

export function LI({ children }: { children: ReactNode }) {
  return <li>{children}</li>;
}

export function A({ href, children }: { href: string; children: ReactNode }) {
  const external = href.startsWith('http') || href.startsWith('mailto:');
  return (
    <a
      href={href}
      className="text-neutral-900 dark:text-neutral-100 underline underline-offset-2 decoration-neutral-300 dark:decoration-neutral-600 hover:decoration-neutral-900 dark:hover:decoration-neutral-100 transition-colors"
      {...(external ? { rel: 'noopener noreferrer' } : {})}
    >
      {children}
    </a>
  );
}

/** Quoted block. */
export function Quote({ children }: { children: ReactNode }) {
  return (
    <blockquote className="mt-4 border-l-2 border-neutral-300 dark:border-neutral-700 pl-4 italic text-sm sm:text-base leading-relaxed text-neutral-600 dark:text-neutral-400">
      {children}
    </blockquote>
  );
}

/** Wrapper for the body of a legal page (max-width column + spacing). */
export function LegalArticle({ children }: { children: ReactNode }) {
  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">{children}</article>
  );
}

/** Used for the "Contact" sign-off block at the bottom of each policy. */
export function ContactBlock({ children }: { children: ReactNode }) {
  return (
    <address className="mt-4 not-italic text-sm sm:text-base leading-relaxed text-neutral-700 dark:text-neutral-300 whitespace-pre-line">
      {children}
    </address>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Tables
// ────────────────────────────────────────────────────────────────────────

export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 -mx-4 sm:mx-0 overflow-x-auto">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-500 dark:text-neutral-400">
      {children}
    </thead>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TR({ children }: { children: ReactNode }) {
  return (
    <tr className="border-b border-neutral-200 dark:border-neutral-800 last:border-0">{children}</tr>
  );
}

export function TH({ children }: { children: ReactNode }) {
  return (
    <th className="text-left font-semibold uppercase tracking-wider text-[11px] px-3 py-2 align-top">
      {children}
    </th>
  );
}

export function TD({ children }: { children: ReactNode }) {
  return (
    <td className="px-3 py-3 align-top text-neutral-700 dark:text-neutral-300 leading-relaxed">
      {children}
    </td>
  );
}
