import * as Speech from "expo-speech";

export function limparTextoInstrucao(texto?: string | null) {
  return String(texto || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function falarInstrucaoSegura(
  texto?: string | null,
  ultimaInstrucaoFaladoRef?: { current: string },
  ultimoAudioEmRef?: { current: number },
  cooldownMs = 7000
) {
  const instru = limparTextoInstrucao(texto);

  if (!instru) return false;

  const agora = Date.now();
  const ultimaInstrucao = ultimaInstrucaoFaladoRef?.current || "";
  const ultimoAudioEm = ultimoAudioEmRef?.current || 0;

  if (instru === ultimaInstrucao && agora - ultimoAudioEm < cooldownMs) {
    return false;
  }

  try {
    await Speech.stop();
  } catch {}

  Speech.speak(instru, {
    language: "pt-BR",
    rate: 0.98,
    pitch: 1.0,
  });

  if (ultimaInstrucaoFaladoRef) {
    ultimaInstrucaoFaladoRef.current = instru;
  }

  if (ultimoAudioEmRef) {
    ultimoAudioEmRef.current = agora;
  }

  return true;
}
