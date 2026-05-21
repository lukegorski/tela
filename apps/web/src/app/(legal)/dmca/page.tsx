/**
 * DMCA and Copyright Policy page — telastyle.app/dmca
 *
 * The [STREET ADDRESS, CITY, IL ZIP] placeholder in the Designated Agent
 * block is preserved verbatim from the source .docx; the source itself
 * flags it as required-before-publication. Fill in once the U.S. Copyright
 * Office DMCA Designated Agent Directory registration is complete.
 */
import type { Metadata } from 'next';
import {
  A, ContactBlock, EffectiveLine, H2, LegalArticle, LI, P, PageTitle, Section, Strong, UL,
} from '../_components/typography';

const EFFECTIVE = 'May 21, 2026';
const LAST_UPDATED = 'May 21, 2026';

export const metadata: Metadata = {
  title: 'DMCA and Copyright Policy — tela',
  description: 'How to send tela a DMCA takedown notice or counter-notice, and our repeat-infringer policy.',
};

export default function DmcaPolicyPage() {
  return (
    <LegalArticle>
      <PageTitle>DMCA and Copyright Policy</PageTitle>
      <EffectiveLine effective={EFFECTIVE} updated={LAST_UPDATED} />

      <Section>
        <P>
          Tela respects the intellectual property rights of others and expects its users to do the
          same. This DMCA and Copyright Policy explains how to send Tela a notice of alleged
          copyright infringement under the U.S. Digital Millennium Copyright Act, 17 U.S.C. § 512
          (&ldquo;DMCA&rdquo;), how to send a counter-notice, and how Tela responds to repeat
          infringement.
        </P>
        <P>
          &ldquo;Tela,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; and &ldquo;our&rdquo; mean Luke
          Gorski, an individual doing business as &ldquo;Tela,&rdquo; operating from Mexico City,
          Mexico (mailing address in Illinois, United States). This policy supplements the Tela{' '}
          <A href="/terms">Terms of Use</A> and applies to user-generated content submitted to
          Tela, including wardrobe and body photos, chat messages, and other materials users
          upload. AI-generated outputs produced by Tela (such as outfit images, try-on
          visualizations, and stylist responses) are addressed separately in the Terms of Use.
        </P>
      </Section>

      <Section>
        <H2>Designated copyright agent</H2>
        <P>
          Tela has designated the following agent to receive notifications of claimed
          infringement under the DMCA. Notices sent to any other address may not receive a timely
          response.
        </P>
        <ContactBlock>
          {`Designated Agent: Luke Gorski
Mailing Address: [STREET ADDRESS, CITY, IL ZIP] (a physical mailing address is required for U.S. Copyright Office registration and must be completed before this policy is published)
Email: `}
          <A href="mailto:dmca@telastyle.app">dmca@telastyle.app</A>
        </ContactBlock>
        <P>
          Registration of Tela&rsquo;s designated agent with the U.S. Copyright Office DMCA
          Designated Agent Directory at{' '}
          <A href="https://dmca.copyright.gov">dmca.copyright.gov</A> is required for Tela to
          claim the DMCA safe harbor under 17 U.S.C. § 512(c) and must be completed (and renewed
          every three years) before this policy is published. Once registered, Tela&rsquo;s
          listing will be searchable at dmca.copyright.gov.
        </P>
      </Section>

      <Section>
        <H2>How to send a DMCA takedown notice</H2>
        <P>
          If you believe that material accessible on or from telastyle.app infringes a copyright
          that you own or are authorized to act on behalf of, you may submit a written notice to
          the designated agent above. To be effective under 17 U.S.C. § 512(c)(3), your notice
          must include all of the following:
        </P>
        <UL>
          <LI>
            a physical or electronic signature of a person authorized to act on behalf of the
            owner of the exclusive right that is allegedly infringed;
          </LI>
          <LI>
            identification of the copyrighted work claimed to have been infringed, or, if
            multiple copyrighted works at a single online site are covered by a single
            notification, a representative list of such works;
          </LI>
          <LI>
            identification of the material that is claimed to be infringing or to be the subject
            of infringing activity and that is to be removed or access to which is to be
            disabled, and information reasonably sufficient to permit Tela to locate the material
            (for example, the URL on telastyle.app where the material appears);
          </LI>
          <LI>
            information reasonably sufficient to permit Tela to contact the complaining party,
            such as an address, telephone number, and, if available, an email address;
          </LI>
          <LI>
            a statement that the complaining party has a good faith belief that use of the
            material in the manner complained of is not authorized by the copyright owner, its
            agent, or the law; and
          </LI>
          <LI>
            a statement that the information in the notification is accurate, and under penalty
            of perjury, that the complaining party is authorized to act on behalf of the owner
            of an exclusive right that is allegedly infringed.
          </LI>
        </UL>
        <P>
          Incomplete notices may delay or prevent processing. Submitting a knowingly false DMCA
          notice may expose you to liability for damages, including costs and attorneys&rsquo;
          fees, under 17 U.S.C. § 512(f).
        </P>
      </Section>

      <Section>
        <H2>What Tela does after receiving a valid notice</H2>
        <P>
          Upon receipt of a notice that substantially complies with the requirements above, Tela
          will:
        </P>
        <UL>
          <LI>
            expeditiously remove or disable access to the allegedly infringing material,
            typically within 1 to 3 business days of receiving a substantially compliant notice;
          </LI>
          <LI>
            take reasonable steps to notify the user who uploaded or posted the material that it
            has been removed or disabled, by forwarding a copy of the notice (with the
            complainant&rsquo;s contact information) to the user&rsquo;s account email; and
          </LI>
          <LI>
            document the takedown in Tela&rsquo;s internal DMCA log and preserve a copy of the
            removed material and associated metadata for at least one year (or longer if
            required by ongoing litigation), so that the material can be restored following a
            valid counter-notice.
          </LI>
        </UL>
      </Section>

      <Section>
        <H2>How to send a DMCA counter-notice</H2>
        <P>
          If you are a Tela user and you believe that material you uploaded was removed or
          disabled as a result of mistake or misidentification, you may submit a written
          counter-notice to the designated agent above. To be effective under 17 U.S.C. §
          512(g)(3), your counter-notice must include all of the following:
        </P>
        <UL>
          <LI>your physical or electronic signature;</LI>
          <LI>
            identification of the material that has been removed or to which access has been
            disabled and the location at which the material appeared before it was removed or
            access to it was disabled;
          </LI>
          <LI>
            a statement under penalty of perjury that you have a good faith belief that the
            material was removed or disabled as a result of mistake or misidentification of the
            material to be removed or disabled; and
          </LI>
          <LI>
            your name, address, and telephone number, and a statement that you consent to the
            jurisdiction of the United States District Court for the judicial district in which
            your address is located, or if your address is outside the United States, for any
            judicial district in which Tela may be found (which Tela treats as the Northern
            District of Illinois), and that you will accept service of process from the person
            who provided notification under 17 U.S.C. § 512(c)(1)(C) or an agent of such person.
          </LI>
        </UL>
        <P>
          Upon receipt of a counter-notice that substantially complies with these requirements,
          Tela will promptly forward a copy to the original complainant and inform them that
          Tela will replace the removed material or cease disabling access to it in not less
          than 10 and not more than 14 business days, unless the complainant first notifies Tela
          that they have filed an action seeking a court order to restrain the user from engaging
          in infringing activity relating to the material on Tela.
        </P>
        <P>
          Submitting a knowingly false counter-notice may expose you to liability under 17
          U.S.C. § 512(f).
        </P>
      </Section>

      <Section>
        <H2>Repeat infringer policy</H2>
        <P>
          Tela maintains a policy of terminating, in appropriate circumstances, the accounts of
          users that Tela determines are repeat infringers of copyright. Tela generally considers
          a user a &ldquo;repeat infringer&rdquo; if the user has been the subject of two or more
          DMCA notices that Tela has found valid and acted upon, and the user has not
          successfully submitted counter-notices that resulted in the material being restored.
          Tela reserves discretion to apply this policy based on the totality of the
          circumstances, including the volume, recency, and severity of the conduct. Tela may, in
          its sole discretion, terminate or suspend accounts for fewer notices where the conduct
          is flagrant or harmful.
        </P>
      </Section>

      <Section>
        <H2>Trademark, right of publicity, and other intellectual property claims</H2>
        <P>
          If you believe that material on telastyle.app infringes a trademark, right of publicity,
          or other intellectual property right (other than copyright), please email{' '}
          <A href="mailto:dmca@telastyle.app">dmca@telastyle.app</A> with a description of the
          claim, the URL or location of the material, your contact information, and a statement
          of your good faith belief that the material is infringing. Tela will review the claim
          and respond as appropriate, typically within 10 business days. Note that non-DMCA
          intellectual property claims are not governed by 17 U.S.C. § 512 and are handled at
          Tela&rsquo;s discretion under its <A href="/terms">Terms of Use</A>.
        </P>
      </Section>

      <Section>
        <H2>AI-generated content and copyright</H2>
        <P>
          Tela uses third-party AI services (including OpenAI and Fashn) to generate outfit
          images, virtual try-on visualizations, and other outputs. Tela does not claim DMCA safe
          harbor for AI-generated outputs that Tela itself produces and serves to users; those
          outputs are governed by the <A href="/terms">Terms of Use</A>. If you believe an
          AI-generated output infringes your copyright, you may still submit a notice to{' '}
          <A href="mailto:dmca@telastyle.app">dmca@telastyle.app</A> and Tela will review and
          respond, but the formal DMCA notice-and-takedown procedures above apply to
          user-uploaded content.
        </P>
      </Section>

      <Section>
        <H2>Misuse of this policy</H2>
        <P>
          DMCA and other intellectual property processes are not a substitute for resolving
          personal disputes. If you submit a takedown notice for material that you do not in
          good faith believe is infringing, Tela may decline to process further notices from
          you, may share the notice with the affected user, and may pursue any remedies
          available under 17 U.S.C. § 512(f) or other applicable law.
        </P>
      </Section>

      <Section>
        <H2>Changes to this policy</H2>
        <P>
          Tela may update this policy from time to time. The &ldquo;Last updated&rdquo; date at
          the top reflects the most recent change. Material changes will be posted at
          telastyle.app/dmca; continued use of Tela after a change takes effect constitutes
          acceptance of the updated policy.
        </P>
      </Section>

      <Section>
        <H2>Contact</H2>
        <ContactBlock>
          {`Luke Gorski, doing business as Tela
`}
          <Strong>DMCA notices and counter-notices:</Strong>{' '}
          <A href="mailto:dmca@telastyle.app">dmca@telastyle.app</A>
          {`
`}
          <Strong>All other questions:</Strong>{' '}
          <A href="mailto:privacy@telastyle.app">privacy@telastyle.app</A>
        </ContactBlock>
      </Section>
    </LegalArticle>
  );
}
