import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// If you have a service account JSON file, point to it here.
// Otherwise, ensure FIREBASE_SERVICE_ACCOUNT_JSON is set in .env with the full JSON content
// or the path to the file.

if (!admin.apps.length) {
    try {
        if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log("Firebase Admin Initialized via Environment Variable");
        } else {
            console.warn("Firebase Admin: No Service Account found. Defaulting to Application Default Credentials.");
            admin.initializeApp({
                credential: admin.credential.applicationDefault(),
                projectId: process.env.VITE_FIREBASE_PROJECT_ID
            });
        }
    } catch (error) {
        console.error("Firebase Admin Initialization Error:", error);
    }
}

export default admin;
