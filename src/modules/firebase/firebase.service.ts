import { Injectable, OnModuleInit } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { AppConfigService } from 'src/modules/config/app-config.service';

@Injectable()
export class FirebaseService implements OnModuleInit {
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

  async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    return this.app.auth().verifyIdToken(idToken);
  }
}
