require("dotenv").config();
const app = require("./app");
const { ensureDb } = require("./initDb");

const PORT = process.env.PORT || 3000;

ensureDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Food ordering app: http://localhost:${PORT}`);
    });
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
