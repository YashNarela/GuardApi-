// config/timezone.js
export const TIMEZONE_CONFIG = {
  default: "Asia/Kolkata", // Change to your preferred timezone
  supported: [
    "UTC",
    "Asia/Kolkata",
    "America/New_York",
    "Europe/London",
    "Asia/Singapore",
  ],
};

export const getCurrentTimezone = () => {
  return TIMEZONE_CONFIG.default;
};
