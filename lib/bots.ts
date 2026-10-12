// Link-preview fetchers and crawlers. They follow contact links (WhatsApp unfurling a shared profile,
// a search engine crawling) without anyone tapping Call, so their requests must not be logged as enquiries.
const BOT_PATTERN =
  /whatsapp|facebookexternalhit|facebot|twitterbot|slackbot|telegrambot|discordbot|linkedinbot|skypeuripreview|googlebot|bingbot|applebot/i;

export function isLinkPreviewBot(userAgent: string): boolean {
  return BOT_PATTERN.test(userAgent);
}
