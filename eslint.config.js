const readonly = 'readonly';

export default [
  {
    files: ['src/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        Audio: readonly,
        AudioContext: readonly,
        Event: readonly,
        Image: readonly,
        URL: readonly,
        addEventListener: readonly,
        clearInterval: readonly,
        clearTimeout: readonly,
        console: readonly,
        devicePixelRatio: readonly,
        document: readonly,
        getComputedStyle: readonly,
        innerHeight: readonly,
        innerWidth: readonly,
        localStorage: readonly,
        navigator: readonly,
        performance: readonly,
        requestAnimationFrame: readonly,
        setInterval: readonly,
        setTimeout: readonly,
        window: readonly,
      },
    },
    rules: {
      'no-undef': 'error',
    },
  },
];
