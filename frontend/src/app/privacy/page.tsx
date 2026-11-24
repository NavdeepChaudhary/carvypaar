import type { Metadata } from "next";

import { ContactLine, LegalPage, List, Section } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What personal data CarvyPaar collects, why, who we share it with, and the choices you have.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="This policy explains what personal data CarvyPaar collects when you use the site, why we collect it, and what you can do about it. We collect only what we need to run the marketplace."
    >
      <Section title="What we collect">
        <List
          items={[
            <><strong>Account details:</strong> your name, email address and, if you add them, your phone number, city, photo and short bio.</>,
            <><strong>Listings:</strong> the car details, price, location and photos you upload when you sell a car.</>,
            <><strong>Activity:</strong> your bids, offers, favourites and the messages you send to other members.</>,
            <><strong>Technical data:</strong> your IP address, browser type and basic logs, used to keep the site secure and working.</>,
          ]}
        />
        <p>We do not collect card or bank details. CarvyPaar does not process payments between buyers and sellers.</p>
      </Section>

      <Section title="How we use it">
        <List
          items={[
            "To create and secure your account and sign you in.",
            "To show your listings, run auctions and pass messages and offers between buyers and sellers.",
            "To send you notifications you need, such as being outbid or receiving an offer.",
            "To work out AI price estimates. These use car details only, never your personal details.",
            "To spot and stop fraud, spam and abuse, and to meet our legal obligations.",
          ]}
        />
      </Section>

      <Section title="What other members can see">
        <p>
          Your name, city, profile photo and join date appear on your listings and bids. Your email address and phone
          number are not shown publicly. When you agree a sale, the details you choose to share in messages are visible
          to that member.
        </p>
      </Section>

      <Section title="Who we share it with">
        <p>We do not sell your personal data. We share it only with services that help us run CarvyPaar:</p>
        <List
          items={[
            "Our sign-in provider (Clerk), which handles account sign-in, including Google sign-in.",
            "Our hosting providers, which store the site, the database and uploaded photos.",
            "Authorities, when the law requires it.",
          ]}
        />
      </Section>

      <Section title="Cookies and local storage">
        <p>
          We use cookies that are needed to keep you signed in securely. We store your light or dark theme choice in
          your browser. We do not use advertising or tracking cookies.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          We keep your data while your account is open. When you close your account we delete or anonymise your
          personal data, except where we must keep records for legal, tax or dispute reasons.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          Under India&apos;s Digital Personal Data Protection Act, 2023, you can ask to see the personal data we hold
          about you, correct it, or have it erased, and you can withdraw consent. You can edit most details yourself on
          your profile page. For anything else, <ContactLine />.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Passwords are stored hashed, sign-in sessions use secure HTTP-only cookies, and all traffic is encrypted over
          HTTPS. No system is perfectly secure, so please use a strong password and keep it to yourself.
        </p>
      </Section>

      <Section title="Children">
        <p>CarvyPaar is for people aged 18 and over. We do not knowingly collect data from children.</p>
      </Section>

      <Section title="Changes and contact">
        <p>
          If we change this policy we will update the date at the top of this page. For privacy questions or
          complaints, <ContactLine />.
        </p>
      </Section>
    </LegalPage>
  );
}
