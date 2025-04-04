import React from 'react';
import { useAuth } from '../context/AuthContext';
import '../styles/Dashboard.css';

const Dashboard = () => {
  const { currentUser, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Dashboard</h1>
        <button onClick={handleLogout} className="btn-logout">
          Logout
        </button>
      </header>
      
      <div className="dashboard-content">
        <div className="welcome-card">
          <h2>Welcome, {currentUser?.email}</h2>
          <p>This is a temporary dashboard page that will be expanded later.</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard; 