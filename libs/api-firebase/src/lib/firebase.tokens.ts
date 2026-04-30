import type { app, auth, firestore, storage } from 'firebase-admin';

export const FIRESTORE = Symbol.for('learnwren.api-firebase.firestore');
export const FIREBASE_AUTH = Symbol.for('learnwren.api-firebase.auth');
export const FIREBASE_STORAGE = Symbol.for('learnwren.api-firebase.storage');

export type FirestoreHandle = firestore.Firestore;
export type FirebaseAuthHandle = auth.Auth;
export type FirebaseStorageHandle = storage.Storage;
export type FirebaseAppHandle = app.App;
