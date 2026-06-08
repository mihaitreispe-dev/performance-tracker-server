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
  // Undefined when Firebase isn't configured on this deployment —
  // see the boot guard below. Methods check `requireApp()` so an
  // unconfigured push/auth call fails loudly at request time instead
  // of crashing the whole API at boot.
  private app?: admin.app.App;

  constructor(private readonly appConfig: AppConfigService) {}

  onModuleInit() {
    // Reuse the default app if it's already been initialised — happens
    // whenever a second Nest context boots in the same Node process
    // (cron worker + main API, HMR reload, jest isolated suites). The
    // admin SDK throws "app/invalid-app-options" otherwise because it
    // can't deep-equal Credential objects across calls.
    if (admin.apps.length > 0) {
      this.app = admin.app();
      return;
    }
    // Graceful when unconfigured (same posture as StripeService): a
    // deploy without FIREBASE_* creds boots fine, with push + Firebase
    // auth dormant until the secret is populated. Previously a missing
    // key crashed onModuleInit (cert() on an empty/undefined key),
    // which would have hard-failed the first Fargate deploy before
    // the Firebase secret was set.
    const projectId = this.appConfig.firebaseProjectId as string | undefined;
    const clientEmail = this.appConfig.firebaseClientEmail as string | undefined;
    const privateKey = this.appConfig.firebasePrivateKey as string | undefined;
    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn(
        'Firebase not configured (FIREBASE_* unset) — push notifications + Firebase auth disabled until set.',
      );
      return;
    }
    try {
      this.app = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
      });
    } catch (err) {
      this.logger.error(`Firebase init failed; push + Firebase auth disabled: ${err}`);
    }
  }

  /** Throw a clear error if a Firebase-backed method is hit on an unconfigured deploy. */
  private requireApp(): admin.app.App {
    if (!this.app) {
      throw new Error('Firebase is not configured on this deployment (set FIREBASE_* secrets).');
    }
    return this.app;
  }

  // --------------------------------------------------------------------------
  // Auth
  // --------------------------------------------------------------------------

  async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    return this.requireApp().auth().verifyIdToken(idToken);
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
      const messageId = await this.requireApp().messaging().send({
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
      const response = await this.requireApp().messaging().sendEachForMulticast({
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
