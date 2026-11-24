/**
 * ImportKlar ESG (B13) — Deterministic EFRAG VSME CO2e & EUDR Annex-I Supply-Chain Pre-Check Engine
 * 100 % local in browser or Node.js (zero network calls).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.ImportKlarEsgEngine = api;
  root.CheProjectEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  "use strict";

  const META = {
    pid: "B13",
    brand: "ImportKlar",
    short_name: "VSME-CO2e & EUDR Prüfer",
    slug: "csrd_eudr",
    default_profile: "Hanse Holz & Ladenbau GmbH",
    kpi_impact_label: "Abgesichertes Liefer-/Umsatzvolumen",
    annual_multiplier: 1,
  };

  // Documented conservative DACH/EU emission factors (kg CO2e per unit)
  const EMISSION_FACTORS = {
    electricity_kwh_mix: 0.380,    // DE grid mix approx kg CO2e/kWh
    electricity_kwh_green: 0.000,  // Market-based certified green power
    gas_kwh: 0.201,                // Natural gas kg CO2e/kWh
    diesel_liter: 2.65,            // Fleet diesel kg CO2e/L
    scope3_spend_eur: 0.28,        // Spend-based avg kg CO2e/EUR purchased goods
  };

  const EUDR_PREFIXES = [
    { prefix: "44", commodity: "Holz & Holzwaren" },
    { prefix: "47", commodity: "Holzzellstoff / Papierrohstoff" },
    { prefix: "48", commodity: "Papier & Pappe" },
    { prefix: "9403", commodity: "Holzmöbel (EUDR-relevant)" },
    { prefix: "0901", commodity: "Kaffee" },
    { prefix: "1801", commodity: "Kakaobohnen" },
    { prefix: "1803", commodity: "Kakaomasse" },
    { prefix: "1804", commodity: "Kakaobutter" },
    { prefix: "1805", commodity: "Kakaopulver" },
    { prefix: "1806", commodity: "Schokolade / Kakaoerzeugnisse" },
    { prefix: "4001", commodity: "Naturkautschuk" },
    { prefix: "4011", commodity: "Kautschukreifen" },
    { prefix: "1201", commodity: "Sojabohnen" },
    { prefix: "2304", commodity: "Sojaschrot" },
    { prefix: "1511", commodity: "Palmöl" },
    { prefix: "0102", commodity: "Lebende Rinder" },
    { prefix: "0201", commodity: "Rindfleisch frisch" },
    { prefix: "0202", commodity: "Rindfleisch gefroren" },
    { prefix: "4101", commodity: "Rinderhäute / Leder" },
  ];

  const SAMPLES = {
    s1: {
      profile_name: "Hanse Holz & Ladenbau GmbH",
      mode: "vsme_eudr",
      tone: "streng",
      vsme: {
        electricity_kwh: 185000,
        green_power: false,
        gas_kwh: 95000,
        diesel_liters: 14000,
        scope3_spend_eur: 420000,
      },
      commodities: [
        { sku: "HLZ-4407", label: "Schnittholz Eiche (Brasilien)", hs_code: "440791", origin: "BR", volume_eur: 85000, geo_polygon_ok: false, traces_dds_ref: "" },
        { sku: "MBL-9403", label: "Ladenbau-Holzregale EU", hs_code: "940360", origin: "PL", volume_eur: 42000, geo_polygon_ok: true, traces_dds_ref: "26DE-DDS-00419" },
        { sku: "STL-7308", label: "Stahlprofile Beschläge", hs_code: "730890", origin: "DE", volume_eur: 29000, geo_polygon_ok: false, traces_dds_ref: "" },
      ],
    },
    s2: {
      profile_name: "Weser Präzisionstechnik GmbH",
      mode: "vsme",
      tone: "executive",
      vsme: {
        electricity_kwh: 240000,
        green_power: true,
        gas_kwh: 40000,
        diesel_liters: 4500,
        scope3_spend_eur: 180000,
      },
      commodities: [
        { sku: "CNC-8483", label: "Präzisionswellen Stahl", hs_code: "848310", origin: "DE", volume_eur: 95000, geo_polygon_ok: false, traces_dds_ref: "" },
      ],
    },
    s3: {
      profile_name: "Rösterei & Feinkost Direktimport",
      mode: "eudr",
      tone: "streng",
      vsme: {
        electricity_kwh: 75000,
        green_power: true,
        gas_kwh: 60000,
        diesel_liters: 3200,
        scope3_spend_eur: 210000,
      },
      commodities: [
        { sku: "KAF-0901", label: "Rohkaffee Arabica", hs_code: "090111", origin: "CO", volume_eur: 64000, geo_polygon_ok: true, traces_dds_ref: "" },
        { sku: "KAK-1804", label: "Kakaobutter Charge 11", hs_code: "180400", origin: "GH", volume_eur: 29000, geo_polygon_ok: false, traces_dds_ref: "" },
      ],
    },
  };

  function r2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  }

  function matchEudr(hsCode) {
    const clean = String(hsCode || "").replace(/[^0-9]/g, "");
    if (!clean) return null;
    for (const item of EUDR_PREFIXES) {
      if (clean.startsWith(item.prefix)) return item;
    }
    return null;
  }

  function evaluateEsgAndEudr(input = {}) {
    const profileName = String(input.profile_name || META.default_profile);
    const mode = ["vsme_eudr", "vsme", "eudr"].includes(input.mode) ? input.mode : "vsme_eudr";
    const tone = String(input.tone || "executive");

    const v = input.vsme || SAMPLES.s1.vsme;
    const elecKwh = Math.max(0, Number(v.electricity_kwh) || 0);
    const greenPower = Boolean(v.green_power);
    const gasKwh = Math.max(0, Number(v.gas_kwh) || 0);
    const dieselL = Math.max(0, Number(v.diesel_liters) || 0);
    const s3Eur = Math.max(0, Number(v.scope3_spend_eur) || 0);

    const scope1T = r2((gasKwh * EMISSION_FACTORS.gas_kwh + dieselL * EMISSION_FACTORS.diesel_liter) / 1000);
    const scope2T = r2((elecKwh * (greenPower ? EMISSION_FACTORS.electricity_kwh_green : EMISSION_FACTORS.electricity_kwh_mix)) / 1000);
    const scope3T = r2((s3Eur * EMISSION_FACTORS.scope3_spend_eur) / 1000);
    const totalCo2eT = r2(scope1T + scope2T + scope3T);

    const commodities = Array.isArray(input.commodities) ? input.commodities : SAMPLES.s1.commodities;
    const entries = [];
    let passCount = 0;
    let warnCount = 0;
    let failCount = 0;
    let exposedEur = 0;

    if (mode !== "eudr") {
      const s12Status = scope1T + scope2T > 0 ? "PASS" : "WARN";
      if (s12Status === "PASS") passCount += 1;
      else warnCount += 1;
      entries.push({
        id: "VSME-S12",
        label: `Scope 1 (${scope1T.toFixed(2)} t) + Scope 2 (${scope2T.toFixed(2)} t CO2e)`,
        category: "EFRAG VSME B3",
        metric: r2(scope1T + scope2T),
        metric_label: `${r2(scope1T + scope2T).toFixed(2)} t CO2e`,
        base_eur: 0,
        impact_eur: 0,
        status: s12Status,
        note: greenPower ? "Marktbasierter Ökostrom (0 g CO2e/kWh) dokumentiert." : "Strommix 380 g CO2e/kWh angesetzt — Ökostrom-Herkunftsnachweis prüfen.",
      });

      const s3Status = s3Eur > 0 ? (scope3T > 50 ? "WARN" : "PASS") : "WARN";
      if (s3Status === "PASS") passCount += 1;
      else warnCount += 1;
      entries.push({
        id: "VSME-S3",
        label: `Scope 3.1 Eingekaufte Waren (${s3Eur.toLocaleString("de-DE")} EUR)`,
        category: "VSME Scope 3",
        metric: scope3T,
        metric_label: `${scope3T.toFixed(2)} t CO2e`,
        base_eur: s3Eur,
        impact_eur: 0,
        status: s3Status,
        note: "Ausgabenbasierte Schätzung (0,28 kg CO2e/EUR). Primärdaten der Top-5-Lieferanten schrittweise einholen.",
      });
    }

    if (mode !== "vsme") {
      commodities.forEach((c, idx) => {
        const hs = String(c.hs_code || "").trim();
        const hit = matchEudr(hs);
        const vol = Math.max(0, Number(c.volume_eur) || 0);
        const geoOk = Boolean(c.geo_polygon_ok);
        const dds = String(c.traces_dds_ref || "").trim();

        let status = "PASS";
        let note = "Kein EUDR-Anhang-I-Rohstoff erkannt.";
        let risk = 0;

        if (hit) {
          if (!geoOk) {
            status = "FAIL";
            risk = vol;
            note = `EUDR (${hit.commodity}, HS ${hs}): GeoJSON-Flurstück (Cut-off 31.12.2020) fehlt!`;
          } else if (!dds) {
            status = "WARN";
            risk = r2(vol * 0.5);
            note = `EUDR (${hit.commodity}, HS ${hs}): Geodaten da, aber TRACES-DDS-Referenz fehlt vor Inverkehrbringen.`;
          } else {
            status = "PASS";
            note = `EUDR (${hit.commodity}, HS ${hs}): Geo-Polygon & DDS '${dds}' vollständig.`;
          }
        }

        if (status === "PASS") passCount += 1;
        else if (status === "WARN") warnCount += 1;
        else failCount += 1;
        exposedEur += risk;

        entries.push({
          id: c.sku || `EUDR-${String(idx + 1).padStart(2, "0")}`,
          label: `${c.label || "Rohstoff"} (HS ${hs || "-"} · ${c.origin || "EU"})`,
          category: hit ? `EUDR: ${hit.commodity}` : "Nicht EUDR-pflichtig",
          metric: vol,
          metric_label: `${vol.toFixed(0)} EUR`,
          base_eur: vol,
          impact_eur: risk,
          status,
          note,
        });
      });
    }

    const total = entries.length || 1;
    const score = r2(((passCount + warnCount * 0.5) / total) * 100);
    const header =
      tone === "streng"
        ? `[LIEFERANTEN-NACHFORDERUNG EUDR & VSME] ${profileName} (B13)`
        : `[BANK- & KONZERN-ESG-ANTWORTBOGEN] ${profileName} (VSME + EUDR)`;

    const actionLines = entries
      .filter((e) => e.status !== "PASS")
      .map((e) => `- [${e.status}] ${e.id} ${e.label}: ${e.note}`);

    const actionText = [
      header,
      `ESG-Readiness: ${score.toFixed(1)} % | Gesamt-CO2e (Scope 1+2+3): ${totalCo2eT.toFixed(2)} t CO2e (S1: ${scope1T} t · S2: ${scope2T} t · S3: ${scope3T} t)`,
      `EUDR Risiko-Warenvolumen: ${exposedEur.toFixed(2)} EUR | FAIL: ${failCount} | WARN: ${warnCount}`,
      "",
      actionLines.length ? "Offene Nachweise & Maßnahmen:" : "Alle geprüften VSME- & EUDR-Punkte sind vollständig belegt.",
      ...actionLines,
      "",
      "Erstellt 100 % lokal im Browser via ImportKlar ESG (by VeriTakt Collective) — ohne Cloud-Upload.",
    ].join("\n");

    const csvHeader = "ID;Kategorie;Position;Wert_oder_CO2e;Risiko_EUR;Status;Hinweis";
    const csvRows = entries.map((e) =>
      [e.id, e.category, e.label, e.metric_label, e.impact_eur.toFixed(2), e.status, e.note]
        .map((val) => `"${String(val).replace(/"/g, '""')}"`)
        .join(";")
    );

    return {
      ok: failCount === 0,
      project_id: META.pid,
      brand: META.brand,
      profile_name: profileName,
      mode,
      tone,
      readiness_percent: score,
      co2e_totals: {
        scope1_t: scope1T,
        scope2_t: scope2T,
        scope3_t: scope3T,
        total_t: totalCo2eT,
      },
      impact_eur: r2(exposedEur),
      annual_impact_eur: r2(exposedEur),
      summary: {
        total_count: entries.length,
        pass_count: passCount,
        warn_count: warnCount,
        fail_count: failCount,
      },
      entries,
      action_text: actionText,
      export_csv: "\uFEFF" + [csvHeader, ...csvRows].join("\n"),
    };
  }

  function formatAuditReportMarkdown(res) {
    return [
      `# ImportKlar ESG — VSME & EUDR Audit (${res.profile_name})`,
      `- **Score:** ${res.readiness_percent} % | **CO2e gesamt:** ${res.co2e_totals.total_t} t CO2e`,
      `- **EUDR Risiko-Volumen:** ${res.impact_eur.toFixed(2)} EUR (FAIL: ${res.summary.fail_count}, WARN: ${res.summary.warn_count})`,
      "",
      res.action_text,
    ].join("\n");
  }

  function formatAuditReportJson(res) {
    return JSON.stringify(res, null, 2);
  }

  return {
    META,
    EMISSION_FACTORS,
    EUDR_PREFIXES,
    SAMPLES,
    matchEudr,
    evaluateEsgAndEudr,
    evaluateCase: evaluateEsgAndEudr,
    formatAuditReportMarkdown,
    formatAuditReportJson,
  };
});
