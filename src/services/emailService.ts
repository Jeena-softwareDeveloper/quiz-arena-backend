import nodemailer from 'nodemailer';

export class EmailService {
  private static transporter: any = null;

  private static getTransporter() {
    if (!this.transporter) {
      if (process.env.SMTP_HOST && process.env.SMTP_USER) {
        this.transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || '587', 10),
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });
      } else {
        // Fallback simulated transporter that logs cleanly to console
        this.transporter = {
          sendMail: async (options: any) => {
            console.log('----------------------------------------------------');
            console.log(`📧 [Simulated Email Notification]`);
            console.log(`To: ${options.to}`);
            console.log(`Subject: ${options.subject}`);
            console.log(`Content:\n${options.text || options.html}`);
            console.log('----------------------------------------------------');
            return { messageId: 'simulated-' + Date.now() };
          },
        };
      }
    }
    return this.transporter;
  }

  /**
   * Send registration confirmation when a user pre-registers for a scheduled tournament room
   */
  public static async sendRegistrationConfirmation(
    toEmail: string,
    userName: string,
    roomTitle: string,
    category: string,
    scheduledStartTime: Date,
    joinWindowMinutes: number,
    entryFee: number
  ) {
    try {
      const formattedTime = new Date(scheduledStartTime).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'medium',
        timeStyle: 'short',
      });

      const joinOpensTime = new Date(
        new Date(scheduledStartTime).getTime() - joinWindowMinutes * 60 * 1000
      ).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', timeStyle: 'short' });

      const subject = `Confirmed: Your Tournament Slot for "${roomTitle}"!`;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 550px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
          <h2 style="color: #d97706; margin-bottom: 4px;">Set Quick Trade Tournament Confirmation</h2>
          <p style="color: #475569; font-size: 14px;">Hello <strong>${userName}</strong>,</p>
          <p style="color: #334155; font-size: 14px;">Your registration for the upcoming skill quiz battle has been confirmed.</p>
          
          <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; margin: 16px 0;">
            <p style="margin: 4px 0; font-size: 14px;"><strong>Tournament:</strong> ${roomTitle}</p>
            <p style="margin: 4px 0; font-size: 14px;"><strong>Category:</strong> ${category}</p>
            <p style="margin: 4px 0; font-size: 14px;"><strong>Scheduled Battle Time:</strong> ${formattedTime}</p>
            <p style="margin: 4px 0; font-size: 14px;"><strong>Join Window Opens:</strong> ${joinOpensTime} (${joinWindowMinutes} mins prior)</p>
            <p style="margin: 4px 0; font-size: 14px;"><strong>Entry Fee Paid:</strong> ₹${entryFee}</p>
          </div>

          <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px; font-size: 13px; color: #92400e;">
            ⚠️ <strong>Important Rule:</strong> You must join the live arena during the joining window. Late entries are strictly locked once the battle starts!
          </div>

          <p style="color: #64748b; font-size: 12px; margin-top: 20px; text-align: center;">Set Quick Trade Live Skill Tournaments • Good Luck!</p>
        </div>
      `;

      const transporter = this.getTransporter();
      await transporter.sendMail({
        from: '"Set Quick Trade" <arena@quizplatform.com>',
        to: toEmail || 'player@quizarena.com',
        subject,
        html,
        text: `Tournament Confirmed: ${roomTitle} on ${formattedTime}. Join window opens at ${joinOpensTime}. Entry fee ₹${entryFee}.`,
      });
    } catch (err) {
      console.error('[EmailService] Failed to send registration email:', err);
    }
  }

  /**
   * Send notification when results are approved & released by admin
   */
  public static async sendResultsReleasedNotification(
    toEmail: string,
    userName: string,
    roomTitle: string,
    rank: number,
    prizeWon: number
  ) {
    try {
      const subject = `Results Released: ${roomTitle} - You Ranked #${rank}!`;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 550px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
          <h2 style="color: #d97706;">Tournament Results Announced!</h2>
          <p>Hello <strong>${userName}</strong>,</p>
          <p>The Master Admin has officially released the final results for <strong>${roomTitle}</strong>.</p>
          
          <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 14px; margin: 16px 0; text-align: center;">
            <h3 style="color: #78350f; margin: 0;">Rank: #${rank}</h3>
            ${
              prizeWon > 0
                ? `<p style="color: #b45309; font-size: 18px; font-weight: bold; margin: 6px 0;">🎉 You won ₹${prizeWon}!</p>
                   <p style="color: #78350f; font-size: 12px;">Prize has been credited to your Set Quick Trade wallet balance.</p>`
                : `<p style="color: #475569; font-size: 13px; margin: 6px 0;">Thank you for competing! Better luck next tournament.</p>`
            }
          </div>
          
          <p style="color: #64748b; font-size: 12px; text-align: center;">Set Quick Trade</p>
        </div>
      `;

      const transporter = this.getTransporter();
      await transporter.sendMail({
        from: '"Set Quick Trade" <arena@quizplatform.com>',
        to: toEmail || 'player@quizarena.com',
        subject,
        html,
        text: `Results for ${roomTitle}: You ranked #${rank} with prize ₹${prizeWon}.`,
      });
    } catch (err) {
      console.error('[EmailService] Failed to send results email:', err);
    }
  }
}

