import { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc, onSnapshot, query, collection, where, limit, getDocs } from 'firebase/firestore';
import { useAuth } from './AuthContext';

const SettingsContext = createContext();

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider = ({ children }) => {
    const { currentUser } = useAuth();
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);

    const defaultSettings = {
        company: {
            name: 'MAB CHEM. (P) LTD',
            address: '',
            gstin: '',
            pan: '',
            pincode: '',
            state: '',
            currency: '₹',
            unit: 'mts'
        },
        invoice: {
            manualNo: true,
            prefix: 'INV-',
            tax: 18,
            roundOff: true,
            transportExtra: false, // Default behavior
            lockAfterDispatch: true
        },
        inventory: {
            allowNegative: false,
            lowStock: 10,
            enableLogs: true
        },
        locations: [
            { name: 'Warehouse A', type: 'Warehouse', active: true },
            { name: 'Warehouse B', type: 'Warehouse', active: true }
        ],
        transport: {
            enable: true,
            required: false,
            modes: ['By Road', 'By Sea', 'By Air']
        },
        compliance: {
            terms: 'MAB CHEM is a tool for data management. Users are responsible for verifying GST, HSN, and Quantity before final e-Way Bill/Invoice submission.',
            lastSync: new Date().toISOString()
        },
        api: {
            gspClientId: '',
            gspClientSecret: ''
        }
    };

    // Ensure we have robust defaults for existing users
    const ensureDefaults = (s) => {
        const merged = { ...defaultSettings, ...s };
        // Deep merge specific objects if needed
        merged.company = { ...defaultSettings.company, ...s.company };
        merged.invoice = { ...defaultSettings.invoice, ...s.invoice };
        merged.inventory = { ...defaultSettings.inventory, ...s.inventory };
        merged.transport = { ...defaultSettings.transport, ...s.transport };
        merged.compliance = { ...defaultSettings.compliance, ...s.compliance };
        merged.api = { ...defaultSettings.api, ...s.api };

        // Ensure locations have prefix/nextNumber
        if (Array.isArray(merged.locations)) {
            merged.locations = merged.locations.map(loc => ({
                prefix: 'INV',
                nextNumber: 1,
                ...loc
            }));
        }
        return merged;
    };

    useEffect(() => {
        let unsubscribe = () => { };

        const fetchSettings = async () => {
            if (!currentUser) {
                setSettings(ensureDefaults(defaultSettings));
                setLoading(false);
                return;
            }

            try {
                // 1. Try to get shared organization settings first
                const sharedRef = doc(db, 'settings', 'organization_settings');
                const sharedSnap = await getDoc(sharedRef);

                let targetUid = 'organization_settings';

                if (!sharedSnap.exists()) {
                    // 2. If no shared settings, find the primary admin's settings to use as a template
                    const adminQuery = query(collection(db, 'users'), where('role', '==', 'admin'), limit(1));
                    const adminSnap = await getDocs(adminQuery);

                    if (!adminSnap.empty) {
                        targetUid = adminSnap.docs[0].id;
                        console.log("Using Admin's settings as template:", targetUid);
                    } else {
                        // 3. Last fallback: use current user's settings or initialize defaults
                        targetUid = currentUser.uid;
                    }
                }

                const ref = doc(db, 'settings', targetUid);
                unsubscribe = onSnapshot(ref, (snap) => {
                    if (snap.exists()) {
                        setSettings(ensureDefaults(snap.data()));
                    } else {
                        // If we were looking for organization_settings and it doesn't exist, create it
                        if (targetUid === 'organization_settings') {
                            setDoc(ref, defaultSettings);
                            setSettings(ensureDefaults(defaultSettings));
                        } else {
                            // If looking for admin setts and failed, fallback to defaults
                            setSettings(ensureDefaults(defaultSettings));
                        }
                    }
                    setLoading(false);
                }, (error) => {
                    console.error("Settings stream error:", error);
                    setLoading(false);
                });
            } catch (error) {
                console.error("Master settings discovery failed:", error);
                setSettings(ensureDefaults(defaultSettings));
                setLoading(false);
            }
        };

        fetchSettings();
        return () => unsubscribe();
    }, [currentUser]);

    const updateSettings = async (newSettings) => {
        const ref = doc(db, 'settings', 'organization_settings');
        await setDoc(ref, newSettings, { merge: true });
    };

    return (
        <SettingsContext.Provider value={{ settings, updateSettings, loading }}>
            {children}
        </SettingsContext.Provider>
    );
};
