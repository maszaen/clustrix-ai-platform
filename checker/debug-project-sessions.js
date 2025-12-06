// Debug script untuk cek project sessions di database
// Jalankan dengan: npm run dev, lalu buka DevTools dan jalankan di console

// Atau tambahkan ke main.js untuk debug

const { app } = require('electron');
const path = require('path');

async function debugProjectSessions() {
  const DatabaseManager = require('../backend/data/database-manager');
  
  const db = new DatabaseManager(app);
  
  // Get all sessions
  const allSessions = db.getAllSessions();
  
  console.log('\n=== DEBUG PROJECT SESSIONS ===\n');
  console.log(`Total sessions: ${allSessions.length}`);
  
  // Filter sessions with project_id
  const projectSessions = allSessions.filter(s => s.project_id);
  console.log(`Sessions with project_id: ${projectSessions.length}`);
  
  // Show details
  console.log('\nSessions with project_id:');
  projectSessions.forEach(s => {
    console.log(`  - ${s.id}: project_id=${s.project_id}, is_project=${s.is_project}, type=${s.type}, name=${s.name}`);
  });
  
  console.log('\nSessions WITHOUT project_id (first 10):');
  const noProjectSessions = allSessions.filter(s => !s.project_id).slice(0, 10);
  noProjectSessions.forEach(s => {
    console.log(`  - ${s.id}: is_project=${s.is_project}, type=${s.type}, name=${s.name}`);
  });
  
  // Check projects table
  const allProjects = db.getAllProjects();
  console.log(`\nTotal projects: ${allProjects.length}`);
  allProjects.forEach(p => {
    const count = allSessions.filter(s => s.project_id === p.id).length;
    console.log(`  - ${p.id}: name=${p.name}, sessions=${count}`);
  });
  
  db.close();
}

module.exports = { debugProjectSessions };
