/**
 * Só sobrescreve google-services.json quando a env estiver definida.
 * Se GOOGLE_SERVICES_JSON estiver ausente, manter o valor do app.json
 * (ex.: "./google-services.json"); caso contrário o Expo grava
 * googleServicesFile = undefined e o Android perde o projeto FCM → FIS_AUTH_ERROR.
 */
export default ({ config }) => {
  const googleServicesFromEnv = process.env.GOOGLE_SERVICES_JSON;
  const iosGoogleFromEnv = process.env.GOOGLE_SERVICES_INFOPLIST;

  return {
    ...config,
    android: {
      ...config.android,
      ...(googleServicesFromEnv
        ? { googleServicesFile: googleServicesFromEnv }
        : {}),
    },
    ios: {
      ...config.ios,
      ...(iosGoogleFromEnv
        ? { googleServicesFile: iosGoogleFromEnv }
        : {}),
    },
  };
};