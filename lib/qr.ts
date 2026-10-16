import "server-only";
import QRCode from "qrcode";

// QR codes for the printable review card, drawn on the server as SVG (no network, no client JavaScript).
// Error correction Q (a quarter of the code can be lost: creases, a thumb, a coffee ring) and the standard four-module
// quiet zone, dark on white whatever the site theme, so phone cameras read it on screen and on paper.

export async function qrSvg(text: string): Promise<string> {
  if (!text) throw new Error("qrSvg: nothing to encode");
  return QRCode.toString(text, {
    type: "svg",
    errorCorrectionLevel: "Q",
    margin: 4,
    color: { dark: "#000000", light: "#ffffff" },
  });
}
