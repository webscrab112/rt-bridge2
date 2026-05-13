"use strict";

const express = require("express");
const cors    = require("cors");
const app     = express();

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10kb" }));

/* ══════════════════════════════════════════════════════
   PRODUCT MAP
   Key   = WooCommerce PARENT product ID
   Value = Shopify variant ID

   To add a new product:
   1. Get WooCommerce product ID from:
      wp-admin → Products → hover product name → see ID in browser bar
   2. Get Shopify variant ID from:
      Shopify admin → Products → click product → click variant → ID is in the URL
   3. Add a new line below in this format:
      NUMBER: "SHOPIFY_VARIANT_ID",
══════════════════════════════════════════════════════ */
const PRODUCT_MAP = {
  6191: "53755196703057",
  5786: "53755775385937",
  6480: "53755808219473",
};

const SHOPIFY_STORE  = "https://qesbbu-2v.myshopify.com";
const WC_SITE        = process.env.WC_SITE || "https://thevendorvault.io";
const WC_KEY         = process.env.WC_KEY  || "";   // set in Railway env vars
const WC_SECRET      = process.env.WC_SECRET || ""; // set in Railway env vars

/* ── Health check ───────────────────────────────────── */
app.get("/", (_req, res) => {
  res.status(200).json({ status: "ok", message: "Cart bridge is running" });
});

/* ══════════════════════════════════════════════════════
   HELPER — resolve a WooCommerce ID to its parent product ID
   If the ID is already a parent → returns it unchanged.
   If the ID is a variation  → fetches and returns parent_id.
   Uses WooCommerce REST API with Basic Auth.
══════════════════════════════════════════════════════ */
async function resolveToParentId(id) {
  // First check if it's directly in the map
  if (PRODUCT_MAP[id]) return id;

  // If no WC credentials set, we can't look up variations — return as-is
  if (!WC_KEY || !WC_SECRET) {
    console.warn(`[Bridge] No WC credentials set — cannot resolve variation ${id}`);
    return id;
  }

  try {
    const auth = Buffer.from(`${WC_KEY}:${WC_SECRET}`).toString("base64");

    // Try fetching as a product first
    const productRes = await fetch(`${WC_SITE}/wp-json/wc/v3/products/${id}`, {
      headers: { "Authorization": `Basic ${auth}` }
    });

    if (productRes.ok) {
      const product = await productRes.json();
      // If it has a parent_id it's a variation
      if (product.parent_id && product.parent_id > 0) {
        console.log(`[Bridge] ${id} is a variation → parent is ${product.parent_id}`);
        return product.parent_id;
      }
      // It's already a parent product
      return product.id;
    }

    // Try as a variation under all mapped parent products
    for (const parentId of Object.keys(PRODUCT_MAP)) {
      const varRes = await fetch(
        `${WC_SITE}/wp-json/wc/v3/products/${parentId}/variations/${id}`,
        { headers: { "Authorization": `Basic ${auth}` } }
      );
      if (varRes.ok) {
        console.log(`[Bridge] ${id} is a variation of parent ${parentId}`);
        return parseInt(parentId, 10);
      }
    }
  } catch (err) {
    console.error(`[Bridge] Error resolving id ${id}:`, err.message);
  }

  return id; // return original if all lookups fail
}

/* ══════════════════════════════════════════════════════
   POST /convert-cart
══════════════════════════════════════════════════════ */
app.post("/convert-cart", async (req, res) => {
  try {
    console.log("=== INCOMING ===", JSON.stringify(req.body));

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
      const rawId = Number(item.id);
      const qty   = Math.floor(Number(item.qty));

      if (!Number.isFinite(rawId) || rawId <= 0) {
        skipped.push({ ...item, reason: "invalid id" });
        continue;
      }
      if (!Number.isFinite(qty) || qty < 1) {
        skipped.push({ ...item, reason: "invalid qty" });
        continue;
      }

      // Resolve variation → parent if needed
      const parentId = await resolveToParentId(rawId);
      const variantId = PRODUCT_MAP[parentId];

      console.log(`[Bridge] id=${rawId} → parent=${parentId} → shopify=${variantId || "NOT FOUND"} qty=${qty}`);

      if (!variantId) {
        skipped.push({
          original_id: rawId,
          resolved_parent: parentId,
          qty,
          reason: `Product ID ${parentId} not in PRODUCT_MAP. Add it to index.js.`
        });
        continue;
      }

      parts.push(`${variantId}:${qty}`);
    }

    if (parts.length === 0) {
      return res.status(400).json({
        error: "No products matched. See skipped[] for details.",
        skipped,
        product_map_keys: Object.keys(PRODUCT_MAP),
      });
    }

    const url = `${SHOPIFY_STORE}/cart/${parts.join(",")}`;
    console.log("[Bridge] ✅ URL:", url);

    return res.status(200).json({ url, skipped });

  } catch (err) {
    console.error("[Bridge] Unexpected error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Cart bridge running on port ${PORT}`);
  console.log("PRODUCT_MAP keys:", Object.keys(PRODUCT_MAP).join(", "));
});
