# Daily Report — June 2, 2026

- Investigated a production crash on EC2 where the Node.js app failed to start due to a legacy AWS SES configuration error (`ECONFIG`) in `nodemailer`.
- Identified that `utils/sendEmail.js` on the production server had an outdated uncommented SES block instead of the updated Gmail SMTP version.
- Attempted deployment via WinSCP which did not overwrite the file correctly due to a file permission issue on the server.
- Fixed the file directly on the EC2 instance via terminal and restarted the PM2 process to bring the application back online.
