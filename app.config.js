const appJson = require("./app.json");

module.exports = {
  expo: {
    ...appJson.expo,
    android: {
      ...appJson.expo.android,
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON,
    },
  },
};