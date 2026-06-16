module.exports = {
  testMatch: ['**/__tests__/**/*.test.js'],
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(expo|@expo|expo-modules-core)/)',
  ],
  moduleNameMapper: {
    '^react$': '<rootDir>/__mocks__/react.js',
    '^react-native$': '<rootDir>/__mocks__/react-native.js',
    '^@react-native-async-storage/async-storage$': '<rootDir>/__mocks__/async-storage.js',
    '^@supabase/supabase-js$': '<rootDir>/__mocks__/supabase-js.js',
    '^(.+/)i18n$': '<rootDir>/__mocks__/i18n.js',
  },
  testEnvironment: 'node',
};
