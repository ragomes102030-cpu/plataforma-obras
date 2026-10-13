import { useEffect } from "react";
import { Github, Layers3 } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import "@/entrada.css";

/**
 * Login (público, rota `/login`).
 *
 * Não há formulário: a autenticação é o OAuth do GitHub, que já existe no app
 * (`startLogin()` em const.ts -> `location.href = "/api/auth/github"`). Esta tela
 * só dá um lugar próprio para o botão, em vez de pendurá-lo na tela da obra.
 *
 * Os três estados de `user` importam aqui (ver useAuth.ts): com `undefined` a
 * sessão ainda está sendo lida — botão desabilitado, "Verificando sessão…"; com
 * `null` há certeza de que não há sessão — botão ativo; com objeto a pessoa já
 * está dentro e não faz sentido ver o login, então redirecionamos.
 */

export default function Entrar() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Só o usuário-objeto redireciona. `undefined` (lendo) e `null` (ausência)
    // são falsy: nunca disparam o `setLocation`, e o ramo de espera não vira
    // uma ida e volta inútil ao GitHub.
    if (user) setLocation("/obras");
  }, [user, setLocation]);

  const lendo = user === undefined;

  return (
    <main className="entrada-tela">
      <section className="entrada-cartao">
        <div className="entrada-marca">
          <span className="entrada-marca-icone" aria-hidden="true">
            <Layers3 size={22} />
          </span>
          <span className="entrada-marca-nome">Plataforma Obras</span>
        </div>

        <h1 className="entrada-titulo">Entrar</h1>
        <p className="entrada-linha">
          Acesse suas obras com a sua conta do GitHub.
        </p>

        <div className="entrada-acoes">
          <button
            type="button"
            className="entrada-btn entrada-btn--bloco"
            onClick={startLogin}
            disabled={lendo}
          >
            <Github size={18} aria-hidden="true" />
            {lendo ? "Verificando sessão…" : "Entrar com GitHub"}
          </button>
        </div>

        <p className="entrada-pe">
          Sem cadastro novo. Usamos só o necessário para identificar você.
        </p>
      </section>
    </main>
  );
}
