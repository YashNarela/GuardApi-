// const QRCode = require("qrcode");

// // returns { lat, lng, radius, qrImageBase64 }
// async function generateQR(lat, lng, radius) {
//   const payload = { lat, lng, radius }; // siteId removed

//   // generate png as data URL (base64)
//   const qrImageDataUrl = await QRCode.toDataURL(JSON.stringify(payload));

//   // strip prefix "data:image/png;base64,"
//   const base64 = qrImageDataUrl.split(",")[1];

//   return { ...payload, qrImageBase64: base64 };
// }

// module.exports = { generateQR };

// utils/qrGenerator.js
const QRCode = require("qrcode");

async function generateQR(lat, lng, radius, qrId, siteId) {
  // Embed QR reference in the QR data
  const qrData = {
    qrId,    // the QR document _id
    siteId,  // optional site identifier
    lat,
    lng,
    radius,
  };

  const qrImageBase64 = await QRCode.toDataURL(JSON.stringify(qrData));
  
  return {
    lat,
    lng,
    radius,
    qrImageBase64,
  };
}

module.exports = { generateQR };
