import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Entrar from "./pages/Entrar";
import PaginaInicial from "./pages/PaginaInicial";

/**
 * Rotas.
 *
 * A versão anterior roteava por módulo: `/eap`, `/orcamento`, `/cronogramas`…
 * e o `Home` antigo escolhia a tela pelo caminho da URL. Isso existia porque a
 * tela era um painel de módulos.
 *
 * Hoje as rotas são poucas e grossas — telas, não abas: a página inicial (`/`),
 * o login (`/login`), a escolha de obra (`/obras`) e a obra aberta (`/obra/:id`).
 * A obra vive na URL porque é ela que precisa sobreviver a um recarregamento:
 * F5 dentro da obra não pode jogar a pessoa de volta para a lista. A aba, não —
 * a aba é transitória, e um URL por aba exigiria empurrar o estado da aba para
 * fora do componente e reintroduzir o problema que a barra de abas resolveu.
 *
 * `/obra/:id` vem antes de `/obras` por clareza; no wouter os dois padrões não
 * competem (`/obra/:id` casa dois segmentos, `/obras` casa um).
 */
function Router() {
  return (
    <Switch>
      <Route path="/" component={PaginaInicial} />
      <Route path="/login" component={Entrar} />
      <Route path="/obra/:id" component={Home} />
      <Route path="/obras" component={Home} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
