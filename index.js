"use strict";

const express = require("express");
const cors    = require("cors");
const app     = express();

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10kb" }));

/* ── Product Map: WooCommerce product ID → Shopify variant ID ── */
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

/* ── POST /convert-cart ── */
app.post("/convert-cart", (req, res) => {
  try {
    // Log the FULL raw body so we can see exactly what's arriving
    console.log("=== INCOMING REQUEST ===");
    console.log(JSON.stringify(req.body, null, 2));
    console.log("========================");

    const { cart } = req.body || {};

    if (!Array.isArray(cart) || cart.length === 0) {
      console.log("ERROR: cart is missing or empty");
      return res.status(400).json({
        error: "cart must be a non-empty array",
        received: req.body,
        example: { cart: [{ id: 6191, qty: 2 }] }
      });
    }

    const parts   = [];
    const skipped = [];

    for (const item of cart) {
      const wooId = Number(item.id);
      const qty   = Math.floor(Number(item.qty));

      console.log(`Item: id=${wooId} qty=${qty} → mapped=${PRODUCT_MAP[wooId] || "NOT FOUND"}`);

      if (!Number.isFinite(wooId) || wooId <= 0) {
        skipped.push({ ...item, reason: "invalid id" });
        continue;
      }
      if (!Number.isFinite(qty) || qty < 1) {
        skipped.push({ ...item, reason: "invalid qty" });
        continue;
      }

      const variantId = PRODUCT_MAP[wooId];
      if (!variantId) {
        skipped.push({ ...item, reason: `WooCommerce id ${wooId} not in PRODUCT_MAP` });
        continue;
      }

      parts.push(`${variantId}:${qty}`);
    }

    if (parts.length === 0) {
      console.log("ERROR: no items mapped. Skipped:", JSON.stringify(skipped));
      return res.status(400).json({
        error: "None of the cart items matched a Shopify product. Check that WooCommerce product IDs match the PRODUCT_MAP.",
        skipped,
        product_map_keys: Object.keys(PRODUCT_MAP),
      });
    }

    const url = `${SHOPIFY_STORE}/cart/${parts.join(",")}`;
    console.log("SUCCESS →", url);

    return res.status(200).json({ url, skipped });

  } catch (err) {
    console.error("Unexpected error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Cart bridge running on port ${PORT}`);
  console.log("PRODUCT_MAP:", JSON.stringify(PRODUCT_MAP));
});
