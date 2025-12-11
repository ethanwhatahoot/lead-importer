@@ -98,49 +98,59 @@ app.post("/leads", checkApiKey, async (req, res) => {
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
        console.error("Error creating contact:", err.response?.data || err.message);
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
    console.error("Unhandled error in /leads handler", err);
    res.status(500).json({
      success: false,
      error: "Unexpected server error",
      details: err.message
    });
  }
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`lead-importer listening on http://0.0.0.0:${PORT}`);
});
