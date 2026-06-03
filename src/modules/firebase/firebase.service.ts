import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as admin from 'firebase-admin';

import { AppConfigService } from 'src/modules/config/app-config.service';

/**
 * Wraps firebase-admin for both auth (ID-token verify) and messaging
 * (push delivery).
 *
 * Token-pruning policy: when FCM rejects a token as INVALID_ARGUMENT
 * or NOT_FOUND, the messaging methods log it but DO NOT delete it
 * here — that's the caller's job, because the user repo owns the
 * `users.fcm_tokens` array and only it knows the (userId, token)
 * pair. The methods return per-token `invalidToken: true` flags so
 * callers can react and call UserRepository.removeFcmToken.
 */
@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private app!: admin.app.App;

  constructor(private readonly appConfig: AppConfigService) {}

  onModuleInit() {
    this.app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: this.appConfig.firebaseProjectId,
        clientEmail: this.appConfig.firebaseClientEmail,
        privateKey: this.appConfig.firebasePrivateKey.replace(/\\n/g, '\n'),
      }),
    });
  }

  // --------------------------------------------------------------------------
  // Auth
  // --------------------------------------------------------------------------

  async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    return this.app.auth().verifyIdToken(idToken);
  }

  // --------------------------------------------------------------------------
  // Push messaging
  // --------------------------------------------------------------------------

  /**
   * Send a notification to a single FCM device token. Resolves to
   * the messageId on success, or { error, invalidToken } on failure.
   */
  async sendToToken(input: {
    token: string;
    title: string;
    body: string;
    data?: Record<string, string>;
    /** Optional deep-link the client opens on tap. */
    clickAction?: string;
  }): Promise<{ messageId: string } | { error: string; invalidToken: boolean }> {
    try {
      const messageId = await this.app.messaging().send({
        token: input.token,
        notification: { title: input.title, body: input.body },
        data: {
          ...input.data,
          ...(input.clickAction ? { click_action: input.clickAction } : {}),
        },
        webpush: input.clickAction
          ? { fcmOptions: { link: input.clickAction } }
          : undefined,
      });
      return { messageId };
    } catch (err) {
      return this.classifyError(err);
    }
  }

  /**
   * Multicast — each token succeeds or fails independently. Returns
   * the parallel responses in input order. Empty `tokens` resolves
   * to [] without a network call.
   */
  async sendToTokens(input: {
    tokens: string[];
    title: string;
    body: string;
    data?: Record<string, string>;
    clickAction?: string;
  }): Promise<Array<{ token: string; ok: boolean; error?: string; invalidToken?: boolean }>> {
    if (input.tokens.length === 0) return [];
    try {
      const response = await this.app.messaging().sendEachForMulticast({
        tokens: input.tokens,
        notification: { title: input.title, body: input.body },
        data: {
          ...input.data,
          ...(input.clickAction ? { click_action: input.clickAction } : {}),
        },
        webpush: input.clickAction
          ? { fcmOptions: { link: input.clickAction } }
          : undefined,
      });
      return response.responses.map((r, i) => {
        if (r.success) return { token: input.tokens[i], ok: true };
        const code = r.error?.code ?? '';
        return {
          token: input.tokens[i],
          ok: false,
          error: r.error?.message,
          invalidToken:
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/registration-token-not-registered',
        };
      });
    } catch (err) {
      this.logger.error(`Multicast push send failed: ${(err as Error).message}`);
      return input.tokens.map((token) => ({ token, ok: false, error: (err as Error).message }));
    }
  }

  private classifyError(err: unknown): { error: string; invalidToken: boolean } {
    const code = (err as { code?: string }).code ?? '';
    const message = (err as { message?: string }).message ?? String(err);
    const invalidToken =
      code === 'messaging/invalid-registration-token' ||
      code === 'messaging/registration-token-not-registered';
    if (!invalidToken) {
      this.logger.warn(`FCM send failed: ${code} ${message}`);
    }
    return { error: message, invalidToken };
  }
}
