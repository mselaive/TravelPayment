// Permite abrir la pantalla "Agregar" con una foto ya tomada o un día preseleccionado
// (p. ej. el botón de cámara de Inicio abre la cámara ahí mismo, con un solo toque).
export type AddIntent = { file?: File; date?: string; manual?: boolean };

let pending: AddIntent | null = null;

export function setAddIntent(intent: AddIntent) {
  pending = intent;
}

export function peekAddIntent(): AddIntent {
  return pending ?? {};
}

export function clearAddIntent() {
  pending = null;
}
