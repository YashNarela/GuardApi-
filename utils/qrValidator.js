// function validateLocation(qrLat, qrLng, guardLat, guardLng) {
//   const R = 6371e3;
//   const toRad = (deg) => (deg * Math.PI) / 180;
//   const dLat = toRad(guardLat - qrLat);
//   const dLng = toRad(guardLng - qrLng);
//   const a = Math.sin(dLat/2)**2 + Math.cos(toRad(qrLat))*Math.cos(toRad(guardLat))*Math.sin(dLng/2)**2;
//   const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
//   return distance;
// }
// module.exports = { validateLocation };

// utils/qrValidator.js
function validateLocation(qrLat, qrLng, guardLat, guardLng) {
  const R = 6371e3;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(guardLat - qrLat);
  const dLng = toRad(guardLng - qrLng);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(qrLat)) * Math.cos(toRad(guardLat)) * Math.sin(dLng/2)**2;
  const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return distance;
}
module.exports = { validateLocation };
