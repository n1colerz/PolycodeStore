import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { ejecutar } from "../src/cli.js";
import { centavos, cargarCasos, DIR_DATOS } from "./ayudas.js";

describe("CLI", () => {
  it("run escribe el archivo de salida", async () => {
    const casos = await cargarCasos("casos_prueba.json");
    const entrada = { ...(casos[0].entrada as Record<string, unknown>), id: "PED-CLI-01" };

    const directorio = await mkdtemp(join(tmpdir(), "polycode-cli-"));
    const rutaEntrada = join(directorio, "entrada.json");
    const rutaSalida = join(directorio, "salida.json");
    await writeFile(rutaEntrada, JSON.stringify({ pedidos: [entrada] }), "utf-8");

    const codigo = await ejecutar([
      "run",
      "--entrada",
      rutaEntrada,
      "--salida",
      rutaSalida,
      "--datos",
      DIR_DATOS,
    ]);
    expect(codigo).toBe(0);

    const salida = JSON.parse(await readFile(rutaSalida, "utf-8")) as {
      resumen: { exitosos: number; fallidos: number; montoTotal: number };
      resultados: { indice: number; ok: boolean; pedido?: { id: string; calculos: { total: number } } }[];
    };
    expect(salida.resumen.exitosos).toBe(1);
    expect(salida.resumen.fallidos).toBe(0);
    expect(salida.resultados[0].pedido?.id).toBe("PED-CLI-01");
    expect(centavos(salida.resultados[0].pedido?.calculos.total as number)).toBe(centavos(719.2));
  });

  it("run falla si el archivo no existe", async () => {
    const espia = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const directorio = await mkdtemp(join(tmpdir(), "polycode-cli-"));

    const codigo = await ejecutar([
      "run",
      "--entrada",
      join(directorio, "no-existe.json"),
      "--datos",
      DIR_DATOS,
    ]);

    expect(codigo).toBe(1);
    expect(espia).toHaveBeenCalled();
    espia.mockRestore();
  });

  it("rechaza argumentos inválidos", async () => {
    const espia = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await ejecutar([])).toBe(2);
    expect(await ejecutar(["desconocido"])).toBe(2);
    expect(await ejecutar(["run"])).toBe(2);
    expect(await ejecutar(["run", "--desconocido", "x"])).toBe(2);

    espia.mockRestore();
  });

  it("muestra la versión", async () => {
    const espia = vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(await ejecutar(["--version"])).toBe(0);
    expect(espia).toHaveBeenCalledWith("0.1.0");
    espia.mockRestore();
  });
});
