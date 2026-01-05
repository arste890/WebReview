/**
 * Email Service
 * Handles sending invitation and notification emails
 */

const nodemailer = require('nodemailer');

let transporter = null;

/**
 * Initialize email transporter
 */
function initEmailTransporter() {
    if (transporter) return transporter;
    
    // Check if email is configured
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
        console.log('Email not configured - emails will be logged to console');
        return null;
    }
    
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
    
    return transporter;
}

/**
 * Send invitation email to a new user
 */
async function sendInvitationEmail(invitation, inviterName) {
    const appUrl = process.env.APP_URL || 'https://webreview.stevensed.org';
    const inviteUrl = `${appUrl}/signup.html?token=${invitation.token}`;
    
    const subject = `You're invited to join StevensIT WebReview`;
    
    const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #1e5fa8 0%, #164785 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { background: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; }
            .button { display: inline-block; background: #1e5fa8; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
            .button:hover { background: #164785; }
            .footer { text-align: center; padding: 20px; color: #64748b; font-size: 12px; }
            .role-badge { display: inline-block; background: #00b4d8; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; text-transform: uppercase; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>StevensIT WebReview</h1>
            </div>
            <div class="content">
                <p>Hello,</p>
                <p><strong>${inviterName}</strong> has invited you to join StevensIT WebReview as a <span class="role-badge">${invitation.role}</span>.</p>
                <p>WebReview is our platform for reviewing and providing feedback on web development projects. You'll be able to:</p>
                <ul>
                    <li>View assigned project previews</li>
                    <li>Submit feedback and comments</li>
                    <li>Track project progress</li>
                    <li>Approve completed work</li>
                </ul>
                <p style="text-align: center;">
                    <a href="${inviteUrl}" class="button">Accept Invitation & Create Account</a>
                </p>
                <p style="font-size: 14px; color: #64748b;">
                    This invitation link will expire in 7 days. If the button doesn't work, copy and paste this URL into your browser:
                    <br><a href="${inviteUrl}" style="color: #1e5fa8;">${inviteUrl}</a>
                </p>
            </div>
            <div class="footer">
                <p>© 2026 StevensIT. All rights reserved.</p>
                <p>If you didn't expect this invitation, you can safely ignore this email.</p>
            </div>
        </div>
    </body>
    </html>
    `;
    
    const textBody = `
You're invited to join StevensIT WebReview

${inviterName} has invited you to join StevensIT WebReview as a ${invitation.role}.

Accept your invitation and create your account here:
${inviteUrl}

This invitation link will expire in 7 days.

If you didn't expect this invitation, you can safely ignore this email.

© 2026 StevensIT. All rights reserved.
    `;
    
    return sendEmail(invitation.email, subject, htmlBody, textBody);
}

/**
 * Send notification email for new feedback
 */
async function sendFeedbackNotification(feedback, project, recipients) {
    const appUrl = process.env.APP_URL || 'https://webreview.stevensed.org';
    const projectUrl = `${appUrl}/#project=${project.id}`;
    
    const subject = `New ${feedback.type} feedback on ${project.name}`;
    
    const priorityColors = {
        high: '#ef4444',
        medium: '#f59e0b',
        low: '#10b981'
    };
    
    const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #1e5fa8 0%, #164785 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; }
            .feedback-box { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .priority { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; color: white; background: ${priorityColors[feedback.priority]}; }
            .button { display: inline-block; background: #1e5fa8; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; }
            .footer { text-align: center; padding: 20px; color: #64748b; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h2 style="margin: 0;">New Feedback Received</h2>
                <p style="margin: 5px 0 0 0; opacity: 0.9;">${project.name}</p>
            </div>
            <div class="content">
                <p><strong>${feedback.authorName}</strong> submitted new feedback:</p>
                <div class="feedback-box">
                    <p style="margin-top: 0;"><strong>Type:</strong> ${feedback.type} <span class="priority">${feedback.priority}</span></p>
                    <p style="margin-bottom: 0;">${feedback.text}</p>
                </div>
                <p style="text-align: center;">
                    <a href="${projectUrl}" class="button">View Project</a>
                </p>
            </div>
            <div class="footer">
                <p>© 2026 StevensIT WebReview</p>
            </div>
        </div>
    </body>
    </html>
    `;
    
    const textBody = `
New Feedback on ${project.name}

${feedback.authorName} submitted new ${feedback.type} feedback (${feedback.priority} priority):

"${feedback.text}"

View project: ${projectUrl}

© 2026 StevensIT WebReview
    `;
    
    // Send to all recipients
    const results = await Promise.allSettled(
        recipients.map(email => sendEmail(email, subject, htmlBody, textBody))
    );
    
    return results;
}

/**
 * Generic email sending function
 */
async function sendEmail(to, subject, htmlBody, textBody) {
    const transport = initEmailTransporter();
    
    if (!transport) {
        // Log email to console if not configured
        console.log('=== EMAIL (not sent - SMTP not configured) ===');
        console.log(`To: ${to}`);
        console.log(`Subject: ${subject}`);
        console.log(`Body: ${textBody}`);
        console.log('===========================================');
        return { success: true, logged: true };
    }
    
    try {
        const info = await transport.sendMail({
            from: `"StevensIT WebReview" <${process.env.SMTP_USER}>`,
            to,
            subject,
            text: textBody,
            html: htmlBody
        });
        
        console.log(`Email sent to ${to}: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error(`Failed to send email to ${to}:`, error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    sendInvitationEmail,
    sendFeedbackNotification,
    sendEmail
};
