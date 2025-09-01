#!/usr/bin/env node

/**
 * 安全发布脚本
 * 
 * 特性：
 * - 自动执行所有质量检查
 * - 检查失败时阻止发布
 * - 二次确认（要求输入版本号）
 * - 支持 dry-run 模式
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function success(message) {
  log(`✅ ${message}`, 'green');
}

function error(message) {
  log(`❌ ${message}`, 'red');
}

function warning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function info(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function critical(message) {
  log(`🚨 ${message}`, 'bgRed');
}

function runCommand(command, description, silent = false) {
  try {
    if (!silent) {
      info(`执行: ${command}`);
    }
    const output = execSync(command, { 
      stdio: silent ? 'pipe' : 'inherit',
      encoding: 'utf8'
    });
    if (!silent) {
      success(description);
    }
    return { success: true, output };
  } catch (err) {
    error(`${description} 失败`);
    if (err.stdout) {
      console.log(err.stdout);
    }
    if (err.stderr) {
      console.error(err.stderr);
    }
    return { success: false, error: err };
  }
}

function getCurrentVersion() {
  const packagePath = path.join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  return packageJson.version;
}

async function checkChangelog(currentVersion) {
  const changelogPath = path.join(process.cwd(), 'CHANGELOG.md');
  
  // 检查 CHANGELOG.md 是否存在
  if (!fs.existsSync(changelogPath)) {
    warning('CHANGELOG.md 文件不存在');
    info('建议创建 CHANGELOG.md 文件记录版本变更');
    return;
  }
  
  // 读取 CHANGELOG 内容
  const changelogContent = fs.readFileSync(changelogPath, 'utf8');
  
  // 检查当前版本是否在 CHANGELOG 中
  const versionPattern = new RegExp(`##\\s*\\[${currentVersion.replace(/\./g, '\\.')}\\]`, 'i');
  const hasCurrentVersion = versionPattern.test(changelogContent);
  
  if (hasCurrentVersion) {
    success(`✅ CHANGELOG.md 已包含版本 ${currentVersion} 的记录`);
    return;
  }
  
  // 当前版本不在 CHANGELOG 中，提示用户
  warning(`⚠️  CHANGELOG.md 中未找到版本 ${currentVersion} 的记录`);
  log('\n📝 请在 CHANGELOG.md 中添加当前版本的变更记录：', 'yellow');
  log(`\n## [${currentVersion}] - ${new Date().toISOString().split('T')[0]}\n`, 'cyan');
  log('### Added', 'cyan');
  log('- 新增功能描述', 'cyan');
  log('\n### Changed', 'cyan');
  log('- 修改内容描述', 'cyan');
  log('\n### Fixed', 'cyan');
  log('- 修复问题描述', 'cyan');
  
  // 询问用户是否继续
  const answer = await askQuestion('\n❓ 是否已更新 CHANGELOG.md？(y/N): ');
  if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
    critical('发布已取消 - 请先更新 CHANGELOG.md');
    process.exit(1);
  }
  
  success('✅ 用户确认已更新 CHANGELOG.md');
}

function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

function askQuestion(question) {
  return new Promise((resolve) => {
    const rl = createReadlineInterface();
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function confirmPublish(currentVersion, isDryRun) {
  log('\n' + '='.repeat(60), 'yellow');
  log('🔒 发布确认', 'bgGreen');
  log('='.repeat(60), 'yellow');
  
  log('\n🚨 准备发布到 npm 仓库！', 'bgRed');
  log(`📦 当前版本: ${currentVersion}`, 'cyan');
  log('🎯 目标仓库: https://packages.aliyun.com/...', 'cyan');
  
  log('\n🔐 为确保发布安全，请输入当前版本号进行确认', 'yellow');
  log('💡 提示：如果不想发布，直接按 Ctrl+C 取消即可', 'blue');
  
  const inputVersion = await askQuestion(`\n❓ 请输入版本号 ${currentVersion} 确认发布: `);
  
  if (inputVersion.trim() !== currentVersion) {
    critical('❌ 版本号不匹配！发布已阻止');
    log(`   期望: "${currentVersion}"`, 'red');
    log(`   输入: "${inputVersion.trim()}"`, 'red');
    log('\n💡 发布已取消，如需发布请重新运行并输入正确的版本号', 'yellow');
    process.exit(1);
  }
  
  success('✅ 版本号确认成功，准备发布...');
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const currentVersion = getCurrentVersion();
  
  log('🚀 Stream Gateway SDK - 安全发布流程', 'magenta');
  log('='.repeat(50), 'magenta');
  
  info(`当前版本: ${currentVersion}`);
  info(`发布模式: ${isDryRun ? 'DRY RUN (测试)' : 'PRODUCTION (生产)'}`);
  
  // 步骤1: 登录检查
  log('\n1️⃣ 检查 npm 登录状态', 'cyan');
  const loginResult = runCommand('npm run login', 'npm 登录检查');
  if (!loginResult.success) {
    critical('npm 登录失败，无法继续发布');
    process.exit(1);
  }
  
  // 步骤2: 代码质量检查
  log('\n2️⃣ 代码质量检查', 'cyan');
  const checkResult = runCommand('npm run check', '代码质量检查');
  if (!checkResult.success) {
    critical('代码质量检查失败！');
    error('发布已阻止 - 请修复以下问题后重试：');
    error('  • TypeScript 类型错误');
    error('  • 代码风格问题');
    log('\n💡 修复建议:');
    log('  npm run typecheck  # 查看类型错误');
    log('  npm run lint:fix   # 自动修复风格问题');
    process.exit(1);
  }
  
  // 步骤3: CHANGELOG 检查
  log('\n3️⃣ CHANGELOG 检查', 'cyan');
  await checkChangelog(currentVersion);
  
  // 步骤4: 功能测试
  log('\n4️⃣ 功能测试', 'cyan');
  const testResult = runCommand('npm test -- --local', '本地功能测试');
  if (!testResult.success) {
    critical('功能测试失败！');
    error('发布已阻止 - 请修复以下问题后重试：');
    error('  • 本地服务器连接问题');
    error('  • SDK 功能异常');
    log('\n💡 修复建议:');
    log('  npm test -- --local   # 测试本地连接');
    log('  npm test -- --pro     # 测试生产环境');
    process.exit(1);
  }
  
  // 步骤5: 构建项目
  log('\n5️⃣ 构建项目', 'cyan');
  const buildResult = runCommand('npm run build', '项目构建');
  if (!buildResult.success) {
    critical('项目构建失败！');
    error('发布已阻止 - 构建过程中出现错误');
    process.exit(1);
  }
  
  // 步骤6: 用户确认（仅生产发布）
  if (!isDryRun) {
    log('\n6️⃣ 用户确认', 'cyan');
    await confirmPublish(currentVersion, isDryRun);
  } else {
    log('\n6️⃣ 跳过用户确认 (DRY RUN 模式)', 'cyan');
    info('DRY RUN 模式会自动跳过确认步骤');
  }
  
  // 步骤7: 执行发布
  log('\n7️⃣ 执行发布', 'cyan');
  const publishCommand = isDryRun ? 'npm publish --dry-run' : 'npm publish --access public';
  const publishResult = runCommand(publishCommand, isDryRun ? '发布测试' : '发布到 npm');
  
  if (!publishResult.success) {
    critical('发布失败！');
    error('可能的原因：');
    error('  • 网络连接问题');
    error('  • 版本号已存在');
    error('  • npm 权限问题');
    process.exit(1);
  }
  
  // 成功完成
  log('\n' + '='.repeat(50), 'green');
  if (isDryRun) {
    success('🎉 DRY RUN 测试完成！');
    info('所有检查都通过了，可以进行实际发布');
    log('\n下一步: npm run release  # 实际发布');
  } else {
    success('🎉 SDK 成功发布到 npm！');
    log(`\n📦 版本 ${currentVersion} 现在可以通过以下方式安装：`, 'cyan');
    log(`   npm install stream-gateway-ts-sdk@${currentVersion}`, 'white');
    
    log('\n💡 建议的后续步骤:', 'yellow');
    log('  1. 创建 git tag: git tag v' + currentVersion);
    log('  2. 推送 tag: git push origin v' + currentVersion);
    log('  3. 更新 CHANGELOG.md (如果还未更新)');
    log('  4. 准备下一个版本: 手动修改 package.json 中的版本号');
  }
  
  log('\n' + '='.repeat(50), 'green');
}

if (require.main === module) {
  main().catch(error => {
    critical(`发布脚本执行失败: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { main };
