// const crypto = require("crypto");
// const { qrPublicKey } = require("../config/keys");
// function verifyQRSignature(siteId, lat, lng, radius, sig){
//   const data = `${siteId}|${lat}|${lng}|${radius}`;
//   const verifier = crypto.createVerify("RSA-SHA256");
//   verifier.update(data);
//   try { return verifier.verify(qrPublicKey, sig, "base64"); } catch(e){ return false; }
// }
// module.exports = { verifyQRSignature };

// utils/qrVerifier.js
const crypto = require("crypto");
const { qrPublicKey } = require("../config/keys");

function verifyQRSignature(siteId, lat, lng, radius, sig){
  const data = `${siteId}|${lat}|${lng}|${radius}`;
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(data);
  try { return verifier.verify(qrPublicKey, sig, "base64"); } catch(e) { return false; }
}

module.exports = { verifyQRSignature };
