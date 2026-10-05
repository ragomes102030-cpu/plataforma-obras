import type { IsoDate } from "./work-calendar";

export type EntradaDaLinha = {
  codigo: string;
  atividade: string;
  frente: string;
  pavimento?: string | null;
  inicio: IsoDate;
  duracao: number;
  executado?: number | null;
  quantidade?: number | null;
};
