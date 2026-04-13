import { onCall, HttpsError } from "firebase-functions/v2/https";
import { REGION } from "../config/constants";
import { db, serverTimestamp } from "../config/admin";
import { requireAuthUid, requireString } from "../utils/validators";
import { validarLatitudeLongitude } from "../utils/geo";

export const criarPedido = onCall({ region: REGION }, async (request) => {
  const clienteId = requireAuthUid(request.auth?.uid);

  const profissionalId = requireString(
    request.data?.profissionalId,
    "profissionalId",
    120
  );

  const tipoAtendimento = requireString(
    request.data?.tipoAtendimento,
    "tipoAtendimento",
    80
  );

  const nomeCliente = requireString(
    request.data?.nomeCliente,
    "nomeCliente",
    120
  );

  const observacoes =
    typeof request.data?.observacoes === "string"
      ? String(request.data.observacoes).trim().slice(0, 500)
      : "";

  const endereco =
    typeof request.data?.endereco === "string"
      ? String(request.data.endereco).trim().slice(0, 200)
      : "";

  const latitudeClienteRaw = request.data?.latitudeCliente;
  const longitudeClienteRaw = request.data?.longitudeCliente;

  const { latitude: latitudeCliente, longitude: longitudeCliente } =
    validarLatitudeLongitude(latitudeClienteRaw, longitudeClienteRaw);

  const clienteRef = db.collection("users").doc(clienteId);
  const profissionalRef = db.collection("users").doc(profissionalId);
  const pedidoRef = db.collection("pedidos").doc();

  await db.runTransaction(async (tx) => {
    const [clienteSnap, profissionalSnap] = await Promise.all([
      tx.get(clienteRef),
      tx.get(profissionalRef),
    ]);

    if (!clienteSnap.exists) {
      throw new HttpsError("not-found", "Cliente não encontrado.");
    }

    if (!profissionalSnap.exists) {
      throw new HttpsError("not-found", "Profissional não encontrado.");
    }

    const cliente = clienteSnap.data() as Record<string, any>;
    const profissional = profissionalSnap.data() as Record<string, any>;

    if (cliente.tipo !== "cliente" && cliente.tipo !== "admin") {
      throw new HttpsError("permission-denied", "Usuário não é cliente.");
    }

    if (profissional.tipo !== "profissional" && profissional.tipo !== "admin") {
      throw new HttpsError(
        "failed-precondition",
        "Usuário selecionado não é profissional."
      );
    }

    if (!profissional.disponivel && !profissional.online) {
      throw new HttpsError(
        "failed-precondition",
        "Profissional não está online."
      );
    }

    if (profissional.emAtendimento) {
      throw new HttpsError(
        "failed-precondition",
        "Profissional já está em atendimento."
      );
    }

    if (cliente.emAtendimento || cliente.pedidoAtivoId) {
      throw new HttpsError(
        "failed-precondition",
        "Cliente já possui pedido ativo."
      );
    }

    tx.set(pedidoRef, {
      clienteId,
      profissionalId,

      nomeCliente,
      emailCliente: cliente.email || "",
      fotoCliente: cliente.fotoPerfil || "",

      nomeProfissional: profissional.nome || "",
      fotoProfissional: profissional.fotoPerfil || "",

      tipoAtendimento,
      observacoes,
      endereco,

      latitudeCliente,
      longitudeCliente,

      latitudeProfissional:
        typeof profissional.latitude === "number" ? profissional.latitude : null,
      longitudeProfissional:
        typeof profissional.longitude === "number"
          ? profissional.longitude
          : null,

      status: "pendente",
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    });

    tx.set(
      clienteRef,
      {
        pedidoAtivoId: pedidoRef.id,
        emAtendimento: true,
      },
      { merge: true }
    );

    tx.set(
      profissionalRef,
      {
        pedidoAtivoId: null,
        emAtendimento: false,
      },
      { merge: true }
    );
  });

  return { ok: true, pedidoId: pedidoRef.id };
});