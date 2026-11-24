import type { Metadata } from "next";

import { ContactLine, LegalPage, List, Section } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Auction Rules",
  description: "How bidding, anti-sniping, reserve prices and winning work in CarVypaar live auctions.",
  alternates: { canonical: "/auction-rules" },
};

export default function AuctionRulesPage() {
  return (
    <LegalPage
      title="Auction Rules"
      intro="CarVypaar auctions are live and open: everyone sees the same price and the same clock. These rules keep every auction fair."
    >
      <Section title="Placing a bid">
        <List
          items={[
            "You need to be signed in to bid.",
            "The first bid must be at least the starting price.",
            "Every later bid must beat the current bid by at least the bid increment shown on the auction.",
            "You can't bid on your own car, and you can't outbid yourself while you are already the highest bidder.",
            "Bids can't be withdrawn. Only bid what you are ready to pay.",
          ]}
        />
      </Section>

      <Section title="Anti-sniping: the clock extends">
        <p>
          If a bid arrives in the last 2 minutes, the auction is extended by 2 more minutes. This repeats for as long
          as people keep bidding late, so nobody can win by bidding in the final second. The auction page shows when
          an auction has been extended.
        </p>
      </Section>

      <Section title="Reserve price">
        <p>
          A seller may set a hidden reserve: the lowest price they will accept. The reserve amount is never shown, but
          the auction tells you whether it has been met yet. If bidding ends below the reserve, the car is not sold.
        </p>
      </Section>

      <Section title="Winning">
        <List
          items={[
            "When the clock runs out, the highest bid wins, as long as any reserve has been met.",
            "The winner and the seller are both notified and can message each other on CarVypaar.",
            "The winner and seller agree payment, inspection and handover between themselves. CarVypaar does not hold or transfer money.",
            "Inspect the car and its documents before you pay. If the car is materially different from its listing, you are not obliged to buy it. Tell us so we can review the listing.",
          ]}
        />
      </Section>

      <Section title="Cancelled auctions">
        <p>
          A seller can cancel an auction only before anyone has bid. Once there are bids, the auction runs to the end.
          We may cancel an auction that breaks our terms, for example a fake listing or fake bids.
        </p>
      </Section>

      <Section title="Fair play">
        <p>
          Shill bidding (bidding on your own car, or asking others to, to push the price up) is not allowed. Accounts
          caught doing it will be closed. To report a suspicious auction, <ContactLine />.
        </p>
      </Section>
    </LegalPage>
  );
}
