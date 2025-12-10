const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// --- CONFIG ---
const IMPORT_API_KEY = process.env.IMPORT_API_KEY;
const PROSPECT_BASE = "https://crm-odata-v1.prospect365.com";
const PROSPECT_PAT = process.env.PROSPECT_PAT;

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

// Axios client for Prospect CRM
const prospectClient = axios.create({
  baseURL: PROSPECT_BASE,
  headers: {
    Authorization: `Bearer ${PROSPECT_PAT}`,
    "Content-Type": "application/json"
  }
});

// --- Helper: create a Contact only ---
// We assume the company/division already exists in Prospect
// and we are given a valid DivisionId (division_id) in the lead.
async function createContact(lead) {
  const c = lead.primary_contact || {};

  const payload = {
    // Minimal & safe fields based on the info Prospect gave you:
    Forename: c.first_name || null,
    Surname: c.last_name || null,
    Email: c.email || lead.email_main || null,
    StatusFlag: "A",
    // Link to existing company/division
    DivisionId: lead.division_id
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
    message: "lead-importer is running (contacts-only mode)",
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
      // We now REQUIRE division_id to be provided
      if (!lead.division_id) {
        console.warn("Lead missing division_id, skipping", lead);
        errors.push({
          company_name: lead.company_name || null,
          reason: "Missing division_id (existing Prospect Company/Division ID required)"
        });
        continue;
      }

      try {
        const contact = await createContact(lead);
        results.push({
          company_name: lead.company_name || null,
          division_id: lead.division_id,
          contact_id: contact.ContactId
        });
      } catch (err) {
        console.error(
          "Error creating contact:",
          err.response?.data || err.message
        );
        errors.push({
          company_name: lead.company_name || null,
          division_id: lead.division_id,
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
    console.error("Error in /leads handler:", err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.message,
      details: err.response?.data || null
    });
  }
});

// --- Start server ---
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`lead-importer (contacts-only) running on port ${port}`);
});
