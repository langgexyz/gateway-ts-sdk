module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true
  },
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended'
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  plugins: [
    '@typescript-eslint'
  ],
  rules: {
    // 允许使用 any 类型（SDK 中有些地方需要）
    '@typescript-eslint/no-explicit-any': 'warn',
    
    // 允许未使用的变量，但以下划线开头的除外
    '@typescript-eslint/no-unused-vars': ['error', { 
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_' 
    }],
    
    // 允许空函数
    '@typescript-eslint/no-empty-function': 'warn',
    
    // 允许 require() 调用
    '@typescript-eslint/no-var-requires': 'off',
    
    // 强制使用分号
    'semi': ['error', 'always'],
    
    // 强制使用单引号
    'quotes': ['error', 'single', { allowTemplateLiterals: true }],
    
    // 禁止 console.log（但允许 console.error 等）
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    
    // 强制对象和数组最后一个元素后加逗号
    'comma-dangle': ['error', 'never']
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
