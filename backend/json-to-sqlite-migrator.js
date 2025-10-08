const fs = require('fs');
const path = require('path');
const { logWithContext } = require('../utils/logger');

function log(context, level, func, message, details = {}) {
  logWithContext(context, func, message, details);
}

class JSONToSQLiteMigrator {
  constructor(app, databaseManager) {
    this.app = app;
    this.db = databaseManager;
    this.userDataPath = app.getPath('userData');
  }
  
  async migrate() {
    log('MIGRATION', 1, 'migrate', 'Starting JSON to SQLite migration');
    
    try {
      await this.backupJSON();
      
      await this.migrateSessions();
      await this.migrateArtifacts();
      await this.migrateProjects();
      await this.migrateSettings();
      
      const verified = await this.verifyMigration();
      
      if (verified) {
        this.db.db.prepare(`
          INSERT OR REPLACE INTO migration_info (key, value, timestamp)
          VALUES (?, ?, ?)
        `).run('migration_complete', 'true', Date.now());
        
        log('MIGRATION', 1, 'migrate', 'Migration completed successfully');
        return { success: true };
      } else {
        throw new Error('Migration verification failed');
      }
    } catch (error) {
      log('MIGRATION', 4, 'migrate', 'Migration failed', { error: error.message, stack: error.stack });
      await this.rollback();
      return { success: false, error: error.message };
    }
  }
  
  async backupJSON() {
    const backupDir = path.join(this.userDataPath, 'json_backup');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir);
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDirWithTimestamp = path.join(backupDir, `backup_${timestamp}`);
    fs.mkdirSync(backupDirWithTimestamp, { recursive: true });
    
    const files = [
      'chat_data.json',
      'artifacts.json',
      'projects.json',
      'ai-model.conf.json'
    ];
    
    for (const file of files) {
      const srcPath = path.join(this.userDataPath, file);
      if (fs.existsSync(srcPath)) {
        const destPath = path.join(backupDirWithTimestamp, file);
        fs.copyFileSync(srcPath, destPath);
        log('MIGRATION', 2, 'backupJSON', `Backed up ${file}`, { destPath });
      }
    }
    
    log('MIGRATION', 1, 'backupJSON', 'All JSON files backed up', { backupDir: backupDirWithTimestamp });
  }
  
  async migrateSessions() {
    const dataFile = path.join(this.userDataPath, 'chat_data.json');
    if (!fs.existsSync(dataFile)) {
      log('MIGRATION', 2, 'migrateSessions', 'No sessions file found, skipping');
      return;
    }
    
    const rawData = fs.readFileSync(dataFile, 'utf-8');
    const data = JSON.parse(rawData);
    const sessions = data.sessions || [];
    
    log('MIGRATION', 1, 'migrateSessions', `Migrating ${sessions.length} sessions`);
    
    this.db.transaction(() => {
      for (const session of sessions) {
        try {
          this.db.saveSession(session);
          
          if (session.messages && Array.isArray(session.messages)) {
            for (let i = 0; i < session.messages.length; i++) {
              const [role, content, metadata = {}] = session.messages[i];
              this.db.addMessage(session.id, role, content, metadata, i);
            }
          }
        } catch (error) {
          log('MIGRATION', 4, 'migrateSessions', 'Failed to migrate session', { 
            sessionId: session.id, 
            error: error.message 
          });
          throw error;
        }
      }
    });
    
    log('MIGRATION', 1, 'migrateSessions', 'Sessions migrated successfully');
  }
  
  async migrateArtifacts() {
    const artifactsFile = path.join(this.userDataPath, 'artifacts.json');
    if (!fs.existsSync(artifactsFile)) {
      log('MIGRATION', 2, 'migrateArtifacts', 'No artifacts file found, skipping');
      return;
    }
    
    const rawData = fs.readFileSync(artifactsFile, 'utf-8');
    const artifacts = JSON.parse(rawData);
    
    log('MIGRATION', 1, 'migrateArtifacts', `Migrating ${artifacts.length} artifacts`);
    
    this.db.transaction(() => {
      for (const artifact of artifacts) {
        try {
          this.db.saveArtifact(artifact);
        } catch (error) {
          log('MIGRATION', 4, 'migrateArtifacts', 'Failed to migrate artifact', { 
            artifactId: artifact.id, 
            error: error.message 
          });
          throw error;
        }
      }
    });
    
    log('MIGRATION', 1, 'migrateArtifacts', 'Artifacts migrated successfully');
  }
  
  async migrateProjects() {
    const projectsFile = path.join(this.userDataPath, 'projects.json');
    if (!fs.existsSync(projectsFile)) {
      log('MIGRATION', 2, 'migrateProjects', 'No projects file found, skipping');
      return;
    }
    
    const rawData = fs.readFileSync(projectsFile, 'utf-8');
    const projects = JSON.parse(rawData);
    
    log('MIGRATION', 1, 'migrateProjects', `Migrating ${projects.length} projects`);
    
    this.db.transaction(() => {
      for (const project of projects) {
        try {
          this.db.saveProject(project);
          
          if (project.files && Array.isArray(project.files)) {
            this.db.deleteProjectFiles(project.id);
            
            for (const file of project.files) {
              this.db.saveProjectFile(project.id, file);
            }
          }
        } catch (error) {
          log('MIGRATION', 4, 'migrateProjects', 'Failed to migrate project', { 
            projectId: project.id, 
            error: error.message 
          });
          throw error;
        }
      }
    });
    
    log('MIGRATION', 1, 'migrateProjects', 'Projects migrated successfully');
  }
  
  async migrateSettings() {
    const dataFile = path.join(this.userDataPath, 'chat_data.json');
    if (!fs.existsSync(dataFile)) {
      log('MIGRATION', 2, 'migrateSettings', 'No settings file found, skipping');
      return;
    }
    
    const rawData = fs.readFileSync(dataFile, 'utf-8');
    const data = JSON.parse(rawData);
    const settings = data.settings || {};
    
    log('MIGRATION', 1, 'migrateSettings', `Migrating ${Object.keys(settings).length} settings`);
    
    this.db.transaction(() => {
      for (const [key, value] of Object.entries(settings)) {
        this.db.saveSetting(key, value);
      }
    });
    
    log('MIGRATION', 1, 'migrateSettings', 'Settings migrated successfully');
  }
  
  async verifyMigration() {
    try {
      const jsonSessions = this.getJSONSessionCount();
      const dbSessions = this.db.getAllSessions().length;
      
      if (jsonSessions !== dbSessions) {
        log('MIGRATION', 4, 'verifyMigration', 'Session count mismatch', { 
          jsonSessions, 
          dbSessions 
        });
        return false;
      }
      
      const sessions = this.db.getAllSessions();
      if (sessions.length > 0) {
        for (let i = 0; i < Math.min(3, sessions.length); i++) {
          const session = sessions[i];
          const dbMessages = this.db.getMessages(session.id).length;
          
          const jsonData = this.loadJSONData();
          const jsonSession = jsonData.sessions.find(s => s.id === session.id);
          const jsonMessages = jsonSession ? jsonSession.messages.length : 0;
          
          if (dbMessages !== jsonMessages) {
            log('MIGRATION', 4, 'verifyMigration', 'Message count mismatch', { 
              sessionId: session.id,
              dbMessages, 
              jsonMessages 
            });
            return false;
          }
        }
      }
      
      const jsonArtifacts = this.getJSONArtifactCount();
      const dbArtifacts = this.db.getAllArtifacts().length;
      
      if (jsonArtifacts !== dbArtifacts) {
        log('MIGRATION', 4, 'verifyMigration', 'Artifact count mismatch', { 
          jsonArtifacts, 
          dbArtifacts 
        });
        return false;
      }
      
      const jsonProjects = this.getJSONProjectCount();
      const dbProjects = this.db.getAllProjects().length;
      
      if (jsonProjects !== dbProjects) {
        log('MIGRATION', 4, 'verifyMigration', 'Project count mismatch', { 
          jsonProjects, 
          dbProjects 
        });
        return false;
      }
      
      log('MIGRATION', 1, 'verifyMigration', 'Migration verification passed', {
        sessions: dbSessions,
        artifacts: dbArtifacts,
        projects: dbProjects
      });
      return true;
    } catch (error) {
      log('MIGRATION', 4, 'verifyMigration', 'Verification failed', { error: error.message });
      return false;
    }
  }
  
  getJSONSessionCount() {
    const dataFile = path.join(this.userDataPath, 'chat_data.json');
    if (!fs.existsSync(dataFile)) return 0;
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
    return data.sessions ? data.sessions.length : 0;
  }
  
  getJSONArtifactCount() {
    const artifactsFile = path.join(this.userDataPath, 'artifacts.json');
    if (!fs.existsSync(artifactsFile)) return 0;
    const data = JSON.parse(fs.readFileSync(artifactsFile, 'utf-8'));
    return Array.isArray(data) ? data.length : 0;
  }
  
  getJSONProjectCount() {
    const projectsFile = path.join(this.userDataPath, 'projects.json');
    if (!fs.existsSync(projectsFile)) return 0;
    const data = JSON.parse(fs.readFileSync(projectsFile, 'utf-8'));
    return Array.isArray(data) ? data.length : 0;
  }
  
  loadJSONData() {
    const dataFile = path.join(this.userDataPath, 'chat_data.json');
    if (!fs.existsSync(dataFile)) return { sessions: [] };
    return JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
  }
  
  async rollback() {
    log('MIGRATION', 3, 'rollback', 'Rolling back migration - JSON backups remain intact');
  }
}

module.exports = JSONToSQLiteMigrator;
