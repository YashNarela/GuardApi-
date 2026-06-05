const fs = require("fs");
const path = require("path");
require('dotenv').config()
module.exports = {
  jwtSecret: "supersecretjwtkey123",
  
  qrPrivateKey: fs.readFileSync(path.resolve(__dirname, process.env.QR_PRIVATE_KEY_PATH), "utf8"),
  qrPublicKey: fs.readFileSync(path.resolve(__dirname, process.env.QR_PUBLIC_KEY_PATH), "utf8"),
  // qrPrivateKey: fs.readFileSync(path.join(__dirname, "private.pem"), "utf8"),
  // qrPublicKey: fs.readFileSync(path.join(__dirname, "public.pem"), "utf8"),
};
