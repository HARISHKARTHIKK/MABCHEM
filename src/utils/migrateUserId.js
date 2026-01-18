import { collection, getDocs, updateDoc, doc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { getAuth } from "firebase/auth";

export const migrateUserId = async () => {
    const auth = getAuth();
    if (!auth.currentUser) {
        alert("Login required before migration");
        return;
    }

    const uid = auth.currentUser.uid;

    const collections = [
        "products",
        "customers",
        "invoices",
        "invoiceItems",
        "stockMovements"
    ];

    for (const col of collections) {
        const snapshot = await getDocs(collection(db, col));

        for (const document of snapshot.docs) {
            const data = document.data();

            if (!data.userId) {
                await updateDoc(doc(db, col, document.id), {
                    userId: uid
                });
            }
        }
    }

    alert("Migration completed successfully ✅");
};
