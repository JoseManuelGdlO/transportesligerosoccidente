import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calleBase, findReusable, groupDuplicates, sameUbicacion } from "./clientUbicacionIdentity";

const client = "cli-1";

function row(partial: Record<string, string> & { id: string }) {
  return { client_id: client, createdAt: "2026-01-01T00:00:00.000Z", ...partial };
}

describe("ubicaciones del mismo CP", () => {
  const centroHidalgo = row({
    id: "a",
    cp: "47829",
    colonia: "Centro",
    colonia_clave: "0001",
    calle: "Hidalgo",
    numero_exterior: "10",
    tipo: "Origen",
  });
  const centroMorelos = row({
    id: "b",
    cp: "47829",
    colonia: "Centro",
    colonia_clave: "0001",
    calle: "Morelos",
    numero_exterior: "5",
    tipo: "Destino",
    createdAt: "2026-03-01T00:00:00.000Z",
  });
  const piedreraHidalgo = row({
    id: "c",
    cp: "47829",
    colonia: "La Piedrera",
    colonia_clave: "0009",
    calle: "Hidalgo",
    numero_exterior: "10",
    localidad: "Ocotlán",
    localidad_clave: "001",
    createdAt: "2026-02-01T00:00:00.000Z",
  });

  it("un cliente tiene una sola ubicación por CP aunque cambien colonia o calle", () => {
    assert.equal(sameUbicacion(centroHidalgo, centroMorelos), true);
    assert.equal(sameUbicacion(centroHidalgo, piedreraHidalgo), true);
    const groups = groupDuplicates([centroHidalgo, centroMorelos, piedreraHidalgo]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].survivor.id, "c");
    assert.deepEqual(
      groups[0].duplicates.map((d) => d.id).sort(),
      ["a", "b"],
    );
    assert.equal(groups[0].patch.tipo, "Ambos");
    assert.equal(groups[0].patch.calle, undefined);
  });

  it("otro cliente con el mismo CP es otra ubicación", () => {
    const otroCliente = { ...centroHidalgo, id: "z", client_id: "cli-2" };
    assert.equal(sameUbicacion(centroHidalgo, otroCliente), false);
    assert.equal(groupDuplicates([centroHidalgo, otroCliente]).length, 0);
  });

  it("funde la localidad vacía con la que sí tiene clave", () => {
    const vacia = row({
      id: "v",
      cp: "47829",
      colonia_clave: "0001",
      calle: "Hidalgo",
      numero_exterior: "10",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const llena = row({
      id: "l",
      cp: "47829",
      colonia_clave: "0001",
      calle: "Hidalgo",
      numero_exterior: "10",
      localidad: "Ocotlán",
      localidad_clave: "001",
      createdAt: "2026-02-01T00:00:00.000Z",
    });
    assert.equal(sameUbicacion(vacia, llena), true);
    const [group] = groupDuplicates([vacia, llena]);
    assert.equal(group.survivor.id, "l");
    assert.deepEqual(group.duplicates.map((d) => d.id), ["v"]);
  });

  it("no separa dos localidades del mismo CP", () => {
    const ocotlan = row({
      id: "o",
      cp: "47829",
      colonia_clave: "0001",
      calle: "Hidalgo",
      numero_exterior: "10",
      localidad_clave: "001",
    });
    const otra = row({
      id: "p",
      cp: "47829",
      colonia_clave: "0001",
      calle: "Hidalgo",
      numero_exterior: "10",
      localidad_clave: "002",
    });
    assert.equal(sameUbicacion(ocotlan, otra), true);
  });

  it("iguala AV. LAS LOMAS 1395 con avenida y número en su campo", () => {
    const pegado = row({ id: "1", cp: "45900", colonia: "Las Lomas", calle: "AV. LAS LOMAS 1395" });
    const partido = row({
      id: "2",
      cp: "45900",
      colonia: "LAS LOMAS",
      calle: "Avenida Las Lomas",
      numero_exterior: "1395",
      localidad_clave: "010",
    });
    assert.equal(sameUbicacion(pegado, partido), true);
    assert.equal(calleBase("AV. LAS LOMAS 1395"), "avenida las lomas");
  });

  it("reutiliza el CP aunque la colonia venga vacía", () => {
    const sinColonia = row({ id: "x", cp: "47829", calle: "Hidalgo", numero_exterior: "10" });
    const groups = groupDuplicates([centroHidalgo, piedreraHidalgo, sinColonia]);
    assert.equal(groups.length, 1);
    const reusable = findReusable([centroHidalgo, piedreraHidalgo], sinColonia);
    assert.ok(reusable && "match" in reusable);
    if (reusable && "match" in reusable) assert.equal(reusable.match.id, "c");
  });

  it("cruza clave y nombre: Centro con clave y CENTRO sin clave es la misma colonia", () => {
    const conClave = row({
      id: "k",
      cp: "47829",
      colonia: "Centro",
      colonia_clave: "0001",
      calle: "Hidalgo",
      numero_exterior: "10",
    });
    const soloNombre = row({
      id: "n",
      cp: "47829",
      colonia: "CENTRO",
      calle: "Hidalgo",
      numero_exterior: "10",
    });
    assert.equal(sameUbicacion(conClave, soloNombre), true);
    const groups = groupDuplicates([conClave, soloNombre]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].duplicates.length, 1);
  });

  it("iguala colonias distintas del mismo CP", () => {
    const conClave = row({
      id: "k",
      cp: "47829",
      colonia: "Centro",
      colonia_clave: "0001",
      calle: "Hidalgo",
      numero_exterior: "10",
    });
    const otroNombre = row({
      id: "n",
      cp: "47829",
      colonia: "La Piedrera",
      calle: "Hidalgo",
      numero_exterior: "10",
    });
    assert.equal(sameUbicacion(conClave, otroNombre), true);
    assert.equal(groupDuplicates([conClave, otroNombre]).length, 1);
  });

  it("iguala claves de colonia distintas del mismo CP", () => {
    const clave1 = row({
      id: "k1",
      cp: "47829",
      colonia: "Centro",
      colonia_clave: "0001",
      calle: "Hidalgo",
      numero_exterior: "10",
    });
    const clave9 = row({
      id: "k9",
      cp: "47829",
      colonia: "Centro",
      colonia_clave: "0009",
      calle: "Hidalgo",
      numero_exterior: "10",
    });
    assert.equal(sameUbicacion(clave1, clave9), true);
    assert.equal(groupDuplicates([clave1, clave9]).length, 1);
  });

  it("reutiliza la única coincidencia y copia la localidad que faltaba", () => {
    const incoming = row({
      id: "new",
      cp: "47829",
      colonia_clave: "0001",
      calle: "Hidalgo",
      numero_exterior: "10",
      localidad_clave: "001",
      localidad: "Ocotlán",
    });
    const found = findReusable([centroHidalgo], incoming);
    assert.ok(found && "match" in found);
    if (found && "match" in found) {
      assert.equal(found.match.id, "a");
      assert.equal(found.patch.localidad_clave, "001");
      assert.equal(found.patch.localidad, "Ocotlán");
    }
  });
});
