import "./index.css";
import "./mobile.css";
import "./campo-tipografia.css";
import "./tipografia-desktop.css";
import React from "react";
import { createRoot } from "react-dom/client";
import type { EntradaDaLinha } from "@shared/cronograma-colunas";
import { LinhaBalancoEscadinha } from "./components/AuroraLinhaBalanco";

const somarDias = (iso: string, dias: number) =>
  new Date(Date.parse(`${iso}T12:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);

const linhas: EntradaDaLinha[] = Array.from({ length: 8 }, (_, indice) => ({
  codigo: `1.20.${indice + 1}`,
  atividade: `Serviço ${indice + 1}`,
  frente: "Execução externa",
  pavimento: "",
  inicio: somarDias("2026-11-02", indice * 7),
  duracao: 3,
  quantidade: 10,
  unidade: "m²",
  executado: 0,
  marco: false,
}));

const finsCalculados = Object.fromEntries(
  linhas.map(linha => [linha.codigo, somarDias(linha.inicio, linha.duracao - 1)])
);

function App() {
  return (
    <main style={{ padding: 12 }}>
      <LinhaBalancoEscadinha
        linhas={linhas}
        finsCalculados={finsCalculados}
        hoje="2026-11-08"
        inicioObra="2026-11-02"
        nodosEap={linhas.map((linha, indice) => ({ id: indice + 1, code: linha.codigo, location: "Área externa" }))}
        unidades={[{ id: 1, code: "AREA_EXT", name: "Área externa", unitType: "area" }]}
        onAbrirAtividades={() => {}}
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
