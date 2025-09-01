#!/usr/bin/env node
/**
 * 检查 npm 登录状态脚本
 */

const { execSync } = require('child_process');

const NPM_REGISTRY = 'https://packages.aliyun.com/64796c98b44b3d9a1d164287/npm/npm-registry/';
const NPM_USERNAME = '64796c7ad8552e6f614a6a52';
const NPM_PASSWORD = 'de2UVe=OODKX';

async function checkLoginStatus() {
  try {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    
    // 检查 .npmrc 文件是否包含认证token
    const npmrcPath = path.join(os.homedir(), '.npmrc');
    if (fs.existsSync(npmrcPath)) {
      const npmrcContent = fs.readFileSync(npmrcPath, 'utf8');
      if (npmrcContent.includes('//packages.aliyun.com/64796c98b44b3d9a1d164287/npm/npm-registry/:_authToken')) {
        console.log('Already logged in, skipping login');
        return true;
      }
    }
    
    console.log('Not logged in, manual login required');
    return false;
  } catch (error) {
    console.log('Not logged in, manual login required');
    return false;
  }
}

async function checkLogin() {
  try {
    // 确保使用正确的 registry
    console.log('Setting npm registry...');
    execSync(`npm config set registry ${NPM_REGISTRY}`, { stdio: 'inherit' });
    
    // 检查是否已经登录
    if (await checkLoginStatus()) {
      return;
    }
    
    // 没有登录，提示手动登录信息
    console.log('\n\x1b[31m%s\x1b[0m', '=== MANUAL LOGIN REQUIRED ===');
    console.log('\x1b[31m%s\x1b[0m', 'Step 1: Run the following command:');
    console.log('\x1b[33m%s\x1b[0m', 'npm login');
    console.log('\n\x1b[31m%s\x1b[0m', 'Step 2: Enter these credentials when prompted:');
    console.log(`Username: ${NPM_USERNAME}`);
    console.log(`Password: ${NPM_PASSWORD}`);
    console.log('\n\x1b[31m%s\x1b[0m', 'Step 3: After login, run:');
    console.log('\x1b[33m%s\x1b[0m', 'npm run publish:pkg');
    process.exit(1);
    
  } catch (error) {
    console.error('Login check failed:', error.message);
    process.exit(1);
  }
}

// 如果直接执行此脚本
if (require.main === module) {
  checkLogin().catch(error => {
    console.error('Script execution failed:', error);
    process.exit(1);
  });
}

module.exports = { checkLogin, checkLoginStatus };