const axios = require("axios");

const app = express();
app.use(express.json());

// --- CONFIG ---
// These come from environment variables (we'll set them on Render)
const IMPORT_API_KEY = process.env.IMPORT_API_KEY;
const PROSPECT_BASE = "https://crm-odata-v1.prospect365.com";
const PROSPECT_PAT = process.env.PROSPECT_PAT;

// Safety check: log a warning if env vars are missing
if (!IMPORT_API_KEY) {
  console.warn("WARNING: IMPORT_API_KEY is not set");
}
if (!PROSPECT_PAT) {
  console.warn("WARNING: PROSPECT_PAT is not set");
}

// Axios client for Prospect CRM
const prospectClient = axios.create({
  baseURL: PROSPECT_BASE,
  headers: {
    Authorization: `Bearer ${PROSPECT_PAT}`,
    "Content-Type": "application/json"
  }
});

// --- Helper functions to talk to Prospect CRM ---

// Find an existing Division/Company by Name and Postcode
async function findDivisionByNameAndPostcode(name, postcode) {
  const safeName = name.replace(/'/g, "''");
  const safePostcode = postcode ? postcode.replace(/'/g, "''") : null;

  let filter = `Name eq '${safeName}'`;
  if (safePostcode) filter += ` and Postcode eq '${safePostcode}'`;

  const url = `/Divisions?$top=1&$filter=${encodeURIComponent(filter)}`;

  const { data } = await prospectClient.get(url);
  return data.value && data.value[0] ? data.value[0] : null;
}

// Create a new Division/Company from the lead data
async function createDivision(lead) {
  const payload = {
    Name: lead.company_name,
    Telephone: lead.phone_main || null,
    Website: lead.website_url || null,
    Address1: lead.address_line1 || null,
    Address2: lead.address_line2 || null,
    Town: lead.town || null,
    County: lead.county_region || null,
    Postcode: lead.postcode || null,
    Country: lead.country || null,
    StatusFlag: "A" // Active
  };

  const { data } = await prospectClient.post("/Divisions", payload);
  return data;
}

// Create a contact linked to a Division
async function createContact(lead, division) {
  const c = lead.primary_contact || {};

  const payload = {
    Forename: c.first_name || null,
    Surname: c.last_name || null,
    ContactName: c.full_name || null,
    Email: c.email || lead.email_main || null,
    Telephone: c.phone_direct || lead.phone_main || null,
    Mobile: c.phone_mobile || null,
    Position: c.job_title || null,
    DivisionId: division.DivisionId,
    StatusFlag: "A"
  };

  const { data } = await prospectClient.post("/Contacts", payload);
  return data;
}

// --- Simple API key auth so only you/ChatGPT can call this ---

function checkApiKey(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!token || token !== IMPORT_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// --- Health check (optional) ---

app.get("/", (req, res) => {
  res.json({ ok: true, message: "lead-importer is running" });
});

// --- The endpoint ChatGPT will call to import leads ---

app.post("/leads", checkApiKey, async (req, res) => {
  try {
    const { source_run_id, generated_at, leads } = req.body;

    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ error: "No leads provided" });
    }

    const results = [];

    for (const lead of leads) {
      // 1. Find or create the Division/Company
      let division = await findDivisionByNameAndPostcode(
        lead.company_name,
        lead.postcode
      );

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

// --- Start the server ---

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`lead-importer running on port ${port}`);
});
[201~[C[C[D[Dgit remote add origin https://github.com/ethanwhatahoot/lead-importer.git
git branch -M main
git push -u origin main
