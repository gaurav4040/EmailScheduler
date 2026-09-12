"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEtherealTransporter = getEtherealTransporter;
exports.sendViaEthereal = sendViaEthereal;
const nodemailer_1 = __importDefault(require("nodemailer"));
let testAccount = null;
let transporter = null;
async function getEtherealTransporter() {
    if (transporter)
        return transporter;
    const envUser = process.env.ETHEREAL_USER;
    const envPass = process.env.ETHEREAL_PASS;
    if (envUser && envPass) {
        transporter = nodemailer_1.default.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false,
            auth: {
                user: envUser,
                pass: envPass,
            },
        });
    }
    else {
        // Dynamically generate a test account if credentials aren't set
        testAccount = await nodemailer_1.default.createTestAccount();
        console.log(`[Ethereal] Created test account: ${testAccount.user}`);
        transporter = nodemailer_1.default.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false,
            auth: {
                user: testAccount.user,
                pass: testAccount.pass,
            },
        });
    }
    return transporter;
}
async function sendViaEthereal(payload) {
    const mailTransporter = await getEtherealTransporter();
    const info = await mailTransporter.sendMail({
        from: payload.from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.html.replace(/<[^>]*>?/gm, ''), // fallback plain text
    });
    const previewUrl = nodemailer_1.default.getTestMessageUrl(info);
    console.log(`[Ethereal] Email sent to ${payload.to}. Preview URL: ${previewUrl}`);
    return {
        messageId: info.messageId,
        previewUrl,
    };
}
