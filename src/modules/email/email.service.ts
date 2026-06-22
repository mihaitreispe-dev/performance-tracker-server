import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

import { AppConfigService } from 'src/modules/config/app-config.service';

/**
 * Transactional email via SendGrid's v3 REST API.
 *
 * Uses the HTTP API directly (axios) rather than the @sendgrid/mail SDK to
 * avoid a new dependency — the payload is small and stable. Graceful
 * degradation mirrors FirebaseService: when SENDGRID_API_KEY / EMAIL_FROM are
 * unset the service is dormant (a deploy without the secret boots fine and
 * email-channel notification rules just record a "not configured" delivery
 * instead of throwing).
 *
 * SendGrid accepts a batch with a 202 but does not report per-recipient
 * delivery synchronously, so `ok` here means "accepted for delivery". Real
 * bounce/delivery status would come from SendGrid event webhooks (future).
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly apiKey?: string;
  private readonly from?: string;
  private readonly fromName?: string;

  constructor(appConfig: AppConfigService) {
    this.apiKey = appConfig.sendgridApiKey;
    this.from = appConfig.emailFrom;
    this.fromName = appConfig.emailFromName;
    if (!this.isConfigured()) {
      this.logger.warn(
        'SendGrid not configured (SENDGRID_API_KEY / EMAIL_FROM unset) — email notifications disabled until set.',
      );
    }
  }

  /** Whether email can actually be sent on this deployment. */
  isConfigured(): boolean {
    return !!this.apiKey && !!this.from;
  }

  /** Send one email. Never throws; returns { ok } or { ok:false, error }. */
  async sendToEmail(input: {
    to: string;
    subject: string;
    html?: string;
    text?: string;
  }): Promise<{ ok: boolean; error?: string }> {
    const [result] = await this.sendToEmails({ ...input, to: [input.to] });
    return result ?? { ok: false, error: 'no result' };
  }

  /**
   * Send the same email to many recipients. Each gets its own SendGrid
   * personalization so recipients are never exposed to one another (no shared
   * To header). Returns per-recipient results in input order. Never throws — a
   * transport failure marks every recipient failed so the caller can log and
   * record delivery rows.
   */
  async sendToEmails(input: {
    to: string[];
    subject: string;
    html?: string;
    text?: string;
  }): Promise<Array<{ email: string; ok: boolean; error?: string }>> {
    if (input.to.length === 0) return [];
    if (!this.isConfigured()) {
      return input.to.map((email) => ({ email, ok: false, error: 'email not configured' }));
    }

    // SendGrid requires at least one content part; fall back to the subject as
    // plain text if the caller passed neither html nor text.
    const content: Array<{ type: string; value: string }> = [];
    if (input.text) content.push({ type: 'text/plain', value: input.text });
    if (input.html) content.push({ type: 'text/html', value: input.html });
    if (content.length === 0) content.push({ type: 'text/plain', value: input.subject });

    try {
      await axios.post(
        'https://api.sendgrid.com/v3/mail/send',
        {
          // One personalization per recipient → individual delivery, no
          // leaked recipient list.
          personalizations: input.to.map((email) => ({ to: [{ email }] })),
          from: this.fromName ? { email: this.from, name: this.fromName } : { email: this.from },
          subject: input.subject,
          content,
        },
        {
          headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
          timeout: 15_000,
        },
      );
      return input.to.map((email) => ({ email, ok: true }));
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? `${err.response?.status ?? ''} ${JSON.stringify(err.response?.data ?? err.message)}`.trim()
        : (err as Error).message;
      this.logger.warn(`SendGrid send failed: ${message}`);
      return input.to.map((email) => ({ email, ok: false, error: message }));
    }
  }
}
