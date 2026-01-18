import express from 'express';
import cors from 'cors';
import admin from 'firebase-admin';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import ewaybillRouter from './ewaybillController.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin (Singleton)
if (!admin.apps.length) {
    try {
        let serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

        if (serviceAccountPath) {
            // Remove any surrounding quotes
            serviceAccountPath = serviceAccountPath.replace(/['"]/g, '');

            // Paths to check: Absolute, Relative to Root, Relative to __dirname
            const potentialPaths = [
                path.isAbsolute(serviceAccountPath) ? serviceAccountPath : null,
                path.resolve(process.cwd(), serviceAccountPath),
                path.resolve(__dirname, serviceAccountPath),
                path.resolve(__dirname, 'server', serviceAccountPath)
            ].filter(Boolean);

            let absolutePath = potentialPaths.find(p => fs.existsSync(p));

            if (absolutePath) {
                admin.initializeApp({
                    credential: admin.credential.cert(absolutePath)
                });
                console.log(`✅ Firebase Admin Initialized via Key File: ${absolutePath}`);
            } else {
                console.error(`❌ ERROR: Service Account Key not found. Paths tried: ${potentialPaths.join(', ')}`);
                throw new Error('Service Account Key File Not Found');
            }
        } else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
            const serviceAccountBody = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccountBody)
            });
            console.log("✅ Firebase Admin Initialized via Environment JSON");
        } else {
            console.warn("⚠️ GOOGLE_APPLICATION_CREDENTIALS not set. Falling back to Application Default.");
            admin.initializeApp({
                credential: admin.credential.applicationDefault(),
                projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'inventory-management-120a5'
            });
            console.log("ℹ️ Firebase Admin Initialized via ADC");
        }
    } catch (error) {
        console.error("❌ Firebase Admin Initialization Critical Error:", error.message);
    }
}

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/ewaybill', ewaybillRouter);

// Basic Root
app.get('/', (req, res) => {
    res.json({ message: "Inventory Management Backend API Running" });
});

app.listen(5001, '0.0.0.0', () => {
    console.log(`🚀 Server is running on port 5001`);
    console.log(`🔗 Interface: 0.0.0.0`);
    console.log(`📄 E-Way Bill Endpoint: http://localhost:5001/api/ewaybill/generate`);
});
