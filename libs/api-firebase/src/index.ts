export {
  FIRESTORE,
  FIREBASE_AUTH,
  FIREBASE_STORAGE,
  FIREBASE_WEB_API_KEY,
  type FirestoreHandle,
  type FirebaseAuthHandle,
  type FirebaseStorageHandle,
  type FirebaseAppHandle,
  type FirebaseWebApiKey,
} from './lib/firebase.tokens';
export { FirebaseAdminModule } from './lib/firebase-admin.module';
export {
  readStoredUserProfiles,
  scanStoredUserProfiles,
  type StoredUserProfile,
  type StoredUserRecord,
} from './lib/user-profile.reader';
