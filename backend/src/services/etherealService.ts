import nodemailer from 'nodemailer';

let testAccount: nodemailer.TestAccount | null = null;
let transporter: nodemailer.Transporter | null = null;

export async function getEtherealTransporter(): Promise<nodemailer.Transporter> {
  if (transporter) return transporter;

  const envUser = process.env.ETHEREAL_USER;
  const envPass = process.env.ETHEREAL_PASS;

  if (envUser && envPass) {
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: envUser,
        pass: envPass,
      },
    });
  } else {
    // Dynamically generate a test account if credentials aren't set
    testAccount = await nodemailer.createTestAccount();
    console.log(`[Ethereal] Created test account: ${testAccount.user}`);
    transporter = nodemailer.createTransport({
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

export interface SendEmailPayload {
  from: string;
  to: string;
  subject: string;
  html: string;
}

export interface SendEmailResult {
  messageId: string;
  previewUrl: string | false;
}

export async function sendViaEthereal(payload: SendEmailPayload): Promise<SendEmailResult> {
  const mailTransporter = await getEtherealTransporter();

  const info = await mailTransporter.sendMail({
    from: payload.from,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.html.replace(/<[^>]*>?/gm, ''), // fallback plain text
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);
  console.log(`[Ethereal] Email sent to ${payload.to}. Preview URL: ${previewUrl}`);

  return {
    messageId: info.messageId,
    previewUrl,
  };
}
