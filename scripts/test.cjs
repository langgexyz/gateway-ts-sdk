#!/usr/bin/env node

/**
 * 极简环境测试脚本
 * 使用: npm test wsurl=wss://example.com/gateway  (自定义URL)
 *      npm test wsurl=local                       (本地环境)
 *      npm test wsurl=dev                         (开发环境) 
 *      npm test wsurl=pro                         (生产环境)
 *      npm test                                   (默认本地环境)
 */

const { execSync } = require('child_process');

// 环境配置
const ENVIRONMENTS = {
  local: {
    name: '本地环境',
    wsUrl: 'ws://localhost:18443'
  },
  dev: {
    name: '开发环境', 
    wsUrl: 'ws://localhost:18443'
  },
  pro: {
    name: '生产环境',
    wsUrl: 'ws://localhost:18443'
  }
};

// 颜色输出
const log = (msg, color = 'reset') => {
  const colors = { reset: '\x1b[0m', cyan: '\x1b[36m', green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m' };
  console.log(`${colors[color]}${msg}${colors.reset}`);
};

function runCommand(command, description) {
  try {
    log(`🔧 ${description}`, 'cyan');
    execSync(command, { stdio: 'inherit' });
    log(`✅ ${description} 完成`, 'green');
    return true;
  } catch (error) {
    log(`❌ ${description} 失败`, 'red');
    return false;
  }
}

function main() {
  const args = process.argv.slice(2);
  
  // 解析参数 - 只支持 wsurl= 格式
  let environment = ENVIRONMENTS.local; // 默认本地环境
  
  const wsUrlArg = args.find(arg => arg.startsWith('wsurl='));
  if (wsUrlArg) {
    const value = wsUrlArg.split('=')[1];
    
    if (value.startsWith('ws://') || value.startsWith('wss://')) {
      // 自定义 URL: wsurl=wss://example.com/gateway
      environment = {
        name: '自定义环境',
        wsUrl: value
      };
    } else if (ENVIRONMENTS[value]) {
      // 预设环境: wsurl=local|dev|pro
      environment = ENVIRONMENTS[value];
    } else {
      console.error(`❌ 未知环境: ${value}`);
      console.error(`支持的环境: ${Object.keys(ENVIRONMENTS).join(', ')} 或 ws://|wss:// 开头的自定义URL`);
      process.exit(1);
    }
  }
  
  log('='.repeat(50), 'cyan');
  log(`🚀 ${environment.name}测试`, 'cyan');
  log(`🌐 ${environment.wsUrl}`, 'yellow');
  log('='.repeat(50), 'cyan');
  
  // 运行测试步骤
  const steps = [
    ['npm run check', '代码检查'],
    ['npm run build', '项目构建'],
    ['npm pack', '打包测试']
  ];
  
  // 执行基础步骤
  for (const [cmd, desc] of steps) {
    if (!runCommand(cmd, desc)) {
      log(`\n❌ ${environment.name}测试失败 - ${desc}阶段`, 'red');
      process.exit(1);
    }
  }
  
    // 执行环境测试
  log(`\n🔧 ${environment.name}功能测试`, 'cyan');
  try {
    execSync('node examples/node.cjs', {
      stdio: 'inherit',
      env: { ...process.env, WS_URL: environment.wsUrl }
    });
    log(`✅ ${environment.name}功能测试 完成`, 'green');
  } catch (error) {
    log(`❌ ${environment.name}功能测试 失败`, 'red');
    log(`💡 检查 ${environment.wsUrl} 是否可访问`, 'yellow');
    process.exit(1);
  }
  
  log(`\n🎉 ${environment.name}测试完成！`, 'green');
}

if (require.main === module) {
  main();
}