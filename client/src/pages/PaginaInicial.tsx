import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  ClipboardList,
  Github,
  Layers3,
} from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import "@/entrada.css";

/**
 * Página inicial (pública, rota `/`).
 *
 * Porta de entrada do produto: diz o que a Plataforma Obras faz e leva ao lugar
 * certo em um clique. O destino do botão depende da sessão — quem já está
 * autenticado vai direto para `/obras`; quem não está vai para `/login`.
 *
 * `useAuth().user` tem três estados (ver useAuth.ts): `undefined` enquanto a
 * sessão é lida, `null` quando não há sessão, objeto quando há. Aqui basta
 * `Boolean(user)`: só o objeto conta como autenticado.
 */

const RECURSOS = [
  {
    icone: ClipboardList,
    titulo: "EAP e quantitativos",
    texto: "Escopo em árvore, com frente, local e unidade — a base do orçamento.",
  },
  {
    icone: CalendarDays,
    titulo: "Cronograma CPM",
    texto: "PERT/CPM, folgas, caminho crítico, linha de base e curva S.",
  },
  {
    icone: BarChart3,
    titulo: "Medição e valor ganho",
    texto: "Avanço físico e financeiro, desvio de prazo e projeção de custo.",
  },
];

export default function PaginaInicial() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const autenticado = Boolean(user);

  return (
    <main className="entrada-tela">
      <section className="entrada-cartao entrada-cartao--larga">
        <div className="entrada-marca">
          <span className="entrada-marca-icone" aria-hidden="true">
            <Layers3 size={22} />
          </span>
          <span className="entrada-marca-nome">Plataforma Obras</span>
        </div>

        <h1 className="entrada-titulo">A obra inteira num lugar só.</h1>
        <p className="entrada-linha">
          Da estrutura analítica à curva S: escopo, cronograma, medição e custo
          na mesma base — sem planilha solta para reconciliar depois.
        </p>

        <ul className="entrada-lista">
          {RECURSOS.map(({ icone: Icone, titulo, texto }) => (
            <li key={titulo} className="entrada-item">
              <span className="entrada-item-icone" aria-hidden="true">
                <Icone size={18} />
              </span>
              <span className="entrada-item-texto">
                <strong>{titulo}</strong>
                <span>{texto}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="entrada-acoes">
          <button
            type="button"
            className="entrada-btn"
            onClick={() => setLocation(autenticado ? "/obras" : "/login")}
          >
            {autenticado ? "Ir para minhas obras" : "Entrar"}
            <ArrowRight size={18} />
          </button>
        </div>

        <p className="entrada-pe">
          <Github size={14} aria-hidden="true" />
          Acesso seguro pela sua conta do GitHub.
        </p>
      </section>
    </main>
  );
}
