Coloque reabrirOuCorrigirPedidoAdmin.ts e limparPedidoTravado.ts em functions/src/admin/
Coloque syncPedidoAtivo.ts e pedidoStatus.ts em functions/src/utils/
Exporte no functions/src/index.ts:
export { reabrirOuCorrigirPedidoAdmin } from "./admin/reabrirOuCorrigirPedidoAdmin";
export { limparPedidoTravado } from "./admin/limparPedidoTravado";
