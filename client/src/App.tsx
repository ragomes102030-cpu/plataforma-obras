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
 * o login (`/login`) e a obra (`/obras`). Dentro da obra a navegação continua
 * sendo as abas, e o estado da aba é do dono da tela — não da URL.
 *
 * Um URL por aba é uma escolha possível para o futuro (compartilhar link para a
 * aba do cronograma). Não é agora, porque exigiria empurrar o estado da aba
 * para fora do componente e reintroduzir o problema que a barra de abas
 * resolveu.
 */
function Router() {
  return (
    <Switch>
      <Route path="/" component={PaginaInicial} />
      <Route path="/login" component={Entrar} />
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
