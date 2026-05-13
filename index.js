"use strict";

const express = require("express");
const cors = require("cors");

const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── Product Map: WooCommerce ID → Shopify Variant ID ────────────────────────
const PRODUCT_MAP = {
  6480: "53755808219473",
  6482: "53755775385937",
};

const SHOPIFY_STORE = "https://qesbbu-2v.myshopify.com";

// ─── Health Check (Railway uses this to confirm app is alive) ─────────────────
app.get("/", (req, res) => {
  res.status(200).json({ status: "ok", message: "Cart bridge is running" });
});

// ─── Main Endpoint: POST /convert-cart ───────────────────────────────────────
//
// Expected request body:
//   { "cart": [ { "id": 6191, "qty": 2 }, { "id": 5786, "qty": 1 } ] }
//
// Returns:
//   { "url": "https://qesbbu-2v.myshopify.com/cart/53755196703057:2,53755775385937:1" }
//
app.post("/convert-cart", (req, res) => {
  try {
    const cart = req.body?.cart;

    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: "cart must be a non-empty array" });
    }

    const parts = [];
    const skipped = [];

    for (const item of cart) {
      const wooId = Number(item.id);
      const qty   = Number(item.qty);

      if (!wooId || !qty || qty < 1) {
        skipped.push(item);
        continue;
      }

      const shopifyVariantId = PRODUCT_MAP[wooId];
      if (!shopifyVariantId) {
        skipped.push({ ...item, reason: "no mapping found" });
        continue;
      }

      parts.push(`${shopifyVariantId}:${qty}`);
    }

    if (parts.length === 0) {
      return res.status(400).json({
        error: "No recognisable products in cart",
        skipped,
      });
    }

    const url = `${SHOPIFY_STORE}/cart/${parts.join(",")}`;
    return res.status(200).json({ url, skipped });

  } catch (err) {
    console.error("convert-cart error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── 404 catch-all ───────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
// Railway injects process.env.PORT automatically.
// Binding to 0.0.0.0 is REQUIRED — without it Railway cannot route traffic.
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
});
