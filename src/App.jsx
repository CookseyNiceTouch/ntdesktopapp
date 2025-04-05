import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
// import ProtectedRoute from './components/Auth/ProtectedRoute';
import Login from './pages/Login';
import ChatClient from './pages/ChatClient';

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/chat" element={<ChatClient />} />
          <Route path="/dashboard" element={<Navigate to="/chat" />} />
          <Route path="*" element={<Navigate to="/chat" />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App; 