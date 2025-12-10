const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// --- CONFIG ---
const IMPORT_API_KEY = process.env.IMPORT_API_KEY;
const PROSPECT_BASE = "https://crm-odata-v1.prospect365.com";
const PROSPECT_PAT = process.env.PROSPECT_PAT;

// Required by your Prospect instance:
const OPERATING_COMPANY_CODE =
  process.env.OPERATING_COMPANY_CODE || "MAIN"; // override in Render if needed

// Safety logs
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
console.log("Using OPERATING_COMPANY_CODE:", OPERATING_COMPANY_CODE);

// Axios client for Prospect CRM
const prospectClient = axios.create({
  baseURL: PROSPECT_BASE,
  headers: {
    Authorization: `Bearer ${PROSPECT_PAT}`,
    "Content-Type": "application/json"
  }
});

// --- Helper functions ---

// Find an existing Division/Company by Name only
async function findDivisionByName(name) {
  if (!name) return null;

  const safeName = name.replace(/'/g, "''");
  const filter = `Name eq '${safeName}'`;
  const url = `/Divisions?$top=1&$filter=${encodeURIComponent(filter)}`;

  try {
    const { data } = await prospectClient.get(url);
    return data.value && data.value[0] ? data.value[0] : null;
  } catch (err) {
    console.error(
      "Error searching for division by name:",
      err.response?.data || err.message
    );
    return null;
  }
}

// Create a new Division/Company with required fields
async function createDivision(lead) {
  const payload = {
    Name: lead.company_name,
    StatusFlag: "A", // Active
    OperatingCompanyCode: OPERATING_COMPANY_CODE,
    // This is what marks it as Lead vs Customer etc.
    CompanyGroupCode: lead.company_group_code || "Lead"
  };

  console.log("Creating Division with payload:", payload);

  const { data } = await prospectClient.post("/Divisions", payload);
  return data;
}

// Create a Contact with minimal fields
async function createContact(lead, division) {
  const c = lead.primary_contact || {};

  const payload = {
    ContactName: c.full_name || lead.company_name || "Unknown",
    Email: c.email || lead.email_main || null,
    DivisionId: division.DivisionId,
    StatusFlag: "A"
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
    message: "lead-importer is running",
    hasImportApiKey: !!IMPORT_API_KEY,
    hasProspectPat: !!PROSPECT_PAT,
    operatingCompanyCode: OPERATING_COMPANY_CODE
  });
});

// --- Main import endpoint ---

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

    for (const lead of leads) {
      if (!lead.company_name) {
        console.warn("Lead missing company_name, skipping", lead);
        continue;
      }

      // 1. Find or create the Division/Company
      let division = await findDivisionByName(lead.company_name);

      if (!division) {
        division = await createDivision(lead);
      }

      // 2. Create primary contact
      const contact = await createContact(lead, division);

      results.push({
        company_name: lead.company_name,
        division_id: division.DivisionId,
        contact_id: contact.ContactId
      });
    }

    res.status(201).json({
      success: true,
      source_run_id: source_run_id || null,
      generated_at: generated_at || null,
      count: results.length,
      records: results
    });
  } catch (err) {
    console.error("Error importing leads:", err.response?.data || err.message);
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
  console.log(`lead-importer running on port ${port}`);
});
