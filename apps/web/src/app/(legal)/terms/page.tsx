/**
 * Terms of Use page — telastyle.app/terms
 *
 * Content is the legally reviewed Tela Terms of Use. Section ordering
 * matches the source .docx; sections that the .docx ran inline (Electronic
 * Communications, Force Majeure, Feedback, Export Controls, Survival,
 * California Consumer Notice, No Third-Party Beneficiaries) are broken out
 * here as proper headings for readability.
 */
import type { Metadata } from 'next';
import {
  A, ContactBlock, EffectiveLine, H2, LegalArticle, LI, P, PageTitle, Section, Strong, UL,
} from '../_components/typography';

const EFFECTIVE = 'May 21, 2026';

export const metadata: Metadata = {
  title: 'Terms of Use — tela',
  description: 'Binding terms between you and Tela. Includes a mandatory arbitration provision with a 30-day opt-out.',
};

export default function TermsOfUsePage() {
  return (
    <LegalArticle>
      <PageTitle>Terms of Use</PageTitle>
      <EffectiveLine effective={EFFECTIVE} />

      <Section>
        <P>
          These Terms of Use (the &ldquo;Terms&rdquo;) are a binding contract between you and Luke
          Gorski, an individual doing business as &ldquo;Tela&rdquo; (&ldquo;Tela,&rdquo;{' '}
          &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;), operating from Mexico City,
          Mexico (mailing address in Illinois, United States). By creating a Tela account,
          clicking &ldquo;I agree&rdquo; (or a similar button), or using telastyle.app, you agree
          to these Terms and to the Tela <A href="/privacy">Privacy Policy</A>, which is
          incorporated by reference. If you don&rsquo;t agree, don&rsquo;t use Tela.
        </P>
        <P>
          <Strong>
            PLEASE READ THESE TERMS CAREFULLY. THEY CONTAIN A MANDATORY INDIVIDUAL ARBITRATION
            PROVISION AND CLASS-ACTION WAIVER (SECTION &ldquo;DISPUTE RESOLUTION&rdquo;) THAT,
            EXCEPT AS DESCRIBED IN THAT SECTION, REQUIRE YOU AND TELA TO RESOLVE DISPUTES IN
            INDIVIDUAL ARBITRATION RATHER THAN IN COURT. YOU HAVE A 30-DAY RIGHT TO OPT OUT OF
            ARBITRATION.
          </Strong>
        </P>
      </Section>

      <Section>
        <H2>Who can use Tela</H2>
        <P>
          You must be at least 13 years old (or 16 where local law requires) to use Tela. We do
          not knowingly let children under that age use the service. By using Tela you confirm you
          meet the minimum age and have legal capacity to enter into this contract.
        </P>
      </Section>

      <Section>
        <H2>What Tela does</H2>
        <P>
          Tela is a personal AI styling tool. You upload photos of your clothes; Tela&rsquo;s AI
          analyzes them and recommends outfits, optionally generating virtual try-on images and
          giving conversational styling advice. Features may change without notice as we improve
          the product.
        </P>
      </Section>

      <Section>
        <H2>Your account</H2>
        <P>
          You are responsible for keeping your login credentials secure and for everything that
          happens under your account. Tell us at{' '}
          <A href="mailto:privacy@telastyle.app">privacy@telastyle.app</A> immediately if you
          suspect unauthorized access.
        </P>
      </Section>

      <Section>
        <H2>Your content and the license you give us</H2>
        <P>
          You own the photos and other material you upload to Tela (&ldquo;Your Content&rdquo;).
          You also own the outputs Tela generates for you from Your Content.
        </P>
        <P>
          To run Tela, you grant Tela a worldwide, royalty-free, non-exclusive, sublicensable
          (solely to our subprocessors such as OpenAI and Fashn, to the extent strictly necessary
          to operate Tela) license to host, store, process, modify (e.g., background removal),
          display, and transmit Your Content solely for the purpose of providing Tela&rsquo;s
          features to you. This license ends when you delete the content or your account, except
          for backups that age off on the schedule described in the Privacy Policy.
        </P>
        <P>
          You confirm that you have the right to upload Your Content and that doing so
          doesn&rsquo;t violate anyone else&rsquo;s rights. If your photos include other people,
          you confirm you have permission to upload their image.
        </P>
        <P>
          We do not use Your Content to train any general-purpose AI model. Our AI vendors
          (OpenAI, Fashn) are bound by their API terms not to train on inputs by default.
        </P>
      </Section>

      <Section>
        <H2>AI-generated content</H2>
        <P>
          Outfit recommendations, try-on images, the AI stylist&rsquo;s chat responses, and any{' '}
          &ldquo;style DNA&rdquo; text are AI outputs. You own these outputs as between you and
          Tela. We make no promises about their accuracy, originality, or fitness for any
          purpose. AI outputs can be wrong, biased, or look weird; are not professional fashion
          advice or any other kind of professional advice; and may resemble outputs delivered to
          other users, since the underlying models are shared.
        </P>
        <P>
          The try-on feature uses Fashn&rsquo;s best-effort AI. We do not guarantee the realism
          of any try-on image and you should never assume a real garment will fit or look the
          same as the AI-generated visualization.
        </P>
      </Section>

      <Section>
        <H2>Acceptable use</H2>
        <P>Don&rsquo;t use Tela to:</P>
        <UL>
          <LI>Upload photos of people without their consent.</LI>
          <LI>
            Upload nudity, sexual content, content depicting minors in any compromising way, or
            content that is hateful, harassing, violent, or illegal.
          </LI>
          <LI>
            Try to break Tela, bypass usage limits, reverse engineer our models, or scrape data.
          </LI>
          <LI>Use Tela to violate any law that applies to you.</LI>
          <LI>Resell access to Tela or use it to build a competing product.</LI>
        </UL>
        <P>We may suspend or terminate accounts that violate these rules.</P>
      </Section>

      <Section>
        <H2>Tela&rsquo;s intellectual property</H2>
        <P>
          The Tela name, logo, website, code, design, AI prompt configurations, and everything
          that isn&rsquo;t Your Content belong to Luke Gorski or his licensors. You get a
          personal, limited, non-transferable license to use Tela. That license ends when your
          account ends.
        </P>
      </Section>

      <Section>
        <H2>Pricing, paid tiers, and shopping recommendations</H2>
        <P>
          Tela is free today. We may introduce paid tiers in the future. If we do, we&rsquo;ll
          tell you in advance and you can choose whether to subscribe.
        </P>
        <P>
          We may also introduce affiliate or shopping recommendations — meaning we may earn a
          commission if you buy items we suggest. When we do, we will disclose the affiliate
          relationship clearly in-product in compliance with the FTC&rsquo;s Endorsement Guides,
          and we will update this section and the Privacy Policy to describe what data (if any)
          is shared with retailers when you click a recommendation. We are not the seller of any
          third-party clothing or accessory; your purchase is between you and the retailer.
        </P>
      </Section>

      <Section>
        <H2>Disclaimers</H2>
        <P>
          <Strong>
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, TELA IS PROVIDED &ldquo;AS IS&rdquo;
            AND &ldquo;AS AVAILABLE,&rdquo; WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS,
            IMPLIED, OR STATUTORY, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
            PARTICULAR PURPOSE, NON-INFRINGEMENT, ACCURACY OF AI OUTPUTS, OR UNINTERRUPTED
            AVAILABILITY. WE DO NOT WARRANT THAT TELA WILL MEET YOUR EXPECTATIONS, THAT
            AI-GENERATED OUTFITS WILL LOOK GOOD ON YOU, OR THAT ANY TRY-ON IMAGE ACCURATELY
            REPRESENTS HOW A GARMENT WILL FIT.
          </Strong>
        </P>
        <P>
          Some jurisdictions don&rsquo;t allow disclaimers of implied warranties. In that case,
          the disclaimers above apply to the maximum extent permitted by law.
        </P>
      </Section>

      <Section>
        <H2>Limitation of liability</H2>
        <P>
          <Strong>
            TO THE MAXIMUM EXTENT ALLOWED BY APPLICABLE LAW, NEITHER LUKE GORSKI NOR ANYONE
            WORKING WITH HIM WILL BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
            EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, LOST DATA, OR LOST GOODWILL,
            ARISING OUT OF OR RELATED TO YOUR USE OF TELA, WHETHER BASED ON WARRANTY, CONTRACT,
            TORT (INCLUDING NEGLIGENCE), STATUTE, OR ANY OTHER LEGAL THEORY, AND WHETHER OR NOT
            TELA HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
          </Strong>
        </P>
        <P>
          <Strong>
            OUR TOTAL AGGREGATE LIABILITY TO YOU FOR ANY CLAIM ARISING OUT OF OR RELATED TO TELA
            IS LIMITED TO THE GREATER OF (A) THE AMOUNT YOU PAID TELA IN THE 12 MONTHS BEFORE THE
            CLAIM AROSE (WHICH IS CURRENTLY ZERO), AND (B) ONE HUNDRED US DOLLARS (US$100).
          </Strong>
        </P>
        <P>
          These limits don&rsquo;t apply to liability that cannot be limited under applicable law
          (e.g., gross negligence or intentional misconduct in some jurisdictions, or statutory
          consumer rights in the EU/UK).
        </P>
      </Section>

      <Section>
        <H2>Indemnification</H2>
        <P>
          You agree to defend, indemnify, and hold harmless Luke Gorski (and any successor
          entity, such as Tela LLC) and his agents, contractors, and licensees from any
          third-party claim, loss, or expense (including reasonable attorneys&rsquo; fees and
          court costs) arising out of: (a) Your Content; (b) your use of Tela in violation of
          these Terms or any law; or (c) your infringement or alleged infringement of any
          third-party right. Tela will (i) provide you with prompt written notice of any claim
          for which it seeks indemnification, (ii) give you sole control of the defense and
          settlement of the claim (provided that you may not settle any claim in a manner that
          requires Tela to admit liability or pay any amount without Tela&rsquo;s prior written
          consent), and (iii) reasonably cooperate with you in the defense at your expense.
        </P>
      </Section>

      <Section>
        <H2>Termination</H2>
        <P>
          You can terminate this contract at any time by deleting your account from Settings or
          by emailing <A href="mailto:privacy@telastyle.app">privacy@telastyle.app</A>. We can
          terminate or suspend your account if you breach these Terms or if running your account
          becomes legally or practically untenable for us. On termination, your license to use
          Tela ends; the Privacy Policy governs what happens to your data.
        </P>
      </Section>

      <Section>
        <H2>Dispute resolution — please read carefully</H2>
        <P>
          <Strong>Informal resolution first.</Strong> Before filing anything, email{' '}
          <A href="mailto:privacy@telastyle.app">privacy@telastyle.app</A> and give us 30 days to
          try to resolve the dispute informally.
        </P>
        <P>
          <Strong>Small claims carve-out.</Strong> Either of us may bring an individual claim in
          a small-claims court that has jurisdiction, if the claim qualifies under that
          court&rsquo;s rules.
        </P>
        <P>
          <Strong>Binding arbitration for everything else.</Strong> Any other dispute between you
          and Luke Gorski arising out of or related to Tela or these Terms will be resolved by
          final and binding individual arbitration, administered by the American Arbitration
          Association (AAA) under its Consumer Arbitration Rules. If AAA is unavailable or
          declines to administer the arbitration under those Rules, the arbitration will instead
          be administered by JAMS under its Streamlined Arbitration Rules. The seat of
          arbitration is Cook County, Illinois, but the arbitration may be conducted by phone,
          video, or written submissions if you prefer. Each party bears its own costs except
          where the applicable rules or the arbitrator allocate them otherwise. The Federal
          Arbitration Act (9 U.S.C. § 1 et seq.) governs the interpretation and enforcement of
          this clause.
        </P>
        <P>
          <Strong>Class-action waiver.</Strong> You and Tela agree to bring claims against each
          other only in your individual capacities and not as a plaintiff or class member in any
          class, collective, consolidated, or representative action. The arbitrator may not
          consolidate more than one person&rsquo;s claims. If a court or arbitrator decides that
          any part of this class-action waiver is unenforceable with respect to any claim or any
          request for particular relief (such as a request for public injunctive relief), then
          that claim or request for relief (and only that claim or request) will be severed from
          the arbitration and may be brought in court, while all other claims will proceed in
          arbitration.
        </P>
        <P>
          <Strong>30-day opt-out.</Strong> You may opt out of this arbitration agreement by
          emailing <A href="mailto:privacy@telastyle.app">privacy@telastyle.app</A> with the
          subject line &ldquo;Arbitration Opt-Out&rdquo; within 30 days of first accepting these
          Terms. Your notice must include your full name and the email address associated with
          your Tela account. Opting out has no other effect on these Terms.
        </P>
        <P>
          <Strong>Mass arbitration.</Strong> If 25 or more similar arbitration demands are filed
          against Tela by or with the coordination of the same law firm or coordinated group of
          law firms, the parties agree that AAA&rsquo;s or JAMS&rsquo; mass-arbitration
          supplementary rules (as applicable) will govern, and the parties may agree to a
          bellwether protocol in which a representative subset of claims is arbitrated first and
          the results inform settlement of the remaining claims. This provision is intended to
          manage cost and is not a waiver of any party&rsquo;s right to pursue an individual
          claim.
        </P>
        <P>
          <Strong>Equitable relief.</Strong> Either party may seek injunctive or other equitable
          relief in court for actual or threatened infringement of intellectual property.
        </P>
      </Section>

      <Section>
        <H2>Governing law and jurisdiction</H2>
        <P>
          These Terms and any dispute arising from them are governed by the laws of the State of
          Illinois, USA, without regard to its conflict-of-laws rules, and by applicable US
          federal law. For disputes not subject to arbitration, you and Tela consent to the
          exclusive jurisdiction of the state and federal courts located in Cook County,
          Illinois.
        </P>
        <P>
          Nothing in this section overrides the mandatory consumer-protection rights you may
          have under the laws of your country of residence, where those laws apply.
        </P>
      </Section>

      <Section>
        <H2>Changes to these Terms</H2>
        <P>
          We may update these Terms. If a change is material, we&rsquo;ll notify you by email and
          in-app at least 14 days before it takes effect. Continued use of Tela after the
          effective date is your acceptance of the updated Terms. If you do not agree to the
          updated Terms, your sole remedy is to stop using Tela and delete your account before
          the effective date.
        </P>
      </Section>

      <Section>
        <H2>Electronic communications</H2>
        <P>
          You consent to receive communications from Tela in electronic form (by email or via
          in-app notice) and agree that all agreements, notices, disclosures, and other
          communications that Tela provides to you electronically satisfy any legal requirement
          that such communications be in writing.
        </P>
      </Section>

      <Section>
        <H2>Force majeure</H2>
        <P>
          Tela will not be liable for any delay or failure to perform resulting from causes
          outside its reasonable control, including acts of God, war, terrorism, civil unrest,
          governmental action, labor disputes, pandemic, internet or telecommunications failures,
          or failures of third-party services on which Tela depends (including Supabase, Railway,
          OpenAI, and Fashn).
        </P>
      </Section>

      <Section>
        <H2>Feedback</H2>
        <P>
          If you send Tela ideas, suggestions, or other feedback about the service, you grant
          Tela a perpetual, irrevocable, worldwide, royalty-free, sublicensable license to use
          that feedback for any purpose without obligation or compensation to you.
        </P>
      </Section>

      <Section>
        <H2>Export controls</H2>
        <P>
          You represent that you are not located in, and you will not access or use Tela from,
          any country subject to a comprehensive U.S. trade embargo (currently Cuba, Iran, North
          Korea, Syria, and the Crimea, Donetsk, and Luhansk regions of Ukraine), and that you
          are not listed on any U.S. government denied-party list.
        </P>
      </Section>

      <Section>
        <H2>Survival</H2>
        <P>
          The sections titled &ldquo;Your Content and the License You Give Us,&rdquo; &ldquo;Tela&rsquo;s
          Intellectual Property,&rdquo; &ldquo;Disclaimers,&rdquo; &ldquo;Limitation of Liability,&rdquo;{' '}
          &ldquo;Indemnification,&rdquo; &ldquo;Dispute Resolution,&rdquo; &ldquo;Governing Law and
          Jurisdiction,&rdquo; &ldquo;Electronic Communications,&rdquo; &ldquo;Feedback,&rdquo; and
          this &ldquo;Survival&rdquo; section survive termination of these Terms.
        </P>
      </Section>

      <Section>
        <H2>California consumer notice</H2>
        <P>
          Under California Civil Code § 1789.3, California users are entitled to the following
          notice: The Complaint Assistance Unit of the Division of Consumer Services of the
          California Department of Consumer Affairs may be contacted in writing at 1625 North
          Market Blvd., Suite N 112, Sacramento, CA 95834, or by telephone at (800) 952-5210.
        </P>
      </Section>

      <Section>
        <H2>No third-party beneficiaries</H2>
        <P>
          These Terms do not create any third-party beneficiary rights, except that Tela&rsquo;s
          subprocessors (such as OpenAI and Fashn) are intended third-party beneficiaries of the
          disclaimers and limitations of liability in these Terms.
        </P>
      </Section>

      <Section>
        <H2>Miscellaneous</H2>
        <UL>
          <LI>
            <Strong>Entire agreement.</Strong> These Terms and the Privacy Policy are the entire
            agreement between you and Tela.
          </LI>
          <LI>
            <Strong>Severability.</Strong> If a court strikes any part of these Terms, the rest
            stays in force.
          </LI>
          <LI>
            <Strong>No waiver.</Strong> If we don&rsquo;t enforce a right, that&rsquo;s not a
            waiver.
          </LI>
          <LI>
            <Strong>Assignment.</Strong> You can&rsquo;t assign these Terms; we can — for
            example, if Luke Gorski later forms an LLC (such as &ldquo;Tela LLC&rdquo;) and
            assigns this contract to it. We&rsquo;ll notify you when that happens.
          </LI>
          <LI>
            <Strong>Notices.</Strong> We may email you at the address on file. You can reach us
            at <A href="mailto:privacy@telastyle.app">privacy@telastyle.app</A>.
          </LI>
        </UL>
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

      <Section>
        <H2>Acceptance</H2>
        <P>
          These Terms are accepted electronically when you create a Tela account, click &ldquo;I
          agree&rdquo; (or a similar button), or otherwise use telastyle.app. No physical
          signature is required. Your electronic acceptance has the same legal effect as a
          handwritten signature under the U.S. E-SIGN Act (15 U.S.C. § 7001 et seq.) and
          equivalent state and international law.
        </P>
      </Section>
    </LegalArticle>
  );
}
