/**
 * Cookie Policy page — telastyle.app/cookies
 *
 * Content is the legally reviewed Tela Cookie Policy.
 */
import type { Metadata } from 'next';
import {
  A, ContactBlock, EffectiveLine, H2, H3, LegalArticle, LI, P, PageTitle, Section, Strong,
  TableWrap, TBody, TD, TH, THead, TR, UL,
} from '../_components/typography';

const EFFECTIVE = 'May 21, 2026';
const LAST_UPDATED = 'May 21, 2026';

export const metadata: Metadata = {
  title: 'Cookie Policy — tela',
  description: 'Cookies, pixels, and similar technologies tela uses on telastyle.app and how to control them.',
};

export default function CookiePolicyPage() {
  return (
    <LegalArticle>
      <PageTitle>Cookie Policy</PageTitle>
      <EffectiveLine effective={EFFECTIVE} updated={LAST_UPDATED} />

      <Section>
        <P>
          This Cookie Policy explains the cookies and similar technologies (pixels, tags, SDKs,
          and local storage) that Tela uses on telastyle.app, what they do, and how you can
          control them. It supplements the Tela <A href="/privacy">Privacy Policy</A>. Read both
          together.
        </P>
        <P>
          &ldquo;Tela,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; and &ldquo;our&rdquo; mean Luke
          Gorski, an individual doing business as &ldquo;Tela,&rdquo; operating from Mexico City,
          Mexico (mailing address in Illinois, United States). If you have any question about
          this policy, write to <A href="mailto:privacy@telastyle.app">privacy@telastyle.app</A>.
        </P>
      </Section>

      <Section>
        <H2>What cookies and similar technologies are</H2>
        <P>
          Cookies are small text files that a website stores on your device so it can remember
          information about your visit. &ldquo;Similar technologies&rdquo; include tracking pixels
          (1×1 images that report back to an ad platform), software development kits (SDKs),
          browser local storage, and server-to-server event APIs that achieve the same effect
          without a file on your device.
        </P>
        <P>
          When this policy says &ldquo;cookies,&rdquo; we mean all of these technologies together.
        </P>
      </Section>

      <Section>
        <H2>The two categories we use</H2>
        <P>
          Tela uses only two categories of cookies. We do not run any third-party web analytics
          today (no Google Analytics, no PostHog, no Mixpanel, no Amplitude, no Segment).
        </P>

        <H3>Strictly necessary cookies</H3>
        <P>
          These cookies are required for telastyle.app to function. They keep you logged in,
          remember your language preference, and protect against abuse and fraud. You cannot turn
          them off without breaking the site, and they are never used for advertising. We do not
          ask for consent to set strictly necessary cookies because they are exempt from consent
          requirements under the ePrivacy Directive and equivalent laws.
        </P>

        <H3>Advertising cookies and pixels</H3>
        <P>
          These cookies and pixels let our advertising partners measure how you arrived at Tela
          and, where permitted, show you Tela ads on their platforms. They include the Meta Pixel
          (Facebook and Instagram), the TikTok Pixel, and the Pinterest Tag. We may add Snapchat,
          Reddit, X, YouTube, and Google Ads pixels in the future; this policy will be updated
          before we do.
        </P>
        <P>
          In the EU, UK, and EEA, advertising cookies are off by default and load only after you
          opt in through the cookie banner. In California and other US states with cross-context
          behavioral advertising opt-out rights, advertising cookies are on by default but can be
          turned off at any time via the &ldquo;Do Not Sell or Share My Personal Information&rdquo;
          footer link, the cookie banner, or by enabling Global Privacy Control (GPC) in your
          browser. Elsewhere, advertising cookies follow the opt-out standard.
        </P>
      </Section>

      <Section>
        <H2>Per-vendor details</H2>
        <TableWrap>
          <THead>
            <TR>
              <TH>Vendor</TH>
              <TH>What it does</TH>
              <TH>Type</TH>
              <TH>Typical retention</TH>
              <TH>Vendor privacy policy</TH>
              <TH>How to opt out</TH>
            </TR>
          </THead>
          <TBody>
            <TR>
              <TD>Tela (first-party)</TD>
              <TD>Login session, language preference, security tokens</TD>
              <TD>First-party cookies</TD>
              <TD>Session to 1 year</TD>
              <TD>
                <A href="/privacy">telastyle.app/privacy</A>
              </TD>
              <TD>Essential — cannot be disabled</TD>
            </TR>
            <TR>
              <TD>Supabase</TD>
              <TD>Authentication session token</TD>
              <TD>First-party cookie</TD>
              <TD>Session to 1 year</TD>
              <TD>
                <A href="https://supabase.com/privacy">supabase.com/privacy</A>
              </TD>
              <TD>Essential — cannot be disabled</TD>
            </TR>
            <TR>
              <TD>Meta (Facebook Pixel)</TD>
              <TD>Ad measurement and retargeting for Facebook and Instagram</TD>
              <TD>Third-party pixel</TD>
              <TD>Up to 180 days for event-level data</TD>
              <TD>
                <A href="https://facebook.com/privacy/policy">facebook.com/privacy/policy</A>
              </TD>
              <TD>Cookie banner; &ldquo;Do Not Sell or Share&rdquo; link; GPC; Meta Limited Data Use</TD>
            </TR>
            <TR>
              <TD>TikTok Pixel</TD>
              <TD>Ad measurement and retargeting for TikTok</TD>
              <TD>Third-party pixel</TD>
              <TD>Up to 180 days for event-level data</TD>
              <TD>
                <A href="https://www.tiktok.com/legal/privacy-policy">tiktok.com/legal/privacy-policy</A>
              </TD>
              <TD>Cookie banner; &ldquo;Do Not Sell or Share&rdquo; link; GPC</TD>
            </TR>
            <TR>
              <TD>Pinterest Tag</TD>
              <TD>Ad measurement and retargeting for Pinterest</TD>
              <TD>Third-party pixel</TD>
              <TD>Up to 365 days for event-level data</TD>
              <TD>
                <A href="https://policy.pinterest.com/privacy-policy">policy.pinterest.com/privacy-policy</A>
              </TD>
              <TD>Cookie banner; &ldquo;Do Not Sell or Share&rdquo; link; GPC</TD>
            </TR>
            <TR>
              <TD>Future partners (Snapchat, Reddit, X, YouTube, Google Ads)</TD>
              <TD>Same as above when enabled</TD>
              <TD>Third-party pixels</TD>
              <TD>Per vendor</TD>
              <TD>Per vendor</TD>
              <TD>Cookie banner; &ldquo;Do Not Sell or Share&rdquo; link; GPC</TD>
            </TR>
          </TBody>
        </TableWrap>
        <P>
          The table above lists each vendor whose cookie or pixel we currently use, what it does,
          how long it persists, and where to find the vendor&rsquo;s own privacy policy. We will
          update this table whenever we add or remove a vendor.
        </P>
      </Section>

      <Section>
        <H2>Custom Audiences and hashed email uploads</H2>
        <P>
          If you sign up for Tela, we may upload a SHA-256-hashed version of your email address
          to Meta, TikTok, or Pinterest to build Custom Audiences (people who already use Tela)
          and Lookalike/Similar Audiences (people who resemble our users). Tela never sends raw
          email addresses to advertising partners.
        </P>
        <P>
          Before each Custom Audience upload, we filter out users who have exercised a CPRA
          opt-out, sent a Global Privacy Control signal, or who have not given GDPR/UK GDPR
          consent. You can opt out of Custom Audience inclusion at any time by following the{' '}
          &ldquo;How to manage your preferences&rdquo; steps below.
        </P>
      </Section>

      <Section>
        <H2>How to manage your preferences</H2>
        <P>
          You have several controls. They all work, and they all persist across sessions when you
          are logged in.
        </P>

        <H3>Cookie banner</H3>
        <P>
          The first time you visit telastyle.app, you see a banner with three buttons: &ldquo;Accept
          all,&rdquo; &ldquo;Reject non-essential,&rdquo; and &ldquo;Customize.&rdquo; In the EU,
          UK, and EEA, advertising cookies do not load until you click &ldquo;Accept all&rdquo; or
          choose them in &ldquo;Customize.&rdquo; In the US and elsewhere, advertising cookies
          are on by default and the banner offers you a one-click opt-out.
        </P>
        <P>
          You can re-open the banner at any time from the &ldquo;Cookie settings&rdquo; link in
          the website footer.
        </P>

        <H3>&ldquo;Do Not Sell or Share My Personal Information&rdquo; footer link</H3>
        <P>
          The &ldquo;Do Not Sell or Share My Personal Information&rdquo; link in our footer is
          available on every page. Clicking it records your opt-out, immediately stops further
          sharing of your event data with advertising platforms, and triggers Meta&rsquo;s
          Limited Data Use flag and equivalent signals at TikTok and Pinterest.
        </P>

        <H3>Global Privacy Control (GPC)</H3>
        <P>
          If your browser sends a Global Privacy Control signal, we treat it as a valid opt-out
          of &ldquo;sharing&rdquo; for cross-context behavioral advertising under the CPRA and
          the comprehensive privacy laws of Connecticut, Colorado, Delaware, Maryland, Minnesota,
          Montana, New Jersey, New Hampshire, Oregon, and Texas. We read the GPC signal
          server-side on every request and persist it to your account when you are logged in.
        </P>
        <P>
          You can enable GPC in browsers like Firefox, Brave, and DuckDuckGo, or through
          extensions for Chrome and Safari.
        </P>

        <H3>Browser controls</H3>
        <P>
          Most browsers let you block or delete cookies through their settings menu. Doing so may
          break parts of Tela that rely on strictly necessary cookies (for example, you will be
          signed out).
        </P>

        <H3>Ad platform controls</H3>
        <P>
          You can also opt out directly at each advertising platform, independent of any choice
          you make on telastyle.app:
        </P>
        <UL>
          <LI>
            <Strong>Meta:</Strong>{' '}
            <A href="https://www.facebook.com/adpreferences">facebook.com/adpreferences</A>
          </LI>
          <LI>
            <Strong>TikTok:</Strong>{' '}
            <A href="https://www.tiktok.com/legal/page/row/personalized-ads-and-data/en">
              tiktok.com/legal/page/row/personalized-ads-and-data/en
            </A>
          </LI>
          <LI>
            <Strong>Pinterest:</Strong>{' '}
            <A href="https://www.pinterest.com/settings/privacy">pinterest.com/settings/privacy</A>
          </LI>
        </UL>
      </Section>

      <Section>
        <H2>Do Not Track</H2>
        <P>
          Some browsers transmit a &ldquo;Do Not Track&rdquo; signal. There is no industry
          consensus on how websites should respond to it, and we do not currently respond to Do
          Not Track. We do honor the Global Privacy Control signal, which is the regulator-endorsed
          successor to Do Not Track in the United States.
        </P>
      </Section>

      <Section>
        <H2>Children</H2>
        <P>
          Tela is not directed to children under 13, and we do not knowingly set advertising
          cookies on devices we believe belong to children. We do not engage in cross-context
          behavioral advertising of any user we know to be under 16 without affirmative opt-in
          consent, as required by California Civil Code § 1798.120(c) and equivalent state laws.
        </P>
      </Section>

      <Section>
        <H2>Changes to this Cookie Policy</H2>
        <P>
          We will update this Cookie Policy whenever we add, remove, or materially change a
          cookie or pixel. The &ldquo;Last updated&rdquo; date at the top is always current. For
          material changes, we will also surface a notice in the cookie banner so you can review
          and update your choices.
        </P>
      </Section>

      <Section>
        <H2>Contact</H2>
        <ContactBlock>
          {`Luke Gorski, doing business as Tela
Illinois, United States
`}
          <A href="mailto:privacy@telastyle.app">privacy@telastyle.app</A>
        </ContactBlock>
      </Section>
    </LegalArticle>
  );
}
