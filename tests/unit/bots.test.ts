import { describe, it, expect } from "vitest";
import { isLinkPreviewBot } from "@/lib/bots";

describe("isLinkPreviewBot", () => {
  it("recognises link-preview and crawler user agents", () => {
    expect(isLinkPreviewBot("WhatsApp/2.23.20.0")).toBe(true);
    expect(isLinkPreviewBot("facebookexternalhit/1.1")).toBe(true);
    for (const ua of [
      "Facebot",
      "Twitterbot/1.0",
      "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
      "TelegramBot (like TwitterBot)",
      "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
      "LinkedInBot/1.0",
      "Mozilla/5.0 (Windows NT 6.1; WOW64) SkypeUriPreview Preview/0.5",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1)",
      "whatsapp/2",
    ]) {
      expect(isLinkPreviewBot(ua), ua).toBe(true);
    }
  });

  it("does not flag ordinary browsers", () => {
    expect(
      isLinkPreviewBot(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
      ),
    ).toBe(false);
    expect(isLinkPreviewBot("")).toBe(false);
  });
});
