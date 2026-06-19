"use strict";

const express = require("express");
const cors    = require("cors");
const app     = express();

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10kb" }));

/* ══════════════════════════════════════════════════════════════
   PRODUCT MAP
   WooCommerce product ID → Shopify variant ID
   Multiple WooCommerce IDs CAN share the same Shopify variant ID.
   Quantities for same Shopify variant are automatically merged.

   TO ADD A NEW PRODUCT:
   WooCommerce ID: go to wp-admin → Products → hover name → post=XXXX in URL
   Shopify variant ID: Shopify admin → Products → variant → /variants/XXXX in URL
   Then add: WOOCOMMERCE_ID: "SHOPIFY_VARIANT_ID",
══════════════════════════════════════════════════════════════ */
const PRODUCT_MAP = {
  // Shopify variant 54101092532561
  5807: "54101092532561",
  5803: "54101092532561",
  5778: "54101092532561",
  5546: "54101092532561",
  
   // Shopify variant 54101247983953
  5782: "54101247983953",
  5792: "54101247983953",
  5795: "54101247983953",

  // Shopify variant 54101237530961
  5799: "54101237530961",
  5797: "54101237530961",

  // Shopify variant 54101259223377
  5784: "54101259223377",

  // Shopify variant 54101220884817
  5801: "54101220884817",

  // Shopify variant 54101198963025
  5805: "54101198963025",

};

const SHOPIFY_STORE = "https://returntovault.site";

app.get("/", (_req, res) => {
  res.status(200).json({ status: "ok", message: "Cart bridge running" });
});

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

    // Merge quantities per Shopify variant ID
    // Handles: multiple WooCommerce products → same Shopify variant
    const variantTotals = {};
    const skipped       = [];

    for (const item of cart) {
      const id  = Number(item.id);
      const qty = Math.floor(Number(item.qty));

      if (!id  || id  <= 0) { skipped.push({ ...item, reason: "invalid id"  }); continue; }
      if (!qty || qty <= 0) { skipped.push({ ...item, reason: "invalid qty" }); continue; }

      const variantId = PRODUCT_MAP[id];
      console.log(`id=${id} qty=${qty} → ${variantId || "NOT IN MAP"}`);

      if (!variantId) {
        skipped.push({ id, qty, reason: `WooCommerce ID ${id} not in PRODUCT_MAP` });
        continue;
      }

      // KEY FIX: accumulate qty per Shopify variant
      // So if WooCommerce IDs 6419 + 6191 both map to same Shopify variant,
      // their quantities are added together correctly
      variantTotals[variantId] = (variantTotals[variantId] || 0) + qty;
    }

    const parts = Object.keys(variantTotals)
      .map(function (v) { return v + ":" + variantTotals[v]; });

    if (parts.length === 0) {
      return res.status(400).json({
        error: "No products matched PRODUCT_MAP.",
        received_ids: cart.map(i => i.id),
        map_has: Object.keys(PRODUCT_MAP).map(Number),
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

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Cart bridge on port ${PORT}`);
  console.log(`Map: ${Object.keys(PRODUCT_MAP).length} WooCommerce IDs → Shopify`);
});
