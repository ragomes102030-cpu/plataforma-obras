/**
 * Ponto de entrada exclusivo da prévia de design.
 * Não importa App, tRPC, autenticação, Supabase nem estados de produção.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import Preview from "./Preview";
import "./preview.css";
import "./module-gallery.css";

const element = document.getElementById("design-v2-root");
if (!element) throw new Error("Elemento design-v2-root não encontrado");
createRoot(element).render(
  <React.StrictMode>
    <Preview />
  </React.StrictMode>
);
