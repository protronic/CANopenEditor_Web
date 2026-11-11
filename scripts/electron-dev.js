#!/usr/bin/env node

/**
 * Script to start Electron with Angular dev server
 * Run: node scripts/electron-dev.js
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('Starting Angular dev server and Electron...\n');

// Start Angular dev server
const angularServer = spawn('npm', ['run', 'start'], {
  stdio: 'inherit',
  shell: true
});

// Wait for server to be ready, then start Electron
setTimeout(() => {
  console.log('\nStarting Electron...\n');
  
  const electron = spawn('electron', ['.'], {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      NODE_ENV: 'development'
    }
  });

  // Handle process termination
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    angularServer.kill('SIGINT');
    electron.kill('SIGINT');
    process.exit();
  });

  process.on('SIGTERM', () => {
    console.log('\nShutting down...');
    angularServer.kill('SIGTERM');
    electron.kill('SIGTERM');
    process.exit();
  });

  electron.on('error', (err) => {
    console.error('Electron error:', err);
  });

  angularServer.on('error', (err) => {
    console.error('Angular server error:', err);
  });

  angularServer.on('exit', (code) => {
    console.log(`Angular server exited with code ${code}`);
    electron.kill('SIGTERM');
    process.exit(code);
  });

  electron.on('exit', (code) => {
    console.log(`Electron exited with code ${code}`);
    angularServer.kill('SIGTERM');
    process.exit(code);
  });
}, 5000); // Wait 5 seconds for Angular server to start
