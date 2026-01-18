import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

let app;
let auth;
let db;

try {
    // Check if critical keys are present
    if (!firebaseConfig.apiKey || !firebaseConfig.appId) {
        throw new Error("Missing Firebase Configuration Keys. Check your .env file.");
    }
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    console.log("Firebase Initialized with Project:", firebaseConfig.projectId);
} catch (error) {
    console.error("Firebase Initialization Error:", error);
    // Ensure we don't crash exports, but they will be undefined or restricted
    // This helps the app render the Error Boundary instead of blank screen
}

export { auth, db };
