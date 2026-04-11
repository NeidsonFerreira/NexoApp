import { HttpsError } from "firebase-functions/v2/https";
import type { PedidoStatus } from "./validators";

const transicoes: Partial<Record<PedidoStatus, PedidoStatus[]>> = {
  pendente: ["aceito", "recusado"],
  aceito: ["a_caminho", "concluido"],
  a_caminho: ["chegou", "concluido"],
  chegou: ["concluido"],
};

export function validarTransicaoStatus(
  atual: unknown,
  proximo: PedidoStatus
): void {
  const statusAtual = String(atual || "").trim() as PedidoStatus;
  const permitidos = transicoes[statusAtual] ?? [];

  if (!permitidos.includes(proximo)) {
    throw new HttpsError(
      "failed-precondition",
      `Transição inválida de ${statusAtual || "desconhecido"} para ${proximo}.`
    );
  }
}
