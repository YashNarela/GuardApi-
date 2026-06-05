const admin = require("../config/firebase");

const sendPushNotification = async (deviceToken, title, body, data = {}) => {
  if (!deviceToken) return;
  const message = {
    notification: { title, body },
    data,
    token: deviceToken,
  };

  try {
    const response = await admin.messaging().send(message);
    console.log("Notification sent:", response);
  } catch (err) {
    console.error("Error sending notification:", err);
  }
};

module.exports = sendPushNotification;
