// Type definition for Firebase environment configuration
export interface FirebaseConfig {
  apiKey: string;
  projectId: string;
}

export interface EmulatorHosts {
  auth: string;
  firestore: {
    host: string;
    port: number;
  };
  storage: {
    host: string;
    port: number;
  };
}

export interface Environment {
  firebaseTargetMode: 'emulator' | 'production';
  firebase: FirebaseConfig;
  emulatorHosts?: EmulatorHosts;
}
