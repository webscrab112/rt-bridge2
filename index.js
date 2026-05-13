"use strict";

const express = require("express");
const cors    = require("cors");
const app     = express();

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10kb" }));

/* ══════════════════════════════════════════════════════
   PRODUCT MAP
   WooCommerce parent product ID → Shopify variant ID

   HOW TO ADD A NEW PRODUCT:
   1. WooCommerce admin → Products → hover product name
      → bottom of browser shows: post=XXXX  ← that's the ID
   2. Shopify admin → Products → click product → click variant
      → URL shows: /variants/XXXXXXXXXXX  ← that's the variant ID
   3. Add one line below:
      XXXXX: "XXXXXXXXXXXXX",
══════════════════════════════════════════════════════ */
const PRODUCT_MAP = {
  6191: "53755196703057",
  5786: "53755775385937",
  6480: "53755808219473",
};

const SHOPIFY_STORE = "https://qesbbu-2v.myshopify.com";

/* ── Health check ── */
app.get("/", (_req, res) => {
  res.status(200).json({ status: "ok", message: "Cart bridge is running" });
});

/* ══════════════════════════════════════════════════════
   POST /convert-cart
   Receives: { cart: [ { id: 6191, qty: 2 } ] }
   Returns:  { url: "https://shopify.../cart/VARIANT:QTY,..." }
══════════════════════════════════════════════════════ */
app.post("/convert-cart", (req, res) => {
  try {
    console.log("INCOMING:", JSON.stringify(req.body));

    const { cart } = req.body || {};

    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({
        error: "cart must be a non-empty array",
        example: { cart: [{ id: 6191, qty: 2 }] }
      });
    }

    const parts   = [];
    const skipped = [];

    for (const item of cart) {
      const id  = Number(item.id);
      const qty = Math.floor(Number(item.qty));

      if (!id || id <= 0)  { skipped.push({ ...item, reason: "invalid id"  }); continue; }
      if (!qty || qty < 1) { skipped.push({ ...item, reason: "invalid qty" }); continue; }

      const variantId = PRODUCT_MAP[id];

      console.log(`id=${id} qty=${qty} → ${variantId || "NOT IN MAP"}`);

      if (!variantId) {
        skipped.push({
          id, qty,
          reason: `ID ${id} not in PRODUCT_MAP — add it to index.js`
        });
        continue;
      }

      parts.push(`${variantId}:${qty}`);
    }

    if (parts.length === 0) {
      return res.status(400).json({
        error: "No products matched. IDs not in PRODUCT_MAP.",
        received_ids: cart.map(i => i.id),
        map_has: Object.keys(PRODUCT_MAP),
        skipped
      });
    }

    const url = `${SHOPIFY_STORE}/cart/${parts.join(",")}`;
    console.log("✅ URL:", url);

    return res.status(200).json({ url, skipped });

  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Cart bridge on port ${PORT}`);
  console.log("Map:", Object.keys(PRODUCT_MAP).join(", "));
});
