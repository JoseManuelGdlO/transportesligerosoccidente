/**
 * Término que se manda al catálogo SAT al abrir un combobox.
 * La clave ya seleccionada no cuenta: si se usara, un C.P. con varias colonias
 * solo mostraría la que ya está puesta (por ejemplo 0910) y no el resto.
 */
export function satCatalogSearchTerm(query: string, _selectedClave = ""): string {
  return query.trim();
}
