import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, loginWithEmail, loginWithGoogle, registerWithEmail, logoutUser } from '../services/firebase';
// import { syncUserProfile } from '../services/api';

// Initialize context
const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  const [loading, setLoading] = useState(false);
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
      // Skip electronAuth call for testing
      // await window.electronAuth.setAuthToken(token);
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
      // Skip electronAuth call for testing
      // await window.electronAuth.setAuthToken(token);
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
      // Skip electronAuth call for testing
      // await window.electronAuth.setAuthToken(token);
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
      // Skip electronAuth call for testing
      // await window.electronAuth.clearAuthToken();
      setCurrentUser(null);
      return true;
    } catch (err) {
      handleAuthError(err);
      return false;
    }
  };

  // Mock sync with backend
  const syncUser = async (user) => {
    if (user) {
      try {
        // Mocked user profile data
        return { name: user.displayName, email: user.email };
      } catch (err) {
        console.error('Error syncing user profile:', err);
      }
    }
    return null;
  };

  // Set mock user immediately
  useEffect(() => {
    setCurrentUser(auth.currentUser);
    setLoading(false);
    // No need for unsubscribe as we're not using real Firebase auth
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
      {children}
    </AuthContext.Provider>
  );
} 