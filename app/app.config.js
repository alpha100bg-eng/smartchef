// Extends app.json. Exists for one reason: GitHub Pages serves the app from a
// sub-path (github.io/<repo>/), so the web build must know its base URL or it
// looks for its assets at the domain root and renders a blank page.
//
// Set EXPO_BASE_URL="/smartchef" in the deploy workflow. Left unset locally so
// `npm run web` keeps serving from "/".

module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...(config.experiments ?? {}),
    ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}),
  },
});
