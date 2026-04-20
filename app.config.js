/**
 * Só sobrescreve google-services.json quando a env estiver definida.
 * Se GOOGLE_SERVICES_JSON estiver ausente, manter o valor do app.json
 * (ex.: "./google-services.json"); caso contrário o Expo grava
 * googleServicesFile = undefined e o Android perde o projeto FCM → FIS_AUTH_ERROR.
 */
export default ({ config }) => {
return {
...config,
android: {
...config.android,
googleServicesFile: "./android/app/google-services.json",
},
ios: {
...config.ios,
// Se futuramente usar Firebase no iOS, pode colocar aqui também
// googleServicesFile: "./GoogleService-Info.plist",
},
};
};
