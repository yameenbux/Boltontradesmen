import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FOOTER_LINE } from "@/lib/company";
import {
  COMPANY_LINE,
  DECK,
  FAQ,
  GET_LISTED,
  faqText,
  LISTING_WHATSAPP,
  matchesFaq,
  REMOVAL_WHATSAPP,
  REPORT_WHATSAPP,
  shotSrc,
  SUPPORT_WHATSAPP_DISPLAY,
  WHATSAPP,
  whatsappTicket,
} from "@/components/site/content";

const byQ = (q: string) => FAQ.find((f) => f.q === q)!;

describe("FAQ search", () => {
  it("matches every question on an empty or blank query", () => {
    expect(FAQ.every((f) => matchesFaq(f, ""))).toBe(true);
    expect(FAQ.every((f) => matchesFaq(f, "   "))).toBe(true);
  });

  it("ignores case and surrounding spaces", () => {
    expect(matchesFaq(byQ("Can a trader pay to rank higher?"), "  PAY ")).toBe(true);
    expect(matchesFaq(byQ("Who runs Bolton Vouched?"), "  PAY ")).toBe(false);
  });

  it("searches the answers as well as the questions", () => {
    expect(matchesFaq(byQ("Where does my information go?"), "cookies")).toBe(true);
    expect(matchesFaq(byQ("Who runs Bolton Vouched?"), "16022339")).toBe(true);
  });

  it("needs every word to match", () => {
    expect(matchesFaq(byQ("How do I get listed?"), "listed email")).toBe(true);
    expect(matchesFaq(byQ("How do I get listed?"), "listed zzqxj")).toBe(false);
  });

  it("finds nothing for nonsense", () => {
    expect(FAQ.some((f) => matchesFaq(f, "zzqxj"))).toBe(false);
  });
});

describe("card deck", () => {
  it("has eight cards, each with a committed screenshot", () => {
    expect(DECK).toHaveLength(8);
    for (const card of DECK) {
      expect(existsSync(path.join(__dirname, "..", "..", "public", shotSrc(card.shot))), card.shot).toBe(true);
    }
  });
});

describe("support routes", () => {
  it("builds wa.me links to the support number with the message typed in", () => {
    expect(whatsappTicket("Hi & bye?")).toBe("https://wa.me/447466487591?text=Hi%20%26%20bye%3F");
    expect(SUPPORT_WHATSAPP_DISPLAY).toBe("07466 487591");
    expect(decodeURIComponent(LISTING_WHATSAPP.split("?text=")[1])).toBe(
      "Hi, I'd like to be listed on Bolton Vouched. Name: … Trade: … Areas: …",
    );
    expect(decodeURIComponent(REMOVAL_WHATSAPP.split("?text=")[1])).toBe("Hi, please remove my Bolton Vouched listing.");
    expect(decodeURIComponent(REPORT_WHATSAPP.split("?text=")[1])).toBe(
      "Hi, I'd like to report a problem on Bolton Vouched: …",
    );
    expect(decodeURIComponent(WHATSAPP.split("?text=")[1])).toBe("Hi, I have a question about Bolton Vouched.");
  });

  it("offers both email and WhatsApp wherever the FAQ offers a ticket", () => {
    for (const q of ["How do I get listed?", "How do I come off it?", "How do I report a problem or a review?"]) {
      const links = byQ(q)
        .a.flat()
        .filter((s) => typeof s !== "string")
        .filter((l) => l.href !== GET_LISTED);
      expect(links.map((l) => l.label), q).toEqual(["support@ysbdesigns.uk", "07466 487591"]);
      expect(links[0].href, q).toMatch(/^mailto:support@ysbdesigns\.uk\?subject=/);
      expect(links[1].href, q).toMatch(/^https:\/\/wa\.me\/447466487591\?text=/);
      expect(links[1].external, q).toBe(true);
    }
  });
});

it("points traders at the Get listed form first", () => {
  const first = byQ("How do I get listed?").a[0];
  expect(first).toContainEqual({ href: "/get-listed", label: "Get listed form" });
  expect(GET_LISTED).toBe("/get-listed");
});

describe("operator", () => {
  it("presents YSB Designs and keeps the registered company details", () => {
    expect(COMPANY_LINE).toBe(
      "Bolton Vouched is a YSB Designs platform. YSB Designs is a trading name of YSB Ventures Ltd, registered in England and Wales, company number 16022339.",
    );
    expect(FOOTER_LINE).toBe("Bolton Vouched · YSB Ventures Ltd · Registered in England and Wales, no. 16022339");
    expect(faqText(byQ("Who runs Bolton Vouched?"))).toContain("built and run by YSB Designs");
  });

  it("never names a person", () => {
    expect(FAQ.map(faqText).join(" ")).not.toMatch(/yameen/i);
  });

  it("is honest that the basic listing is free and any upgrade is optional", () => {
    const free = faqText(byQ("Is it free?"));
    expect(free).toContain("a basic listing is free and stays free");
    expect(free).toContain("never moves anyone up the list");
  });
});
