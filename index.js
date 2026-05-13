"use strict";

const express = require("express");
const cors    = require("cors");

const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: "*" }));           // allow WooCommerce origin → Railway
app.use(express.json({ limit: "10kb" })); // guard against oversized payloads

// ─── Product Map: WooCommerce ID → Shopify Variant ID ────────────────────────
// Extend this object whenever you add products to both stores.
const PRODUCT_MAP = {
  6191: "53755196703057",
  5786: "53755775385937",
  6480: "53755808219473",
};

const SHOPIFY_STORE = "https://qesbbu-2v.myshopify.com";

// ─── GET /  (health-check) ────────────────────────────────────────────────────
// Railway pings this route to confirm the container is alive.
// Must answer 2xx fast — no async work here.
app.get("/", (_req, res) => {
  res.status(200).json({ status: "ok", message: "Cart bridge is running" });
});

// ─── POST /convert-cart ───────────────────────────────────────────────────────
//
// Request JSON:
//   { "cart": [ { "id": 6191, "qty": 2 }, { "id": 5786, "qty": 1 } ] }
//
// Success (200):
//   { "url": "https://qesbbu-2v.myshopify.com/cart/53755196703057:2,53755775385937:1" }
//
// Failure (400 / 500):
//   { "error": "...", "skipped": [...] }
//
app.post("/convert-cart", (req, res) => {
  try {
    const { cart } = req.body || {};

    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({
        error: 'Request body must be JSON with a non-empty "cart" array.',
        example: { cart: [{ id: 6191, qty: 2 }, { id: 5786, qty: 1 }] },
      });
    }

    const parts   = []; // will become the Shopify cart URL path
    const skipped = []; // unmapped items, returned for client-side debugging

    for (const item of cart) {
      const wooId = Number(item.id);
      const qty   = Math.floor(Number(item.qty));

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
        console.warn(`No Shopify mapping for WooCommerce product id ${wooId}`);
        skipped.push({ ...item, reason: `no Shopify mapping for WooCommerce id ${wooId}` });
        continue;
      }

      parts.push(`${variantId}:${qty}`);
    }

    if (parts.length === 0) {
      return res.status(400).json({
        error: "None of the cart items could be mapped to a Shopify variant.",
        skipped,
      });
    }

    const url = `${SHOPIFY_STORE}/cart/${parts.join(",")}`;
    console.log(`[convert-cart] → ${url}  skipped=${skipped.length}`);

    return res.status(200).json({ url, skipped });

  } catch (err) {
    console.error("[convert-cart] unexpected error:", err);
    return res.status(500).json({ error: "Internal server error. Check Railway logs." });
  }
});

// ─── 404 catch-all ───────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found." });
});

// ─── Start ────────────────────────────────────────────────────────────────────
// process.env.PORT  →  injected automatically by Railway
// "0.0.0.0"         →  REQUIRED; Railway's proxy can't reach the container otherwise
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅  Cart bridge running on port ${PORT}`);
});
