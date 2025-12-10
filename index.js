const express = require("express");

const app = express();

app.get("/", (req, res) => {
  res.json({ ok: true, message: "simple test app is running" });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Test app listening on port ${port}`);
});
