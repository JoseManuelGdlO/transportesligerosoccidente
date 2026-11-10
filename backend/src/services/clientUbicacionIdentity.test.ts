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
  });
  const centroMorelos = row({
    id: "b",
    cp: "47829",
    colonia: "Centro",
    colonia_clave: "0001",
    calle: "Morelos",
    numero_exterior: "5",
  });
  const piedreraHidalgo = row({
    id: "c",
    cp: "47829",
    colonia: "La Piedrera",
    colonia_clave: "0009",
    calle: "Hidalgo",
    numero_exterior: "10",
  });

  it("deja convivir calle o colonia distintas", () => {
    assert.equal(sameUbicacion(centroHidalgo, centroMorelos), false);
    assert.equal(sameUbicacion(centroHidalgo, piedreraHidalgo), false);
    const groups = groupDuplicates([centroHidalgo, centroMorelos, piedreraHidalgo]);
    assert.equal(groups.length, 0);
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

  it("separa dos localidades con clave", () => {
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
    assert.equal(sameUbicacion(ocotlan, otra), false);
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

  it("no funde una colonia vacía si ya hay dos colonias para esa puerta", () => {
    const sinColonia = row({ id: "x", cp: "47829", calle: "Hidalgo", numero_exterior: "10" });
    const groups = groupDuplicates([centroHidalgo, piedreraHidalgo, sinColonia]);
    assert.equal(groups.length, 0);
    const reusable = findReusable([centroHidalgo, piedreraHidalgo], sinColonia);
    assert.deepEqual(reusable, { ambiguous: true });
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
