import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  Github,
  Layers3,
  Network,
  ShieldCheck,
} from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import "@/entrada.css";
import "../animations.css";

const RECURSOS = [
  {
    icone: Layers3,
    titulo: "Escopo rastreável",
    texto: "EAP, pacotes de trabalho e quantitativos ligados à mesma estrutura.",
  },
  {
    icone: Network,
    titulo: "Cronograma calculado",
    texto: "Dependências, CPM, caminho crítico e linha de base com critérios claros.",
  },
  {
    icone: BarChart3,
    titulo: "Controle integrado",
    texto: "Medição física e financeira para entender desvios e tomar decisões.",
  },
];

function Marca({ compacta = false }: { compacta?: boolean }) {
  return (
    <span className={`arq-marca${compacta ? " arq-marca--compacta" : ""}`}>
      <span className="arq-marca-simbolo" aria-hidden="true">
        <Layers3 size={21} strokeWidth={1.8} />
      </span>
      <span className="arq-marca-texto">
        <strong>ARQUIMEDES</strong>
        {!compacta && <small>PLANEJAMENTO DE OBRAS</small>}
      </span>
    </span>
  );
}

function IlustracaoTecnica() {
  return (
    <div className="arq-hero-visual" aria-label="Ilustração técnica de uma estrutura de edifício" role="img">
      <div className="arq-visual-topline"><span>MODELO DE PLANEJAMENTO</span><span>01 / 03</span></div>
      <svg className="arq-edificio-svg" viewBox="0 0 520 500" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="arq-building-glow" x1="160" y1="70" x2="390" y2="430" gradientUnits="userSpaceOnUse">
            <stop stopColor="#8CE6E2" stopOpacity=".88" />
            <stop offset="1" stopColor="#78A7FF" stopOpacity=".38" />
          </linearGradient>
          <linearGradient id="arq-building-face" x1="185" y1="100" x2="360" y2="400" gradientUnits="userSpaceOnUse">
            <stop stopColor="#B5F1EF" stopOpacity=".2" />
            <stop offset="1" stopColor="#7BA7F5" stopOpacity=".04" />
          </linearGradient>
        </defs>
        <g stroke="#8CA9C7" strokeOpacity=".16" strokeWidth="1">
          {Array.from({ length: 11 }, (_, i) => <path key={`h${i}`} d={`M 34 ${100 + i * 30} H 486`} />)}
          {Array.from({ length: 13 }, (_, i) => <path key={`v${i}`} d={`M ${50 + i * 35} 74 V 430`} />)}
        </g>
        <g stroke="#7DD8D6" strokeOpacity=".45" strokeDasharray="4 7">
          <path d="M70 410 L250 454 L453 400" />
          <path d="M250 454 V88" />
        </g>
        <g stroke="url(#arq-building-glow)" strokeWidth="1.8" strokeLinejoin="round">
          <path d="M151 165 L292 94 L397 145 L256 220 Z" fill="url(#arq-building-face)" />
          <path d="M151 165 V355 L256 415 V220 Z" fill="url(#arq-building-face)" />
          <path d="M256 220 V415 L397 341 V145 Z" fill="url(#arq-building-face)" />
          {Array.from({ length: 6 }, (_, i) => {
            const y = 190 + i * 32;
            return <g key={`floor${i}`} strokeOpacity=".82">
              <path d={`M151 ${y} L256 ${y + 55} L397 ${y - 20}`} />
              <path d={`M256 ${y + 55} L256 ${y + 86}`} strokeOpacity=".12" />
            </g>;
          })}
          <path d="M177 152 L177 369 M204 138 L204 384 M231 125 L231 400" strokeOpacity=".5" />
          <path d="M285 202 V400 M316 185 V383 M347 169 V366 M378 153 V349" strokeOpacity=".5" />
          <path d="M151 228 L256 284 L397 209 M151 291 L256 348 L397 273" strokeOpacity=".55" />
        </g>
        <g stroke="#E1FAF8" strokeWidth="1.5" strokeOpacity=".8">
          <path d="M151 165 L292 94 L397 145" />
          <path d="M151 165 L256 220 L397 145" />
          <path d="M256 220 V415" />
        </g>
        <g fill="#8CE6E2">
          <circle cx="292" cy="94" r="4" /><circle cx="151" cy="165" r="4" /><circle cx="397" cy="145" r="4" /><circle cx="256" cy="220" r="4" />
        </g>
        <g stroke="#8CE6E2" strokeWidth="1.2" strokeOpacity=".65">
          <path d="M292 94 V56 H365" /><path d="M397 145 H444 V118" /><path d="M151 291 H94 V270" />
        </g>
        <g fill="#C7E6F1" fontFamily="ui-monospace, monospace" fontSize="10" letterSpacing="1.4">
          <text x="370" y="59">EAP / 03</text><text x="414" y="109">CPM</text><text x="51" y="260">BASELINE</text>
        </g>
      </svg>
      <div className="arq-visual-rodape">
        <span><i className="arq-status-ponto" /> MOTOR DE PLANEJAMENTO</span>
        <span>ESCOPO → PRAZO → CONTROLE</span>
      </div>
      <div className="arq-flutuante arq-flutuante--eap"><Layers3 size={16} /><span><strong>EAP</strong><small>Escopo estruturado</small></span><Check size={15} /></div>
      <div className="arq-flutuante arq-flutuante--cpm"><CalendarDays size={16} /><span><strong>CPM</strong><small>Rede de atividades</small></span></div>
    </div>
  );
}

export default function PaginaInicial() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const autenticado = Boolean(user);

  return (
    <main className="arq-landing animate-fade-in">
      <div className="arq-landing-grid" aria-hidden="true" />
      <header className="arq-landing-header">
        <a className="arq-marca-link" href="/" aria-label="Arquimedes, página inicial"><Marca /></a>
        <div className="arq-header-acoes">
          <span className="arq-header-legenda">PLATAFORMA DE ENGENHARIA</span>
          {!autenticado && (
            <button type="button" className="arq-btn arq-btn--outline" onClick={() => setLocation("/login")}>
              Entrar
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </header>

      <section className="arq-hero">
        <div className="arq-hero-copy">
          <div className="arq-selo"><span /> PLANEJAMENTO E CONTROLE DE OBRAS</div>
          <p className="arq-overline">DA EAP À ENTREGA</p>
          <h1>Obras bem planejadas começam com <em>clareza.</em></h1>
          <p className="arq-hero-descricao">
            O Arquimedes conecta escopo, quantitativos, orçamento e cronograma em um só ambiente — para o engenheiro planejar com método e acompanhar com confiança.
          </p>
          <div className="arq-hero-acoes">
            <button type="button" className="arq-btn arq-btn--primary" onClick={() => setLocation(autenticado ? "/obras" : "/login")}>
              {autenticado ? "Acessar minhas obras" : "Entrar no Arquimedes"}
              <ArrowRight size={18} />
            </button>
            <span className="arq-acesso-nota"><ShieldCheck size={16} /> Acesso protegido pela sua conta</span>
          </div>
          <div className="arq-hero-pilares">
            <span><Check size={14} /> EAP estruturada</span>
            <span><Check size={14} /> CPM e linha de base</span>
            <span><Check size={14} /> Medição integrada</span>
          </div>
        </div>
        <IlustracaoTecnica />
      </section>

      <section className="arq-recursos" aria-labelledby="arq-recursos-titulo">
        <div className="arq-recursos-intro">
          <p className="arq-overline">UM FLUXO CONECTADO</p>
          <h2 id="arq-recursos-titulo">Do escopo ao controle.<br /><em>Sem perder o vínculo.</em></h2>
        </div>
        <div className="arq-recursos-lista">
          {RECURSOS.map(({ icone: Icone, titulo, texto }, index) => (
            <article className="arq-recurso" key={titulo}>
              <span className="arq-recurso-numero">0{index + 1}</span>
              <span className="arq-recurso-icone"><Icone size={19} /></span>
              <h3>{titulo}</h3>
              <p>{texto}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="arq-landing-footer">
        <Marca compacta />
        <span>Planejamento técnico. Decisões com fundamento.</span>
        <span className="arq-footer-direitos">© Arquimedes</span>
      </footer>
    </main>
  );
}
