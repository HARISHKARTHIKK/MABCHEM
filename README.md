# inventory-gpp-dashboard

A full-stack Inventory Management System inspired by the GST e-Invoice dashboard. Built with React (Vite), Tailwind CSS, and Firebase.

## Features

- **Dashboard**: Overview of sales, stock, invoices with interactive charts.
- **Product Management**: Add, edit, and track products with stock levels.
- **Inventory Tracking**: Monitor stock changes.
- **Invoicing**: Create GEPP-style invoices (Structure ready).
- **Authentication**: Role-based access (Admin/Staff) using Firebase.

## Setup Instructions

1.  **Install Dependencies**
    ```bash
    npm install
    ```

2.  **Configure Firebase**
    - Create a project at [Firebase Console](https://console.firebase.google.com/).
    - Enable **Authentication** (Email/Password).
    - Enable **Firestore Database**.
    - Copy your web app configuration keys.
    - Create a `.env` file in the root directory (copy from `.env.example` if available) or update `src/lib/firebase.js` directly (or use Vite environment variables).
    
    Example `.env`:
    ```env
    VITE_FIREBASE_API_KEY=your_api_key
    VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
    VITE_FIREBASE_PROJECT_ID=your_project_id
    VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
    VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
    VITE_FIREBASE_APP_ID=your_app_id
    ```

3.  **Run Locally**
    ```bash
    npm run dev
    ```

## Project Structure

- `src/components`: UI components (Sidebar, Header, Layout).
- `src/pages`: Application pages (Dashboard, Products, Login).
- `src/context`: Auth context provider.
- `src/lib`: Firebase setup and utilities.

## Security Rules

Deploy the rules found in `firestore.rules` to your Firebase Firestore Rules tab tabs to ensure data security.
# INVENTORY-MANAGEMENT
