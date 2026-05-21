/**
 * Privacy Policy page — telastyle.app/privacy
 *
 * Content is the legally reviewed Tela Privacy Policy. When updating:
 *   1. Pull the latest .docx from legal
 *   2. Edit the prose below to match (verify quotes, em-dashes preserved)
 *   3. Update LAST_UPDATED if material; update EFFECTIVE only on republish
 *   4. Run `pnpm verify`
 *
 * Cross-references to other policy URLs (/cookies, /biometric-policy,
 * /dmca) are live — make sure those pages stay in sync if the URL plan
 * changes.
 */
import type { Metadata } from 'next';
import {
  A, ContactBlock, EffectiveLine, Em, H2, H3, LegalArticle, LI, P, PageTitle,
  Section, Strong, TableWrap, TBody, TD, TH, THead, TR, UL,
} from '../_components/typography';

const EFFECTIVE = 'May 21, 2026';
const LAST_UPDATED = 'May 21, 2026';

export const metadata: Metadata = {
  title: 'Privacy Policy — tela',
  description: 'How tela collects, uses, shares, and protects your personal information.',
};

export default function PrivacyPolicyPage() {
  return (
    <LegalArticle>
      <PageTitle>Privacy Policy</PageTitle>
      <EffectiveLine effective={EFFECTIVE} updated={LAST_UPDATED} />

      <Section>
        <P>
          This Privacy Policy explains how Tela collects, uses, shares, and protects your personal
          information. It is written in plain English on purpose. If anything is unclear, email{' '}
          <A href="mailto:privacy@telastyle.app">privacy@telastyle.app</A> and we will do our best
          to clarify.
        </P>
      </Section>

      <Section>
        <H2>Who we are</H2>
        <P>
          Tela is a personal AI stylist available at telastyle.app. It is operated by Luke Gorski,
          an individual doing business as &ldquo;Tela&rdquo; (&ldquo;Tela,&rdquo; &ldquo;we,&rdquo;{' '}
          &ldquo;us,&rdquo; or &ldquo;our&rdquo;), operating from Mexico City, Mexico (mailing
          address in Illinois, United States). Luke Gorski is the data controller for the personal
          information described below.
        </P>
        <P>
          If you have any privacy question — about your data, your rights, or this policy — write
          to <A href="mailto:privacy@telastyle.app">privacy@telastyle.app</A>. We aim to respond to
          every privacy inquiry promptly.
        </P>
      </Section>

      <Section>
        <H2>What Tela does, in one paragraph</H2>
        <P>
          You upload photos of clothes you already own. Tela&rsquo;s AI analyzes each item
          (category, colors, material, formality, occasion), then recommends outfits from your
          wardrobe based on weather, your style preferences, and where you are going. You can chat
          with an AI stylist, save outfits you like, mark outfits you wore, and — if you opt in —
          generate &ldquo;virtual try-on&rdquo; images that show an outfit on a generic model or on
          a body photo you upload of yourself.
        </P>
      </Section>

      <Section>
        <H2>What we collect</H2>
        <P>
          We only collect what we need to make Tela work. The categories below describe the
          personal information we currently collect; we will update this policy if we add new
          categories.
        </P>

        <H3>Account information</H3>
        <UL>
          <LI>Email address (required to create an account).</LI>
          <LI>
            Password — handled and hashed by our authentication provider, Supabase. Tela never sees
            your raw password.
          </LI>
          <LI>
            If you sign in with Google: your Google user ID, email, name, and profile picture URL.
          </LI>
          <LI>Display name and avatar URL.</LI>
          <LI>
            Preferred language (one of 15) and an internal admin flag (for our staff only).
          </LI>
        </UL>

        <H3>Style and lifestyle preferences</H3>
        <UL>
          <LI>
            Style keywords (e.g., &ldquo;Minimalist,&rdquo; &ldquo;Classic&rdquo;), favorite and
            avoided colors, formality preference, lifestyle category.
          </LI>
          <LI>
            Body information you choose to enter: body type (you pick from a list), height (text),
            fit preference.
          </LI>
          <LI>
            Location: city + country, latitude/longitude (used only to fetch weather), timezone,
            and temperature unit (C/F). We use Google Maps for city autocomplete; we do not
            collect precise GPS.
          </LI>
        </UL>

        <H3>Wardrobe data</H3>
        <UL>
          <LI>Photos of clothing items you upload.</LI>
          <LI>
            AI-generated analysis of each item (category, colors as hex codes, material, formality,
            occasions, seasons).
          </LI>
          <LI>Whether the image was background-removed or otherwise enhanced.</LI>
        </UL>

        <H3>Outfit data</H3>
        <UL>
          <LI>Outfits you configure or save, with their context tags.</LI>
          <LI>AI-generated outfit images.</LI>
          <LI>Your feedback: saved, worn, ratings.</LI>
          <LI>An AI-generated &ldquo;wardrobe assessment&rdquo; text.</LI>
        </UL>

        <H3>Try-on data (only if you opt in)</H3>
        <UL>
          <LI>Your try-on settings (background style, model choice).</LI>
          <LI>
            If you choose &ldquo;try on me,&rdquo; the full-body photo you upload of yourself.{' '}
            <Strong>This is sensitive data.</Strong> See the dedicated section below.
          </LI>
          <LI>AI-generated try-on images.</LI>
        </UL>

        <H3>Chat data</H3>
        <UL>
          <LI>
            Your full chat history with the AI stylist, including any photos you attach and
            outfits referenced in the thread. You can delete individual threads or clear your
            entire chat history with one click from Settings at any time.
          </LI>
        </UL>

        <H3>Derived data</H3>
        <UL>
          <LI>
            A &ldquo;style profile&rdquo; / &ldquo;style DNA&rdquo; that the AI generates from
            your activity (text plus structured dimensions).
          </LI>
          <LI>
            Internal prompt-execution traces for debugging (prompt version, model, cost, latency)
            — these do not include your account identity beyond an internal user ID.
          </LI>
        </UL>

        <H3>Technical and behavioral data</H3>
        <UL>
          <LI>An event log of actions you take inside Tela.</LI>
          <LI>
            Error reports captured server-side by Sentry. We configure Sentry to scrub personally
            identifiable information from breadcrumbs and stack traces before they are
            transmitted; the only user identifier retained is an internal user ID needed to triage
            a bug.
          </LI>
          <LI>Server access logs from Railway, including IP address, user agent, and timestamps.</LI>
        </UL>

        <H3>Advertising and marketing data</H3>
        <UL>
          <LI>
            Pixel events sent to advertising partners (currently Meta, TikTok, and Pinterest):
            PageView, Sign Up, and a small number of custom milestones such as &ldquo;first photo
            upload,&rdquo; &ldquo;first outfit generated,&rdquo; &ldquo;first try-on,&rdquo; and
            return-visit events.
          </LI>
          <LI>
            The data attached to those events: pseudonymous browser/device IDs, IP address, user
            agent, referral source, click identifiers (such as fbclid, ttclid), and event
            timestamps.
          </LI>
          <LI>
            If you sign up, we may upload a SHA-256-hashed version of your email to Meta, TikTok,
            or Pinterest to build Custom Audiences and &ldquo;lookalike&rdquo; audiences — only
            after we have verified that you have not exercised an opt-out (where opt-out is the
            standard) and that you have given consent where consent is required.
          </LI>
          <LI>
            At launch, Tela uses only browser-side pixels. We may enable server-side delivery
            (Meta&rsquo;s Conversions API, TikTok&rsquo;s Events API, Pinterest&rsquo;s
            Conversions API) in the future; we will update this policy and the Cookie Policy
            before doing so, and the same opt-out and consent rules will apply.
          </LI>
        </UL>

        <H3>What we do NOT collect</H3>
        <UL>
          <LI>We do not currently take payment information, because Tela is free today.</LI>
          <LI>We do not collect precise GPS — only city-level location.</LI>
          <LI>We do not knowingly collect data from children under 13.</LI>
          <LI>
            We do not collect health, financial, religious, sexual orientation, political, or
            other special-category data.
          </LI>
          <LI>
            We do not use cameras, voiceprints, fingerprints, or any traditional biometric
            scanners.
          </LI>
          <LI>
            We do not buy data about you from data brokers. We do not sell your personal
            information for money. We do, however, &ldquo;share&rdquo; certain identifiers and
            online activity for cross-context behavioral advertising as that term is defined under
            California&rsquo;s CPRA — see &ldquo;Who we share your data with&rdquo; and the
            California Annex for details and your opt-out rights.
          </LI>
        </UL>
      </Section>

      <Section>
        <H2>Body photos and biometric law</H2>
        <P>
          If you use the &ldquo;try on me&rdquo; feature, you upload a photo of your body. We
          treat this as sensitive personal data under GDPR Article 9 and LGPD Article 5. The photo
          is sent to our try-on AI provider, Fashn, for the sole purpose of generating your try-on
          image. Fashn&rsquo;s API documentation states that &ldquo;all inputs and outputs across
          all endpoints are automatically deleted after 72 hours to ensure privacy and
          security.&rdquo; The copy Tela keeps in your account is yours to delete whenever you
          want from your wardrobe settings, and Tela will also automatically delete any body photo
          after 30 days of inactivity on your account.
        </P>
        <P>
          We do not use any of your photos to identify you, verify your identity, build a profile
          of &ldquo;who you are&rdquo; from your face or body, or sell or share images with
          advertisers. Body photos are never sent to advertising partners.
        </P>
        <P>
          <Strong>Illinois residents:</Strong> Illinois&rsquo;s Biometric Information Privacy Act
          (&ldquo;BIPA&rdquo;) regulates the collection of &ldquo;biometric identifiers.&rdquo;
          Tela does not believe that uploading a photo of your body to visualize clothing
          constitutes a &ldquo;scan of hand or face geometry&rdquo; within BIPA&rsquo;s
          definition, but the law is unsettled when applied to virtual try-on. To remove
          ambiguity, Tela disables the &ldquo;try on me&rdquo; feature for users we detect as
          being in Illinois. We have also adopted a written biometric data retention and
          destruction schedule published at{' '}
          <A href="/biometric-policy">telastyle.app/biometric-policy</A>. We obtain your separate,
          written consent before processing any body photo, and we do not sell, lease, trade, or
          otherwise profit from any image of your body.
        </P>
      </Section>

      <Section>
        <H2>How we use your data</H2>
        <P>We use your data only for these purposes:</P>
        <UL>
          <LI>
            <Strong>To run Tela.</Strong> Storing your wardrobe, generating outfit recommendations,
            producing try-on images, and powering the chat stylist. (Legal basis under GDPR:
            performance of our contract with you. Try-on body photos: your explicit consent.)
          </LI>
          <LI>
            <Strong>To improve recommendations</Strong> for you, by learning from the outfits you
            save, wear, or rate. We use chat content only to improve recommendations for you; we
            do not use it to train any general-purpose AI model.
          </LI>
          <LI>
            <Strong>To keep Tela secure and working,</Strong> including error tracking and abuse
            prevention. (Legal basis under GDPR: our legitimate interest in operating a secure
            service.)
          </LI>
          <LI>
            <Strong>To send transactional emails</Strong> like welcome and password reset (via
            Resend, planned). We do not send marketing emails today. If we ever do, EU/UK users
            will be asked to opt in.
          </LI>
          <LI>
            <Strong>To measure and grow.</Strong> We use Meta, TikTok, and Pinterest pixels to
            understand which ads brought new users to Tela. In the EU/UK, this requires your
            opt-in consent via our cookie banner. In California and other US states with an
            opt-out model, you can opt out at any time via &ldquo;Do Not Sell or Share My Personal
            Information&rdquo; in the footer and by enabling Global Privacy Control.
          </LI>
        </UL>
        <P>
          We do not use your photos, outfits, or chats to train any general-purpose AI model. Our
          AI providers — OpenAI and Fashn — are contractually prohibited from using data sent
          through their APIs to train their own models by default.
        </P>
      </Section>

      <Section>
        <H2>Who we share your data with</H2>
        <P>
          We work with a small set of vendors (&ldquo;subprocessors&rdquo;). Each one only
          receives the data it needs to do its job.
        </P>
        <TableWrap>
          <THead>
            <TR>
              <TH>Vendor</TH>
              <TH>Location</TH>
              <TH>What it receives</TH>
              <TH>Why</TH>
            </TR>
          </THead>
          <TBody>
            <TR>
              <TD>Supabase</TD>
              <TD>United States</TD>
              <TD>Account data, all database records, all photos</TD>
              <TD>Database, authentication, file storage</TD>
            </TR>
            <TR>
              <TD>Railway</TD>
              <TD>United States</TD>
              <TD>Server logs, request data</TD>
              <TD>Hosting our web and API services</TD>
            </TR>
            <TR>
              <TD>Doppler</TD>
              <TD>United States</TD>
              <TD>No user data</TD>
              <TD>Secrets management</TD>
            </TR>
            <TR>
              <TD>OpenAI</TD>
              <TD>United States</TD>
              <TD>Wardrobe item photos, chat text, prompts</TD>
              <TD>AI vision analysis, chat, outfit image generation</TD>
            </TR>
            <TR>
              <TD>Fashn</TD>
              <TD>United States / EU</TD>
              <TD>Item photos, body photo (if you opt in)</TD>
              <TD>Virtual try-on generation</TD>
            </TR>
            <TR>
              <TD>Sentry</TD>
              <TD>United States</TD>
              <TD>Server errors; may include internal user IDs</TD>
              <TD>Error monitoring</TD>
            </TR>
            <TR>
              <TD>Google Maps Platform</TD>
              <TD>United States</TD>
              <TD>City search queries you type</TD>
              <TD>Location autocomplete</TD>
            </TR>
            <TR>
              <TD>Open-Meteo</TD>
              <TD>EU (Germany)</TD>
              <TD>Latitude/longitude only</TD>
              <TD>Weather forecast</TD>
            </TR>
            <TR>
              <TD>Resend (planned)</TD>
              <TD>United States</TD>
              <TD>Email address and email content</TD>
              <TD>Transactional email delivery</TD>
            </TR>
            <TR>
              <TD>Meta Platforms (Facebook, Instagram)</TD>
              <TD>United States / EU</TD>
              <TD>Pixel events, hashed email (if you consent)</TD>
              <TD>Ad measurement, retargeting, lookalikes</TD>
            </TR>
            <TR>
              <TD>TikTok / ByteDance</TD>
              <TD>Singapore / United States</TD>
              <TD>Pixel events, hashed email (if you consent)</TD>
              <TD>Ad measurement, retargeting</TD>
            </TR>
            <TR>
              <TD>Pinterest</TD>
              <TD>United States</TD>
              <TD>Tag events, hashed email (if you consent)</TD>
              <TD>Ad measurement, retargeting</TD>
            </TR>
            <TR>
              <TD>Future partners (Snapchat, Reddit, X, YouTube, Google Ads)</TD>
              <TD>Various</TD>
              <TD>Pixel events when enabled</TD>
              <TD>Ad measurement, retargeting</TD>
            </TR>
            <TR>
              <TD>Firebase / Google Cloud Storage (legacy)</TD>
              <TD>United States</TD>
              <TD>Migrated copies during cutover</TD>
              <TD>Transitional storage; deleted after migration</TD>
            </TR>
          </TBody>
        </TableWrap>
        <P>
          Each vendor&rsquo;s own privacy policy applies to its handling of the data we send. We
          link them in the <A href="/cookies">Cookie Policy</A>.
        </P>
        <P>
          We do not sell your personal information. We do &ldquo;share&rdquo; personal
          information for cross-context behavioral advertising as that term is defined under
          California&rsquo;s CPRA when our advertising pixels fire; you can opt out at any time
          (see &ldquo;Your rights&rdquo; below).
        </P>
      </Section>

      <Section>
        <H2>Advertising and marketing partners — the long version</H2>
        <P>This is the part of Tela that touches the most third parties, so we want to be specific.</P>
        <P>
          When you visit telastyle.app, we may load tracking pixels from Meta (Facebook Pixel),
          TikTok (TikTok Pixel), and Pinterest (Pinterest Tag). We may also enable similar pixels
          from Snapchat, Reddit, X, YouTube, and Google Ads in the future as we expand paid
          acquisition. We will keep this list updated in the <A href="/cookies">Cookie Policy</A>.
        </P>
        <P>What these tools do:</P>
        <UL>
          <LI>
            They report events (&ldquo;you visited the site,&rdquo; &ldquo;you signed up,&rdquo;{' '}
            &ldquo;you generated your first outfit&rdquo;) to the ad platform so it can attribute
            the event to an ad you clicked.
          </LI>
          <LI>
            They allow us to build Custom Audiences (people who already use Tela) and
            Lookalike/Similar Audiences (people who resemble our users) by uploading
            SHA-256-hashed versions of email addresses. Tela never sends raw email addresses.
            Before each Custom Audience upload, we filter out users who have exercised a CPRA
            opt-out, sent a Global Privacy Control signal, or who have not given GDPR/UK GDPR
            consent.
          </LI>
          <LI>They allow the ad platform to retarget you with Tela ads across its network.</LI>
        </UL>
        <P>
          In the EU, UK, and EEA, we do not load any of these pixels until you opt in through the
          cookie banner. We pass your consent state to Meta and Google via Consent Mode v2 and to
          TikTok via its consent signal.
        </P>
        <P>In California and other US states with cross-context behavioral advertising opt-out rights, we honor:</P>
        <UL>
          <LI>The &ldquo;Do Not Sell or Share My Personal Information&rdquo; link in the footer.</LI>
          <LI>
            The Global Privacy Control (GPC) browser signal — read server-side on every request
            and persisted to your account when you are logged in.
          </LI>
          <LI>
            Meta&rsquo;s Limited Data Use flag for users we detect in California and other
            applicable US states who have opted out.
          </LI>
        </UL>
        <P>
          If you opt out, we stop sharing your event data with advertising platforms for behavioral
          advertising and instruct Meta to treat your data as a service provider only via the
          Limited Data Use flag.
        </P>
      </Section>

      <Section>
        <H2>AI processing disclosure</H2>
        <P>Tela uses third-party AI to generate the experience:</P>
        <UL>
          <LI>
            <Strong>OpenAI</Strong> processes your wardrobe photos for vision analysis, runs the
            AI chat stylist, and generates outfit images. Under the OpenAI API terms applicable to
            us, OpenAI does not use API inputs or outputs to train its models by default.
          </LI>
          <LI>
            <Strong>Fashn</Strong> generates virtual try-on images. Fashn states publicly that{' '}
            &ldquo;all inputs and outputs across all endpoints are automatically deleted after 72
            hours&rdquo; and that &ldquo;only anonymized request logs are kept for analytics, with
            no user-provided data retained beyond this timeframe.&rdquo; We pass garment images
            and, if you opt in, your uploaded body photo.
          </LI>
        </UL>
        <P>
          AI-generated outputs — outfit recommendations, try-on images, the chat stylist&rsquo;s
          advice, the &ldquo;style DNA&rdquo; — are produced by statistical models. They can be
          wrong, biased, or oddly worded. They are not professional fashion or styling advice. Use
          your own judgment.
        </P>
      </Section>

      <Section>
        <H2>Cookies and tracking</H2>
        <P>
          A short summary lives here; the full <A href="/cookies">Cookie Policy</A> has the
          detail.
        </P>
        <P>We use two categories of cookies and similar technologies:</P>
        <UL>
          <LI>
            <Strong>Strictly necessary:</Strong> cookies that keep you logged in, remember your
            language, and protect against abuse. These are always on; you cannot disable them and
            still use Tela.
          </LI>
          <LI>
            <Strong>Advertising:</Strong> pixels and identifiers from Meta, TikTok, Pinterest (and
            future partners). Off by default in the EU/UK. Opt-out available everywhere via the
            banner, the footer link, and GPC.
          </LI>
        </UL>
        <P>
          We do not run third-party web analytics (no Google Analytics, no PostHog, no Mixpanel,
          no Amplitude, no Segment).
        </P>
      </Section>

      <Section>
        <H2>Data retention</H2>
        <UL>
          <LI>
            <Strong>Account data:</Strong> kept while your account is active.
          </LI>
          <LI>
            <Strong>Account deletion:</Strong> when you delete your account, your data is removed
            from our primary systems within 30 days. Encrypted backups roll off on a 90-day cycle,
            after which the deleted data is also gone.
          </LI>
          <LI>
            <Strong>Chat history:</Strong> kept for the life of the account; you can clear
            individual threads or your entire chat history at any time from Settings.
          </LI>
          <LI>
            <Strong>Try-on body photos:</Strong> kept for 30 days of inactivity, after which they
            are automatically deleted. You can also delete any body photo at any time in your
            settings, and we recommend doing so once you no longer need it. Fashn deletes its copy
            within 72 hours of processing.
          </LI>
          <LI>
            <Strong>Biometric data retention schedule (Illinois BIPA):</Strong> to the extent any
            image we collect is later determined to contain a &ldquo;biometric identifier,&rdquo;
            Tela&rsquo;s written retention policy is to delete that data upon the earlier of (a)
            the date you delete your account or the image, or (b) within three years of your last
            interaction with Tela. The full schedule is published at{' '}
            <A href="/biometric-policy">telastyle.app/biometric-policy</A>.
          </LI>
          <LI>
            <Strong>Ad pixel data:</Strong> retention is controlled by the ad platform. Meta
            currently retains event-level data for up to 180 days; TikTok and Pinterest publish
            their own retention windows. Aggregated reporting is retained longer.
          </LI>
          <LI>
            <Strong>Server logs and error reports:</Strong> retained for up to 90 days.
          </LI>
        </UL>
      </Section>

      <Section>
        <H2>Your rights</H2>
        <P>
          Everyone, everywhere, has the following rights with Tela: see what we have about you
          (access / export); correct anything that is wrong; delete your account and your data;
          get a portable copy of your data.
        </P>
        <P>
          You can exercise any of these rights by emailing{' '}
          <A href="mailto:privacy@telastyle.app">privacy@telastyle.app</A> or by using the in-app
          Settings → Privacy controls (data export and account deletion). We will respond within
          the timeframe required by applicable law (generally 30 days under the GDPR/LGPD and 45
          days under the CCPA/CPRA, with extensions where permitted).
        </P>
        <P>
          <Strong>If you are in the EU, UK, EEA, or Switzerland</Strong> — your rights under the
          GDPR and UK GDPR include access, rectification, erasure, restriction of processing,
          data portability, objection (including to advertising and profiling), and withdrawal of
          consent at any time. You can lodge a complaint with your national supervisory authority.
          Our legal bases are described in &ldquo;How we use your data.&rdquo;
        </P>
        <P>
          <Strong>If you are in California (CCPA / CPRA)</Strong> — see the California Annex
          below for the full list of rights, including the right to opt out of &ldquo;sharing&rdquo;
          for cross-context behavioral advertising, the right to limit use of sensitive personal
          information, and the right to be free from retaliation for exercising your rights.
        </P>
        <P>
          <Strong>If you are in another US state with a comprehensive privacy law</Strong> — see
          the US State Privacy Annex below.
        </P>
        <P>
          <Strong>If you are in Brazil (LGPD)</Strong> — see the Brazil Annex below. The
          supervisory authority is the ANPD (Autoridade Nacional de Proteção de Dados).
        </P>
        <P>
          <Strong>
            If you are in Mexico, Argentina, Colombia, Chile, Peru, Uruguay, Costa Rica, Ecuador,
            or Panama
          </Strong>{' '}
          — see the Latin America Annex below.
        </P>
      </Section>

      <Section>
        <H2>Security</H2>
        <P>
          We use industry-standard safeguards: HTTPS everywhere, encryption at rest in Supabase,
          hashed passwords, scoped vendor access, secrets isolated in Doppler, and PII scrubbing
          applied to error reports before they leave our infrastructure. No system is perfectly
          secure. If we experience a data breach affecting your personal information, we will
          notify you and the relevant supervisory authorities as required by, and within the
          timeframes specified by, applicable law (for example, without undue delay and, where
          feasible, within 72 hours of becoming aware under the GDPR).
        </P>
      </Section>

      <Section>
        <H2>International data transfers</H2>
        <P>
          Tela is operated from the United States and most of our subprocessors are also US-based.
          When we receive personal data from the EU, UK, EEA, Switzerland, Brazil, or another
          country with cross-border restrictions, we rely on Standard Contractual Clauses (SCCs)
          where the destination is not covered by an adequacy decision, plus supplementary
          technical and organizational measures. For Brazilian users we also rely on your consent
          and the contractual-performance basis under LGPD Article 33.
        </P>
      </Section>

      <Section>
        <H2>Children</H2>
        <P>
          Tela is not directed to children under 13, and you must be at least 13 to use it (16
          where required by local law, including the GDPR&rsquo;s higher age of consent
          jurisdictions). Tela does not knowingly collect personal information from children under
          13 in violation of the U.S. Children&rsquo;s Online Privacy Protection Act (COPPA), 15
          U.S.C. §§ 6501–6506. If you are a parent or guardian and believe a child under 13 has
          provided personal information to Tela, email{' '}
          <A href="mailto:privacy@telastyle.app">privacy@telastyle.app</A> and we will promptly
          delete the account and associated data.
        </P>
      </Section>

      <Section>
        <H2>Changes to this policy</H2>
        <P>
          When we materially change how we handle your data, we will notify you by email (where we
          have one) and by an in-app notice at least 14 days before the change takes effect,
          except where the change is required by law. The &ldquo;Last updated&rdquo; date at the
          top is always current.
        </P>
      </Section>

      <Section>
        <H2>Contact</H2>
        <ContactBlock>
          {`Luke Gorski, doing business as Tela
Illinois, United States
Email: `}
          <A href="mailto:privacy@telastyle.app">privacy@telastyle.app</A>
        </ContactBlock>
      </Section>

      <Section>
        <H2>California Annex (CCPA / CPRA)</H2>
        <P>
          <Strong>Categories of personal information collected</Strong> in the last 12 months
          (using the CPRA categories): identifiers (email, IP, device ID, Google ID), customer
          records (display name), commercial information (none currently; future paid tiers will
          add this), internet/network activity (event log, error reports), geolocation (city-level
          only), visual information (uploaded photos), inferences (style profile), and sensitive
          personal information (account credentials handled by Supabase; if you opt in, &ldquo;try
          on me&rdquo; body photos).
        </P>
        <P>
          <Strong>Categories disclosed for a business purpose:</Strong> identifiers,
          internet/network activity, and visual information are disclosed to the subprocessors
          listed above to operate Tela.
        </P>
        <P>
          <Strong>Categories &ldquo;sold&rdquo; or &ldquo;shared&rdquo; for cross-context
          behavioral advertising:</Strong>{' '}
          we do not sell personal information. We do share identifiers, internet/network activity,
          and hashed contact identifiers with Meta, TikTok, and Pinterest for cross-context
          behavioral advertising, unless you opt out.
        </P>
        <P>
          <Strong>Your California rights:</Strong>
        </P>
        <UL>
          <LI>
            Right to know the categories and specific pieces of personal information we have about
            you.
          </LI>
          <LI>Right to delete.</LI>
          <LI>Right to correct.</LI>
          <LI>
            Right to opt out of &ldquo;sharing&rdquo; — exercise via the &ldquo;Do Not Sell or
            Share My Personal Information&rdquo; link in the footer, the cookie banner, or by
            enabling GPC. We treat a valid GPC signal as an opt-out.
          </LI>
          <LI>Right to limit use of sensitive personal information.</LI>
          <LI>Right to non-discrimination for exercising your rights.</LI>
        </UL>
        <P>
          We do not knowingly sell or share the personal information of California consumers under
          16 years of age without affirmative opt-in consent as required by Cal. Civ. Code §
          1798.120(c).
        </P>
        <P>
          <Strong>Shine the Light.</Strong> California Civil Code § 1798.83 permits California
          residents to request information about disclosures of personal information to third
          parties for those parties&rsquo; direct marketing purposes. Tela does not currently
          share personal information with third parties for their direct marketing purposes.
        </P>
      </Section>

      <Section>
        <H2>US State Privacy Annex</H2>
        <P>
          Residents of Virginia, Colorado, Connecticut, Utah, Texas, Oregon, Indiana, Kentucky,
          Rhode Island, Tennessee, Montana, Delaware, New Hampshire, New Jersey, Iowa, Maryland,
          Minnesota, and Nebraska have, at a minimum, the rights to: confirm whether we process
          their data, access their data, correct inaccuracies, delete their data, obtain a
          portable copy, and opt out of targeted advertising / sale / profiling that produces
          legally significant effects. We do not engage in profiling that produces legal or
          similarly significant effects. We do engage in targeted advertising via the Meta,
          TikTok, and Pinterest pixels and you may opt out using the same &ldquo;Do Not Sell or
          Share My Personal Information&rdquo; link, the cookie banner, or by enabling GPC. We do
          not sell personal information for money. We do not process sensitive data without
          opt-in consent in states that require it (Virginia, Connecticut, Colorado, Indiana,
          Kentucky, Rhode Island, and others).
        </P>
        <P>
          Email <A href="mailto:privacy@telastyle.app">privacy@telastyle.app</A> to exercise any
          state right. You may appeal a denial by replying to our response with
          &ldquo;APPEAL&rdquo;; we will issue a new decision within 60 days and tell you how to
          contact your state Attorney General if you are still not satisfied.
        </P>
      </Section>

      <Section>
        <H2>EU / UK / EEA Annex (GDPR / UK GDPR)</H2>
        <P>
          <Strong>Controller:</Strong> Luke Gorski, doing business as Tela, Illinois, United
          States. Contact: <A href="mailto:privacy@telastyle.app">privacy@telastyle.app</A>.
        </P>
        <P>
          <Strong>EU and UK representative under GDPR/UK GDPR Article 27:</Strong> Because Tela
          offers services to EU and UK users and monitors their behavior through advertising
          pixels, we will appoint an EU representative and a UK representative as required by
          Article 27 of the GDPR and the UK GDPR. Their contact information will be published at
          telastyle.app/eu-representative and telastyle.app/uk-representative once appointed.
        </P>
        <P>
          <Strong>Lawful bases:</Strong> performance of contract for core service; legitimate
          interests for security and abuse prevention; consent for advertising cookies/pixels, the
          try-on body photo feature, and (in the future) marketing email.
        </P>
        <P>
          <Strong>Your rights:</Strong> access, rectification, erasure, restriction, portability,
          objection, withdrawal of consent, lodge a complaint with your supervisory authority.
        </P>
        <P>
          <Strong>International transfers:</Strong> SCCs in place where applicable.
        </P>
      </Section>

      <Section>
        <H2>Brazil Annex (LGPD)</H2>
        <P>
          <Strong>Controller:</Strong> Luke Gorski, doing business as Tela, Illinois, United
          States. Contact: <A href="mailto:privacy@telastyle.app">privacy@telastyle.app</A>.
        </P>
        <P>
          <Strong>Communication channel for data subjects:</Strong>{' '}
          <A href="mailto:privacy@telastyle.app">privacy@telastyle.app</A>. We provide a
          Portuguese-language version of this policy at telastyle.app/pt-BR/privacidade.
        </P>
        <P>
          <Strong>DPO (Encarregado):</Strong> Tela qualifies as a &ldquo;small processing
          agent&rdquo; under ANPD Resolution CD/ANPD No. 2/2022 and is therefore exempt from
          formally appointing a DPO. The privacy@telastyle.app channel is the channel required by
          Article 41 §4.
        </P>
        <P>
          <Strong>Legal bases under LGPD Article 7:</Strong> execution of contract (Art. 7, V);
          legitimate interest (Art. 7, IX) for security; consent (Art. 7, I) for advertising
          cookies and try-on body photos.
        </P>
        <P>
          <Strong>Your rights under LGPD Article 18:</Strong> confirmation, access, correction,
          anonymization or deletion, portability, deletion of data processed under consent,
          information about sharing, information about the option not to consent, revocation of
          consent.
        </P>
        <P>
          <Strong>Supervisory authority:</Strong> ANPD (Autoridade Nacional de Proteção de Dados).
        </P>
      </Section>

      <Section>
        <H2>Mexico Annex (LFPDPPP, as amended March 21, 2025)</H2>
        <P>
          This block is a simplified privacy notice (<Em>aviso de privacidad simplificado</Em>).
          The integral version is at telastyle.app/es/privacidad.
        </P>
        <UL>
          <LI>
            <Strong>Responsible party (responsable):</Strong> Luke Gorski, doing business as
            Tela, Illinois, United States.
          </LI>
          <LI>
            <Strong>Categories of personal data processed,</Strong> including sensitive data: as
            described above. Try-on body photos are sensitive.
          </LI>
          <LI>
            <Strong>Purposes:</Strong> providing the service, security, marketing measurement, and
            where applicable advertising. Advertising and try-on photos require your express
            consent.
          </LI>
          <LI>
            <Strong>Mechanisms to exercise ARCO rights</Strong> (Access, Rectification,
            Cancellation, Opposition) and to revoke consent: write to{' '}
            <A href="mailto:privacy@telastyle.app">privacy@telastyle.app</A>.
          </LI>
          <LI>
            <Strong>Where to find the integral notice:</Strong> telastyle.app/es/privacidad.
          </LI>
        </UL>
      </Section>

      <Section>
        <H2>Other Latin America Annex</H2>
        <P>
          For users in Argentina (Law 25.326), Colombia (Statutory Law 1581/2012), Chile (Law
          19.628 and, from December 1, 2026, Law 21.719), Peru (Law 29733), Uruguay (Law 18.331),
          Costa Rica (Law 8968), Ecuador (LOPDP, Law 459-2021), and Panama (Law 81/2019): you
          have rights of access, rectification, cancellation/erasure, and opposition (with
          country-specific variations including portability and habeas data) and the right to
          withdraw any consent you gave. The basis for processing is generally your express
          consent and the contract you enter into with us when you use Tela. Contact{' '}
          <A href="mailto:privacy@telastyle.app">privacy@telastyle.app</A>. Where required, we
          provide the policy in Spanish (telastyle.app/es/privacidad) and Portuguese
          (telastyle.app/pt-BR/privacidade).
        </P>
        <P>
          For Colombia specifically: where required by Decree 1377/2013, we will register the
          database with the SIC&rsquo;s National Database Registry (RNBD) once enrollment
          thresholds apply. For Chile: we have written this policy to satisfy Law 21.719 from day
          one so that no rewrite is needed when it takes effect on December 1, 2026.
        </P>
      </Section>
    </LegalArticle>
  );
}
