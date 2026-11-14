module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // Restates the inherited @react-native rule options (eslintrc rule
    // options are overridden wholesale — partial overrides are not possible)
    // plus two additions:
    //   ignoreRestSiblings — variables destructured beside a rest element are
    //     an omission idiom (strip these keys), not unused locals: see
    //     apiJobOf in useTechnicianJobs.ts and mergeJobIntoDetail in
    //     services/jobDetailMerge.ts.
    //   varsIgnorePattern — allows '^_'-prefixed intentionally-unused locals
    //     (NEW here; the inherited rule never had one).
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      },
    ],
  },
};
