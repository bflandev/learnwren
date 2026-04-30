import { Controller, Get, Inject } from '@nestjs/common';
import {
  FIRESTORE,
  type FirestoreHandle,
} from '@learnwren/api-firebase';

interface SmokeDoc {
  writtenAt: string;
}

interface SmokeResponse {
  docId: string;
  written: SmokeDoc;
  readBack: SmokeDoc | undefined;
}

@Controller('firestore-smoke')
export class FirestoreSmokeController {
  constructor(@Inject(FIRESTORE) private readonly firestore: FirestoreHandle) {}

  @Get()
  async runSmoke(): Promise<SmokeResponse> {
    const docId = String(Date.now());
    const written: SmokeDoc = { writtenAt: new Date().toISOString() };
    const ref = this.firestore.doc(`_smoke/${docId}`);
    await ref.set(written);
    const snap = await ref.get();
    return {
      docId,
      written,
      readBack: snap.exists ? (snap.data() as SmokeDoc) : undefined,
    };
  }
}
