module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true
  },
  extends: [
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  rules: {
    // 强制使用分号
    'semi': ['error', 'always'],
    
    // 强制使用单引号
    'quotes': ['error', 'single', { allowTemplateLiterals: true }],
    
    // 禁止 console.log（但允许 console.error 等）
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    
    // 强制对象和数组最后一个元素后加逗号
    'comma-dangle': ['error', 'never'],
    
    // 允许未使用的变量（TypeScript 会处理这个）
    'no-unused-vars': 'off',
    
    // 允许未定义的变量（TypeScript 会处理这个）
    'no-undef': 'off'
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    '*.js',
    '*.cjs',
    '*.mjs',
    'examples/',
    'scripts/'
  ]
};
