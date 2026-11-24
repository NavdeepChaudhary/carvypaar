import { ImageResponse } from "next/og";

// The preview image shown when a CarvyPaar link is shared (WhatsApp, X, Facebook, LinkedIn...).
// Car pages override it with the car's own photo.
export const dynamic = "force-static";
export const alt = "CarvyPaar: buy, sell & auction cars";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #080d1c 0%, #0b1630 60%, #13244d 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 96, fontWeight: 800, letterSpacing: -2 }}>
          Carvy<span style={{ color: "#ffc107" }}>Paar</span>
        </div>
        <div style={{ marginTop: 24, fontSize: 44, fontWeight: 600 }}>Buy, sell &amp; auction cars</div>
        <div style={{ marginTop: 40, display: "flex", gap: 20, fontSize: 30, color: "#ffc107" }}>
          <span>Live auctions</span>
          <span style={{ color: "rgba(255,255,255,0.4)" }}>·</span>
          <span>AI price check</span>
          <span style={{ color: "rgba(255,255,255,0.4)" }}>·</span>
          <span>Reviewed listings</span>
        </div>
      </div>
    ),
    size,
  );
}
