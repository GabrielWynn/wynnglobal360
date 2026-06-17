/**
 * One-off probe for FT Markets historical page structure.
 * Usage: npx tsx scripts/probe-ft.ts
 */

const ISIN = process.argv[2] ?? "LU0905233846";
const CCY = process.argv[3] ?? "USD";
const url = `https://markets.ft.com/data/funds/tearsheet/historical?s=${ISIN}:${CCY}`;

async function main() {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  console.log("status", res.status);
  const html = await res.text();
  console.log("length", html.length);

  // Look for embedded JSON / API hints
  const patterns = [
    /data-symbol="([^"]+)"/g,
    /mod-ui-historical-prices[^>]*data-url="([^"]+)"/g,
    /"HistoricalPrices"[^]{0,200}/g,
    /markets\.ft\.com\/data\/[^"'\s]+/g,
  ];
  for (const p of patterns) {
    const m = [...html.matchAll(p)].slice(0, 5);
    if (m.length) console.log(p.source, m.map((x) => x[0] ?? x[1]));
  }

  // Parse table rows from historical prices section
  const rowRe =
    /<tr[^>]*>\s*<td[^>]*>[\s\S]*?(\w+day,?\s+\w+\s+\d{1,2},?\s+\d{4})[\s\S]*?<\/td>\s*<td[^>]*>([\d.]+)<\/td>/gi;
  const rows: Array<{ date: string; close: string }> = [];
  let match;
  while ((match = rowRe.exec(html)) !== null && rows.length < 5) {
    rows.push({ date: match[1], close: match[2] });
  }
  console.log("sample rows", rows);

  // Alternative: mod-tearsheet table
  const closeRe = /Close<\/th>[\s\S]{0,500}?<td[^>]*>([\d.]+)<\/td>/i;
  console.log("close match", closeRe.test(html));

  const cfgMatch = html.match(
    /mod-tearsheet-historical-prices[^>]*data-mod-config="([^"]+)"/
  );
  if (cfgMatch) {
    const json = JSON.parse(
      cfgMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&")
    );
    console.log("mod-config", JSON.stringify(json, null, 2));

    // Probe likely internal API endpoints
    const symbol = json.symbol as string;
    const base = `https://markets.ft.com/data/equities/ajax/getHistoricalPrices?symbol=${symbol}`;
    const paramSets = [
      "",
      "&startDate=2025-06-01&endDate=2026-06-15",
      "&dateFrom=2025-06-01&dateTo=2026-06-15",
      "&from=2025-06-01&to=2026-06-15",
    ];
    for (const p of paramSets) {
      const u = base + p;
      const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } });
      const body = await r.json() as { html?: string; data?: unknown };
      const rows = (body.html ?? "").match(/<tr>/g);
      console.log("api", p || "(default)", "rows", rows?.length ?? 0, "html len", (body.html ?? "").length);
    }
  }
}

main().catch(console.error);
