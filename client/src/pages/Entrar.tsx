import { useEffect } from "react";
import { ArrowLeft, Github, Layers3, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import "@/entrada.css";
import "../animations.css";

function MarcaLogin() {
  return (
    <span className="arq-marca">
      <span className="arq-marca-simbolo" aria-hidden="true"><Layers3 size={21} strokeWidth={1.8} /></span>
      <span className="arq-marca-texto"><strong>ARQUIMEDES</strong><small>PLANEJAMENTO DE OBRAS</small></span>
    </span>
  );
}

export default function Entrar() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (user) setLocation("/obras");
  }, [user, setLocation]);

  const lendo = user === undefined;

  return (
    <main className="arq-login animate-fade-in">
      <div className="arq-login-grid" aria-hidden="true" />
      <a href="/" className="arq-login-voltar"><ArrowLeft size={16} /> Voltar à página inicial</a>
      <section className="arq-login-layout">
        <div className="arq-login-apresentacao">
          <MarcaLogin />
          <p className="arq-overline">SEU AMBIENTE DE ENGENHARIA</p>
          <h1>Planejamento consistente.<br /><em>Obras sob controle.</em></h1>
          <p>Entre para acessar suas obras, revisar o planejamento e acompanhar as decisões do projeto em um só lugar.</p>
          <div className="arq-login-lista">
            <span><ShieldCheck size={17} /> Sessão protegida</span>
            <span><Layers3 size={17} /> Obras e dados em um único ambiente</span>
          </div>
        </div>
        <div className="arq-login-cartao">
          <span className="arq-login-kicker">ACESSO À PLATAFORMA</span>
          <h2>Bem-vindo ao Arquimedes</h2>
          <p>Use sua conta autorizada do GitHub para continuar.</p>
          <button type="button" className="arq-btn arq-btn--login" onClick={startLogin} disabled={lendo}>
            <Github size={19} />
            {lendo ? "Verificando sessão…" : "Continuar com GitHub"}
          </button>
          <div className="arq-login-seguranca"><ShieldCheck size={15} /> Não é necessário criar uma nova senha.</div>
          <div className="arq-login-nota">O acesso depende das permissões configuradas para sua conta.</div>
        </div>
      </section>
      <footer className="arq-login-footer"><span>ARQUIMEDES</span><span>Planejamento e controle de obras</span></footer>
    </main>
  );
}
