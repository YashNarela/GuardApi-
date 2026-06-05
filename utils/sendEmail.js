// const nodemailer = require("nodemailer");
// const { SESClient, SendRawEmailCommand } = require("@aws-sdk/client-ses");

// const sesClient = new SESClient({
//   region: process.env.AWS_REGION,
//   credentials: {
//     accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//   },
// });

// const transporter = nodemailer.createTransport({
//   SES: { ses: sesClient, aws: { SendRawEmailCommand } },
// });

// /**
//  * @param {Object} options
//  * @param {string|string[]} options.to          - Recipient(s)
//  * @param {string}          options.subject     - Email subject
//  * @param {string}          [options.text]      - Plain-text body
//  * @param {string}          [options.html]      - HTML body
//  * @param {string}          [options.from]      - Override sender (defaults to SES_FROM_EMAIL)
//  * @param {Array}           [options.attachments] - nodemailer attachment objects
//  *   Each attachment: { filename, path } OR { filename, content (Buffer/string), contentType }
//  *   Supports PDF, Excel (.xlsx), images, etc.
//  */
// const sendEmail = async ({ to, subject, text, html, from, attachments = [] }) => {
//   const mailOptions = {
//     from: from || process.env.SES_FROM_EMAIL,
//     to: Array.isArray(to) ? to.join(", ") : to,
//     subject,
//     text,
//     html,
//     attachments,
//   };

//   try {
//     const info = await transporter.sendMail(mailOptions);
//     console.log("Email sent:", info.messageId);
//     return info;
//   } catch (err) {
//     console.error("Error sending email:", err);
//     throw err;
//   }
// };

// module.exports = sendEmail;



/*new email sending function*/


const nodemailer = require("nodemailer");

// Create SMTP transporter (example: Gmail)
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // true for 465, false for 587
  auth: {
    user: process.env.NODE_MAILER_EMAIL,
    pass: process.env.NODE_MAILER_PASSWORD,
  },
});

/**
 * Send email using SMTP (no AWS SES)
 */
const sendEmail = async ({ to, subject, text, html, from, attachments = [] }) => {
  const mailOptions = {
    from: from || process.env.EMAIL_USER,
    to: Array.isArray(to) ? to.join(", ") : to,
    subject,
    text,
    html,
    attachments,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent:", info.messageId);
    return info;
  } catch (err) {
    console.error("Error sending email:", err);
    throw err;
  }
};

module.exports = sendEmail;
