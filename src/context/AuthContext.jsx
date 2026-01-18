import { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

const AuthContext = createContext();

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [userRole, setUserRole] = useState(null);
    const [userData, setUserData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!auth) {
            console.error("Auth instance is missing. Check Firebase configuration.");
            setLoading(false);
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                // 🚀 OPTIMIZATION: Set user immediately so UI doesn't hang
                setCurrentUser(user);
                setLoading(false);

                // Fetch user role from Firestore in background
                try {
                    const fetchRole = async () => {
                        const docRef = doc(db, "users", user.uid);
                        const docSnap = await getDoc(docRef);

                        if (docSnap.exists()) {
                            const data = docSnap.data();
                            if (data.active === false) return 'suspended';
                            return data;
                        } else {
                            // Create default user doc
                            await setDoc(docRef, {
                                email: user.email,
                                role: 'viewer',
                                active: true,
                                createdAt: serverTimestamp(),
                                locations: [] // Optional
                            });
                            return 'viewer';
                        }
                    };

                    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve('timeout'), 4000));

                    // We still use the race for the ROLE, but we don't block the USER login
                    const data = await fetchRole();
                    if (data === 'timeout') {
                        console.warn("User data fetch timed out, defaulting to 'viewer'");
                        setUserRole('viewer');
                        setUserData({ role: 'viewer' });
                    } else if (data === 'suspended') {
                        setUserRole('suspended');
                        setUserData({ role: 'suspended', active: false });
                    } else {
                        setUserRole(data.role || 'viewer');
                        setUserData(data);
                    }
                } catch (error) {
                    console.error("Error fetching user data:", error);
                    setUserRole('viewer');
                    setUserData({ role: 'viewer' });
                }
            } else {
                setCurrentUser(null);
                setUserRole(null);
                setLoading(false);
            }
        });

        return () => unsubscribe();
    }, []);

    const login = (email, password) => {
        return signInWithEmailAndPassword(auth, email, password);
    };

    const logout = () => {
        return signOut(auth);
    };

    const value = {
        currentUser,
        userRole,
        userData,
        login,
        logout,
        loading
    };

    return (
        <AuthContext.Provider value={value}>
            {loading ? (
                <div style={{
                    height: '100vh',
                    width: '100vw',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    backgroundColor: '#f8fafc',
                    flexDirection: 'column',
                    gap: '16px'
                }}>
                    <div style={{
                        width: '40px',
                        height: '40px',
                        border: '4px solid #e2e8f0',
                        borderTop: '4px solid #3b82f6',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                    }} />
                    <p style={{ fontFamily: 'sans-serif', color: '#64748b' }}>Initializing System...</p>
                    <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                </div>
            ) : children}
        </AuthContext.Provider>
    );
}
