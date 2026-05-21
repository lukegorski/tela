/**
 * Biometric Information Privacy Policy page —
 *   telastyle.app/biometric-policy
 *
 * Required to satisfy BIPA § 15(a)'s publicly-available-written-policy
 * requirement. Cross-referenced from the Privacy Policy.
 */
import type { Metadata } from 'next';
import {
  A, ContactBlock, EffectiveLine, H2, LegalArticle, LI, OL, P, PageTitle, Section, UL,
} from '../_components/typography';

const EFFECTIVE = 'May 21, 2026';
const LAST_UPDATED = 'May 21, 2026';

export const metadata: Metadata = {
  title: 'Biometric Information Privacy Policy — tela',
  description: 'How tela handles information that could qualify as a biometric identifier or biometric information.',
};

export default function BiometricPolicyPage() {
  return (
    <LegalArticle>
      <PageTitle>Biometric Information Privacy Policy</PageTitle>
      <EffectiveLine effective={EFFECTIVE} updated={LAST_UPDATED} />

      <Section>
        <P>
          This Biometric Information Privacy Policy describes how Tela collects, uses, stores,
          and destroys information that could potentially qualify as a &ldquo;biometric
          identifier&rdquo; or &ldquo;biometric information&rdquo; under U.S. state biometric
          privacy laws — most notably the Illinois Biometric Information Privacy Act, 740 ILCS
          14/1 et seq. (&ldquo;BIPA&rdquo;), the Texas Capture or Use of Biometric Identifier
          Act (Tex. Bus. &amp; Com. Code § 503.001) (&ldquo;CUBI&rdquo;), Washington&rsquo;s
          biometric identifier law (RCW 19.375 et seq.), and the New York City Biometric
          Identifier Information Law (N.Y.C. Admin. Code § 22-1201 et seq.) to the extent any of
          those laws apply.
        </P>
        <P>
          Tela publishes this policy to satisfy BIPA Section 15(a)&rsquo;s requirement that any
          private entity in possession of biometric identifiers or biometric information have a
          publicly available written policy establishing a retention schedule and guidelines for
          permanent destruction. We follow this policy globally, regardless of whether a
          particular user&rsquo;s state has a biometric law of its own.
        </P>
        <P>
          &ldquo;Tela,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; and &ldquo;our&rdquo; mean Luke
          Gorski, an individual doing business as &ldquo;Tela,&rdquo; operating from Mexico City,
          Mexico (mailing address in Illinois, United States). Questions about this policy go to{' '}
          <A href="mailto:privacy@telastyle.app">privacy@telastyle.app</A>.
        </P>
      </Section>

      <Section>
        <H2>Scope of this policy</H2>
        <P>
          This policy applies to any image, file, or data point that Tela receives, stores, or
          processes that could be construed as a &ldquo;biometric identifier&rdquo; or{' '}
          &ldquo;biometric information&rdquo; under any applicable state law, including without
          limitation a scan of face geometry, hand geometry, retina, iris, voiceprint, or
          fingerprint, and any information based on such a scan that is used to identify a
          specific individual.
        </P>
        <P>
          The Tela feature most likely to fall within the scope of these statutes is the{' '}
          &ldquo;try on me&rdquo; virtual try-on tool, which accepts a full-body photograph
          uploaded by the user and sends it to our AI try-on provider, Fashn, to generate a
          visualization of garments worn on the user&rsquo;s body. Tela does not believe that
          this process constitutes the collection of a &ldquo;scan of hand or face geometry&rdquo;
          within BIPA&rsquo;s definition, because Tela does not extract, store, or use facial or
          body geometry to identify any individual. However, the law is unsettled when applied to
          virtual try-on, and Tela has chosen to apply BIPA-grade safeguards to this feature in
          full.
        </P>
      </Section>

      <Section>
        <H2>What Tela does not do</H2>
        <P>
          Tela does not, and will not without first updating this policy and obtaining additional
          consent:
        </P>
        <UL>
          <LI>use any image or scan to identify or verify the identity of any individual;</LI>
          <LI>compare any image or scan to any database of known persons;</LI>
          <LI>
            extract or store mathematical templates derived from any face, body, hand, retina,
            iris, voice, or fingerprint;
          </LI>
          <LI>
            sell, lease, trade, or otherwise profit from any biometric identifier or biometric
            information;
          </LI>
          <LI>
            disclose any biometric identifier or biometric information to a third party except as
            expressly authorized by the user, as required to provide the service the user
            requested, or as required by law; or
          </LI>
          <LI>
            collect any traditional biometric input — we do not operate cameras, voiceprint
            capture, fingerprint scanners, or any other biometric capture device.
          </LI>
        </UL>
      </Section>

      <Section>
        <H2>Illinois geographic restriction</H2>
        <P>
          Tela disables the &ldquo;try on me&rdquo; feature for users we detect as being in
          Illinois, including users whose IP address geolocates to Illinois and users who have
          set their account location to a city in Illinois. The rest of Tela (item analysis,
          outfit generation, chat) does not collect a scan of face or hand geometry and remains
          fully available in Illinois.
        </P>
        <P>
          If an Illinois user nonetheless uses the &ldquo;try on me&rdquo; feature (for example,
          by traveling outside Illinois temporarily or by using a VPN), this policy and its
          safeguards apply in full.
        </P>
      </Section>

      <Section>
        <H2>Notice and written consent</H2>
        <P>
          Before any user uploads a body photo for the &ldquo;try on me&rdquo; feature, Tela
          presents a separate, standalone consent screen that:
        </P>
        <UL>
          <LI>informs the user that a body photograph is being collected, stored, and processed;</LI>
          <LI>
            explains the specific purpose for which the photograph is being collected (generation
            of a virtual try-on image via Fashn);
          </LI>
          <LI>
            discloses the length of time the photograph and any output will be stored (see{' '}
            &ldquo;Retention schedule&rdquo; below);
          </LI>
          <LI>
            identifies Fashn as the third-party subprocessor to which the photograph will be
            transmitted, with a link to Fashn&rsquo;s privacy practices;
          </LI>
          <LI>
            confirms that Tela will not sell, lease, trade, or otherwise profit from the
            photograph; and
          </LI>
          <LI>
            requests a written, electronic consent (constituting a written release under BIPA §
            15(b)(3) and an equivalent informed consent under CUBI and other applicable laws)
            that the user must affirmatively give by clicking &ldquo;I consent&rdquo; before the
            feature unlocks.
          </LI>
        </UL>
        <P>
          We log each consent event with a timestamp, the user&rsquo;s account identifier, the
          policy version in effect at the time, and the IP address from which consent was given.
          These consent records are themselves retained for the period set out below.
        </P>
      </Section>

      <Section>
        <H2>Retention schedule</H2>
        <P>
          Tela will permanently destroy any biometric identifier or biometric information in its
          possession upon the earliest of the following:
        </P>
        <OL>
          <LI>the date on which the user deletes the relevant image from the user&rsquo;s Tela account;</LI>
          <LI>the date on which the user deletes the user&rsquo;s Tela account;</LI>
          <LI>
            thirty (30) days of account inactivity, after which body photographs are automatically
            deleted by an automated process; or
          </LI>
          <LI>three (3) years following the user&rsquo;s last interaction with Tela.</LI>
        </OL>
        <P>
          Fashn, our virtual try-on provider, separately commits to deleting all inputs and
          outputs across all endpoints within seventy-two (72) hours of processing.
        </P>
        <P>
          Consent records and the audit log described in &ldquo;Audit and recordkeeping&rdquo;
          below are retained for the period set out in (d) above, so that Tela can demonstrate
          compliance even after the underlying biometric data has been destroyed.
        </P>
      </Section>

      <Section>
        <H2>Method of destruction</H2>
        <P>
          Permanent destruction means the deletion of all copies of the biometric identifier or
          biometric information from Tela&rsquo;s production systems and object storage,
          accompanied by overwrite or cryptographic erasure as the storage technology requires.
          Encrypted backups roll off on a 90-day cycle, after which the destroyed data is also
          gone from backup. Tela does not retain any biometric identifier or biometric
          information beyond the schedule above for analytics, training, or any other secondary
          purpose.
        </P>
      </Section>

      <Section>
        <H2>Disclosure and sharing</H2>
        <P>
          Tela will not disclose, redisclose, or otherwise disseminate any biometric identifier
          or biometric information to any third party unless:
        </P>
        <UL>
          <LI>the user (or the user&rsquo;s legally authorized representative) consents to the disclosure;</LI>
          <LI>
            the disclosure is necessary to provide a service the user has specifically requested
            (for example, transmitting a body photograph to Fashn to generate a try-on image);
          </LI>
          <LI>
            the disclosure is required by a valid warrant or subpoena issued by a court of
            competent jurisdiction; or
          </LI>
          <LI>the disclosure is otherwise required by federal, state, or local law.</LI>
        </UL>
        <P>
          Body photographs and any data derived from them are never disclosed to advertising
          partners or used to build advertising audiences.
        </P>
      </Section>

      <Section>
        <H2>Security</H2>
        <P>
          Tela stores biometric identifiers and biometric information using the reasonable
          standard of care within Tela&rsquo;s industry and in a manner that is the same as or
          more protective than the manner in which Tela stores other confidential and sensitive
          information. Safeguards include HTTPS in transit, encryption at rest in Supabase,
          scoped vendor access, secrets isolation in Doppler, and access logging.
        </P>
      </Section>

      <Section>
        <H2>Vendors</H2>
        <P>
          The only Tela vendor that currently receives a body photograph for the &ldquo;try on
          me&rdquo; feature is Fashn (fashn.ai). Fashn&rsquo;s API documentation states that all
          inputs and outputs across all endpoints are automatically deleted within 72 hours and
          that only anonymized request logs are retained. Tela&rsquo;s contract and configuration
          with Fashn prohibit Fashn from using the photograph to train any general-purpose AI
          model.
        </P>
        <P>
          If Tela ever adds another vendor that would receive biometric identifiers or biometric
          information, we will update this policy first, identify the vendor by name, and (where
          required) obtain renewed consent from affected users.
        </P>
      </Section>

      <Section>
        <H2>Your rights</H2>
        <P>At any time, you may:</P>
        <UL>
          <LI>delete any body photograph from your Tela account via Settings;</LI>
          <LI>
            delete your Tela account, which will trigger permanent destruction of any associated
            biometric identifier or biometric information on the schedule above;
          </LI>
          <LI>
            withdraw your consent to the &ldquo;try on me&rdquo; feature by writing to{' '}
            <A href="mailto:privacy@telastyle.app">privacy@telastyle.app</A>, in which case Tela
            will discontinue collection of new photographs and destroy any existing ones; and
          </LI>
          <LI>request a copy of the audit log entries that relate to your consent.</LI>
        </UL>
      </Section>

      <Section>
        <H2>Audit and recordkeeping</H2>
        <P>
          Tela maintains an internal audit log that records, for each biometric event: the user
          identifier, the action (collection, transmission to Fashn, retention check,
          destruction), the timestamp, and the policy version in effect at the time. The audit
          log is retained for the period set out in the retention schedule and is available for
          inspection upon a valid regulatory request.
        </P>
      </Section>

      <Section>
        <H2>Changes to this policy</H2>
        <P>
          Tela may amend this policy from time to time. Material changes will be announced by
          email (where we have an email address on file) and by an in-app notice at least 14 days
          before the change takes effect. The &ldquo;Last updated&rdquo; date at the top is
          always current. Historical versions of this policy are retained internally so that Tela
          can demonstrate which version was in effect at the time of any given biometric event.
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
