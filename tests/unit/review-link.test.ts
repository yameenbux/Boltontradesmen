import { describe, expect, it } from "vitest";
import {
  CARD_REF,
  displayLink,
  reviewFormPath,
  reviewLink,
  reviewRequestMessage,
  reviewShortPath,
  reviewSource,
  whatsappShareUrl,
} from "@/lib/review-link";

describe("review links", () => {
  it("builds the short path and full link from the slug", () => {
    expect(reviewShortPath("ace-plumbing")).toBe("/r/ace-plumbing");
    expect(reviewLink("ace-plumbing", "https://boltonvouched.ysbdesigns.uk")).toBe(
      "https://boltonvouched.ysbdesigns.uk/r/ace-plumbing",
    );
  });

  it("uses the site URL by default", () => {
    expect(reviewLink("ace-plumbing")).toMatch(/^https?:\/\/[^/]+\/r\/ace-plumbing$/);
  });

  it("shows the link without the scheme or www", () => {
    expect(displayLink("https://boltonvouched.ysbdesigns.uk/r/ace")).toBe("boltonvouched.ysbdesigns.uk/r/ace");
    expect(displayLink("http://www.example.com/r/ace")).toBe("example.com/r/ace");
  });

  it("points the review form at ?ref=card only for the card", () => {
    expect(reviewFormPath("ace-plumbing")).toBe("/platform/p/ace-plumbing/review");
    expect(reviewFormPath("ace-plumbing", CARD_REF)).toBe("/platform/p/ace-plumbing/review?ref=card");
  });

  it("records only the known source", () => {
    expect(reviewSource("card")).toBe("card");
    expect(reviewSource(["card", "x"])).toBe("card");
    expect(reviewSource("Card")).toBeNull();
    expect(reviewSource("flyer")).toBeNull();
    expect(reviewSource(undefined)).toBeNull();
    expect(reviewSource(null)).toBeNull();
  });
});

describe("the review request message", () => {
  const link = "https://boltonvouched.ysbdesigns.uk/r/ace-plumbing";
  const message = reviewRequestMessage("Ace Plumbing ", link);

  it("names the business and ends with the link", () => {
    expect(message).toBe(
      "Thanks for choosing Ace Plumbing. If you've a minute, please leave an honest review on Bolton Vouched: " + link,
    );
  });

  it("is neutral: never asks for a good review or only happy customers", () => {
    expect(message).not.toMatch(/5[- ]?star|five[- ]star|positive|good review|great review|happy|satisfied/i);
  });

  it("encodes the whole message into a WhatsApp share link", () => {
    const url = whatsappShareUrl(message);
    const text = url.slice("https://wa.me/?text=".length);
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(text).not.toMatch(/[\s&#?/:]/);
    expect(decodeURIComponent(text)).toBe(message);
    expect(text).toContain("https%3A%2F%2Fboltonvouched.ysbdesigns.uk%2Fr%2Face-plumbing");
  });

  it("encodes characters that would break the query", () => {
    expect(whatsappShareUrl("A & B #1 ?x=y")).toBe("https://wa.me/?text=A%20%26%20B%20%231%20%3Fx%3Dy");
  });
});
