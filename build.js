#!/usr/bin/env node

/**
 * Build Helper Script
 * 
 * Copies .env file before building with electron-builder
 * Ensures environment variables are available in the built application
 */

const fs = require('fs');
const path = require('path');

const srcEnv = path.join(__dirname, '.env');
const outDir = path.join(__dirname, 'out');
const destEnv = path.join(outDir, '.env');

console.log('🔨 Build Helper: Preparing environment...\n');

// Check if .env exists
if (!fs.existsSync(srcEnv)) {
  console.log('⚠️  WARNING: .env file not found');
  console.log('   This is optional, but some features may not work without it.');
  console.log('   See .env.example for available configuration options.\n');
} else {
  try {
    // Ensure out directory exists
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    
    // Copy .env to out/
    const envContent = fs.readFileSync(srcEnv, 'utf8');
    fs.writeFileSync(destEnv, envContent);
    
    console.log('✅ .env file copied to out/ directory');
    
    // Count variables
    const varCount = envContent.split('\n').filter(line => 
      line.trim() && !line.trim().startsWith('#') && line.includes('=')
    ).length;
    
    console.log(`   Found ${varCount} environment variables\n`);
  } catch (error) {
    console.error('❌ Error copying .env file:', error.message);
    process.exit(1);
  }
}

// Also copy to root of resources if we're building
const electronBuilderOutDir = path.join(__dirname, 'dist');
if (fs.existsSync(electronBuilderOutDir)) {
  try {
    const distEnv = path.join(electronBuilderOutDir, '.env');
    if (fs.existsSync(srcEnv)) {
      const envContent = fs.readFileSync(srcEnv, 'utf8');
      fs.writeFileSync(distEnv, envContent);
      console.log('✅ .env also copied to dist/ directory\n');
    }
  } catch (error) {
    console.log('ℹ️  dist/ directory not ready yet (this is normal)\n');
  }
}

console.log('🚀 Ready to build!\n');
