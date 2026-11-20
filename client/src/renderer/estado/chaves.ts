/** Chave de uma conversa: "c:<id>" para canal de texto, "d:<id>" para DM. */
export type Chave = `c:${number}` | `d:${number}`;
export const chaveCanal = (id: number): Chave => `c:${id}`;
export const chaveDm = (id: number): Chave => `d:${id}`;
/** Chave da conversa a que a mensagem (ou o aviso) pertence. */
export const chaveDe = (m: { canalId: number | null; dmId: number | null }): Chave | null =>
  m.canalId !== null ? chaveCanal(m.canalId) : m.dmId !== null ? chaveDm(m.dmId) : null;
