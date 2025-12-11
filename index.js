const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// --- CONFIG ---
const IMPORT_API_KEY = process.env.IMPORT_API_KEY;
const PROSPECT_BASE = "https://crm-odata-v1.prospect365.com";
const PROSPECT_PAT = process.env.PROSPECT_PAT;

// Hard-coded valid RoleCode from your system
const DEFAULT_ROLE_CODE = "DECISN";

if (!IMPORT_API_KEY) {
  console.warn(
    "WARNING: IMPORT_API_KEY is not set. /leads endpoint will always return Unauthorized."
  );
}
if (!PROSPECT_PAT) {
  console.warn(
    "WARNING: PROSPECT_PAT is not set. Calls to Prospect CRM will fail."
  );
}
console.log("Using hard-coded DEFAULT_ROLE_CODE:", DEFAULT_ROLE_CODE);

// Axios client for Prospect CRM
const prospectClient = axios.create({
  baseURL: PROSPECT_BASE,
  headers: {
    Authorization: `Bearer ${PROSPECT_PAT}`,
    "Content-Type": "application/json"
  }
});

// --- Helper: create a Contact only ---
async function createContact(lead) {
  const c = lead.primary_contact || {};

  const roleCode = lead.role_code || DEFAULT_ROLE_CODE;

  const payload = {
    Forename: c.first_name || null,
    Surname: c.last_name || null,
    Email: c.email || lead.email_main || null,
    StatusFlag: "A",
    RoleCode: roleCode
  };

  console.log("Creating Contact with payload:", payload);

  const { data } = await prospectClient.post("/Contacts", payload);
  return data;
}

// --- API key auth middleware ---
function checkApiKey(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!IMPORT_API_KEY) {
    console.warn("IMPORT_API_KEY is not set, rejecting request.");
  }

  if (!token || token !== IMPORT_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// --- Health check ---
app.get("/", (req, res) => {
  res.json({
    ok: true,
    message:
      "lead-importer is running (contacts-only, hard-coded RoleCode DECISN, no company link)",
    hasImportApiKey: !!IMPORT_API_KEY,
    hasProspectPat: !!PROSPECT_PAT
  });
});

// --- Main import endpoint (Contacts only) ---
app.post("/leads", checkApiKey, async (req, res) => {
  try {
    if (!PROSPECT_PAT) {
      return res.status(500).json({
        success: false,
        error: "PROSPECT_PAT is not configured on the server"
      });
    }

    const { source_run_id, generated_at, leads } = req.body;

    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ error: "No leads provided" });
    }

    const results = [];
    const errors = [];

    for (const lead of leads) {
      const c = lead.primary_contact || {};
      const email = c.email || lead.email_main;

      if (!email) {
        console.warn("Lead missing contact email, skipping", lead);
        errors.push({
          company_name: lead.company_name || null,
          reason: "Missing contact email"
        });
        continue;
      }

      try {
        const contact = await createContact(lead);
        results.push({
          company_name: lead.company_name || null,
          contact_id: contact.ContactId || null,
          email: contact.Email || email,
          role_code: contact.RoleCode || DEFAULT_ROLE_CODE
        });
      } catch (err) {
        console.error(
          "Error creating contact:",
          err.response?.data || err.message
        );
        errors.push({
          company_name: lead.company_name || null,
          error: err.message,
          details: err.response?.data || null
        });
      }
    }

    const statusCode = results.length > 0 ? 201 : 400;

    res.status(statusCode).json({
      success: results.length > 0,
      source_run_id: source_run_id || null,
      generated_at: generated_at || null,
      count: results.length,
      records: results,
      errors
    });
  } catch (err) {
    console.er
