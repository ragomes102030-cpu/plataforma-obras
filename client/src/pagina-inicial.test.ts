import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A tela não pode ficar esperando para sempre.
 *
 * POR QUE ESTE TESTE EXISTE
 *
 * A página mostrava "Carregando as obras…" indefinidamente, com o cabeçalho
 * inteiro desenhado. Não era o backend travado: `auth.me` respondia 200 com
 * `null` e nenhuma requisição de API saía do browser. O `useQuery` estava com
 * `enabled: Boolean(user)`, e sem sessão `user` é `null` — então a query nunca
 * partia, por desenho.
 *
 * A segunda metade do defeito é a que prende a tela. O `Home` lia
 * `obras.isPending` para escolher entre "carregando" e "não há obra aqui". No
 * React Query v5, `isPending` significa `status === "pending"`, e uma query com
 * `enabled: false` fica em `pending` PARA SEMPRE — não é "ainda carregando", é
 * "nunca vai carregar". O componente escrevia "carregando" sobre uma decisão
 * que não podia mudar, e a tela ficava presa sem botão, sem erro e sem rede.
 *
 * ESTE TESTE É ESTÁTICO DE PROPÓSITO
 *
 * O comportamento depende do `status` do React Query, que é um detalhe de
 * biblioteca. Um teste que montasse o componente e esperasse a tela passar
 * precisaria de jsdom, de um servidor de tRPC e de cookies — e o que ele
 * provaria continua sendo uma linha de verdade sobre o código. Então o teste
 * lê o código e afirma a regra: a tela que espera precisa ter o que esperar, e
 * precisa de uma saída quando não há o que esperar.
 */
const HOME = readFileSync("client/src/pages/Home.tsx", "utf-8");
const APP = readFileSync("client/src/App.tsx", "utf-8");
const CONST = readFileSync("client/src/const.ts", "utf-8");

describe("a tela inicial não pode ficar esperando para sempre", () => {
  it("o ramo sem sessao esta LIGADO na arvore, e nao so declarado", () => {
    // A primeira versao deste teste procurava a palavra "login" no arquivo e
    // passava. Passava com o defeito inteiro no lugar: o componente `SemSessao`
    // continuava DECLARADO, com o botao dentro dele, e mesmo assim ninguem
    // renderizava. Procurar o componente e o mesmo que nao procurar nada —
    // o que importa e o ramo que o liga estar na arvore de render.
    //
    // E por isso que a mutacao deste teste e obrigatoria: remover o ramo tem que
    // reprovar, senao o teste descreve o arquivo e nao a tela.
    const ligaRamo =
      /:\s*user\s*===\s*undefined\s*\?/.test(HOME) && /:\s*!\s*user\s*\?/.test(HOME);
    expect(
      ligaRamo,
      "o ramo sem sessao nao esta ligado na arvore: o componente pode existir, " +
        "mas se nada o renderiza a tela continua presa em 'Carregando as obras'"
    ).toBe(true);
  });

  it("a espera distingue 'ainda nao sei' de 'nao ha sessao'", () => {
    // O `user` tem tres estados: `undefined` (lendo), `null` (sem sessao),
    // objeto (com sessao). Colapsar os dois primeiros com `?? null` e o que
    // prende a tela, porque o ramo de espera nao tem como saber se espera.
    expect(
      /user:\s*meQuery\.data\s*(,|})/.test(
        readFileSync("client/src/_core/hooks/useAuth.ts", "utf-8")
      ),
      "o useAuth ainda colapsa 'nao sei' em 'nao ha sessao' com ?? null"
    ).toBe(true);
  });

  it("o redirecionamento automatico nao dispara enquanto a sessao esta sendo lida", () => {
    // Se o redirect trata `!user` como ausencia, ele joga a pessoa para o
    // GitHub antes de a resposta chegar — e ela volta de um login que tem.
    const auth = readFileSync("client/src/_core/hooks/useAuth.ts", "utf-8");
    const guarda = /if\s*\(\s*state\.user\s*!==\s*null\s*\)\s*return/.test(auth);
    expect(
      guarda,
      "o efeito de redirect nao distingue espera de ausencia antes de redirecionar"
    ).toBe(true);
  });

  it("a tela de espera nao pode usar isPending sem sessions", () => {
    // `isPending` com `enabled: false` e um estado terminal que nunca chega.
    // Quem espera tem de distinguir "carregando" de "desligado".
    const esperaPorIsPending = /carregando=\{[^}]*isPending/.test(HOME);
    const temSessaoNaTela = /user\?|Boolean\(user\)|useAuth/.test(HOME);
    if (esperaPorIsPending) {
      expect(
        temSessaoNaTela,
        "a tela espera por isPending mas nao tem nocao de sessao: sem user, a " +
          "query fica com enabled false e isPending nao termina nunca"
      ).toBe(true);
    }
  });

  it("o startLogin existe e aponta para o caminho do servidor", () => {
    // O botao de entrar so funciona se o caminho estiver certo. `/api/auth/github`
    // e a rota que o servidor registra; qualquer outro valor devolve a SPA de
    // novo e parece que o clique nao fez nada.
    expect(CONST).toMatch(/location\.href\s*=\s*"\/api\/auth\/github"/);
  });

  it("o App nao esconde a Home atras de um gate que nao existe", () => {
    // Se o App decidir quem ve o que, essa decisao tem de estar no App. O
    // defeito aconteceu porque o gate estava no Home, longe de quem renderiza.
    expect(APP).toMatch(/<Router\s*\/>/);
  });
});
