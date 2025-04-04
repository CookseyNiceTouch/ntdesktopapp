import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, loginWithEmail, loginWithGoogle, registerWithEmail, logoutUser } from '../services/firebase';
import { syncUserProfile } from '../services/api';

// Initialize context
const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Handle auth errors
  const handleAuthError = (err) => {
    console.error(err);
    setError(err.message || 'An authentication error occurred');
  };

  // Track analytics
  const trackLogin = (method) => {
    console.log(`User logged in with ${method}`);
    // Add your analytics tracking here
  };

  // Login with email
  const login = async (email, password) => {
    try {
      setLoading(true);
      setError('');
      const userCredential = await loginWithEmail(email, password);
      const token = await userCredential.user.getIdToken();
      await window.electronAuth.setAuthToken(token);
      trackLogin('email');
      return true;
    } catch (err) {
      handleAuthError(err);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Login with Google
  const googleLogin = async () => {
    try {
      setLoading(true);
      setError('');
      const userCredential = await loginWithGoogle();
      const token = await userCredential.user.getIdToken();
      await window.electronAuth.setAuthToken(token);
      trackLogin('google');
      return true;
    } catch (err) {
      handleAuthError(err);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Register new user
  const register = async (email, password) => {
    try {
      setLoading(true);
      setError('');
      const userCredential = await registerWithEmail(email, password);
      const token = await userCredential.user.getIdToken();
      await window.electronAuth.setAuthToken(token);
      trackLogin('registration');
      return true;
    } catch (err) {
      handleAuthError(err);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Logout user
  const logout = async () => {
    try {
      await logoutUser();
      await window.electronAuth.clearAuthToken();
      setCurrentUser(null);
      return true;
    } catch (err) {
      handleAuthError(err);
      return false;
    }
  };

  // Sync with backend
  const syncUser = async (user) => {
    if (user) {
      try {
        const { data } = await syncUserProfile();
        // Store additional user data if needed
        return data;
      } catch (err) {
        console.error('Error syncing user profile:', err);
      }
    }
    return null;
  };

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      setCurrentUser(user);
      if (user) {
        const token = await user.getIdToken();
        await window.electronAuth.setAuthToken(token);
        await syncUser(user);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    loading,
    error,
    login,
    googleLogin,
    register,
    logout,
    syncUser
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
} 