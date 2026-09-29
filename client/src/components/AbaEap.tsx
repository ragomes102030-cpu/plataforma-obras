import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";

/**
 * A aba EAP: a estrutura analítica da obra.
 *
 * POR QUE COMEÇA PELA EAP E NÃO PELO CRONOGRAMA
 *
 * Porque a EAP é o que o catálogo gera, e é a única coisa no sistema que pode
 * ser derivada sem que alguém invente dado. O cronograma depende de duração, e
 * duração é informada por quem planeja. Começar pelo cronograma seria começar
 * por uma tela que só fica certa depois que a EAP existe.
 *
 * POR QUE A ÁRVORE VEM DO BANCO E NÃO É MONTADA AQUI
 *
 * Os nós já estão em `wbs_nodes`, com pai, nível, código oficial e unidade. A
 * tela monta a hierarquia a partir de `parentId` e não cria, não renomeia e
 * não reordena nada: se a tela calculasse o nível a partir do código, existiria
 * uma segunda definição de hierarquia, e elas iam divergir no primeiro serviço
 * com três níveis de prefixo.
 */

type No = {
  id: number;
  code: string;
  name: string;
  level: number;
  nodeType: string | null;
  parentId: number | null;
  externalId: string | null;
  unit: string | null;
  sortOrder: number;
};

export function AbaEap({ projetoId }: { projetoId: number }) {
  const wbs = trpc.projects.wbs.useQuery(
    { projectId: projetoId },
    { enabled: projetoId > 0 }
  );
  // Os grupos de primeiro nivel começam abertos: uma EAP com tudo fechado
  // exige um clique por grupo antes de se ver qualquer serviço.
  const [aberto, setAberto] = useState<Set<number>>(new Set());
  const [busca, setBusca] = useState("");

  const utils = trpc.useUtils();
  const recarregar = () => utils.projects.wbs.invalidate({ projectId: projetoId });

  /**
   * Traz uma folha da EAP para o cronograma.
   *
   * A folha é o lugar natural de puxar a linha: é ela que tem o código oficial
   * e a unidade, e é pelo código que o orçamento casa o preço. A atividade
   * nasce com duração ZERO — prazo é informado por quem planeja, e a grade
   * mostra "Não iniciado" até isso acontecer.
   */
  const trazer = trpc.planning.criarAtividadeDaFolha.useMutation({
    onSuccess: async () => {
      await recarregar();
      await utils.planning.grade.invalidate({ projectId: projetoId });
    },
  });

  // Quais folhas já viraram atividade. Vem do cronograma, e sem isso o botão
  // ficaria ativo em linha que já está lá e o erro seria "já está no
  // cronograma" — uma viagem de ida e volta para aprender o que a tela podia
  // ter dito.
  const grade = trpc.planning.grade.useQuery(
    { projectId: projetoId },
    { enabled: projetoId > 0 }
  );
  const codigosNoCronograma = new Set(
    (grade.data?.linhas ?? []).map((l: { codigo: string }) => l.codigo)
  );
  const jaNoCronograma = (codigo: string) => codigosNoCronograma.has(codigo);

  /**
   * Refazer a EAP do zero.
   *
   * Existe por causa de um estado sem saída que o botão "Gerar" produzia antes
   * da transação: se uma gravação falhasse no meio, os nós ficavam gravados, a
   * guarda de idempotência respondia "a obra já tem estrutura" para sempre, e
   * o único botão que geraria a EAP era justamente o que recusava. Não havia
   * rota, botão nem script que tirasse a obra de lá.
   *
   * Isto apaga o que a geração anterior gravou e refaz, na mesma transação.
   * Apaga a árvore, as atividades e a versão de orçamento que o seeder criou —
   * e nada mais: uma versão de orçamento criada à mão não é tocada.
   */
  const refazer = trpc.projects.generateEapFromCatalog.useMutation({
    onSuccess: async () => {
      await recarregar();
      await utils.planning.grade.invalidate({ projectId: projetoId });
    },
  });

  const nos = (wbs.data ?? []) as No[];

  // Erro visível das duas ações. Sem isto: clique, nada acontece, silêncio.
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    if (trazer.isError) setErro(trazer.error.message);
  }, [trazer.isError, trazer.error]);
  useEffect(() => {
    if (refazer.isError) setErro(refazer.error.message);
  }, [refazer.isError, refazer.error]);
  useEffect(() => {
    if (trazer.isSuccess || refazer.isSuccess) setErro(null);
  }, [trazer.isSuccess, refazer.isSuccess]);

  // Os grupos de primeiro nível começam abertos. Uma EAP com tudo fechado
  // exige um clique por grupo antes de se ver qualquer serviço, e a EAP nasce
  // em duas camadas: grupo → folha.
  const jaViu = useRef<No[] | null>(null);
  useEffect(() => {
    if (jaViu.current === nos) return;
    jaViu.current = nos;
    if (nos.length === 0) return;
    setAberto(antigo => {
      if (antigo.size > 0) return antigo;
      const grupos = nos.filter(n => n.level === 1).map(n => n.id);
      return grupos.length ? new Set(grupos) : antigo;
    });
  }, [nos]);

  const arvore = useMemo(() => montarArvore(nos), [nos]);
  const filtrada = useMemo(
    () => (busca.trim() ? filtrarArvore(arvore, busca.trim().toLowerCase()) : arvore),
    [arvore, busca]
  );

  if (wbs.isPending) {
    return <div className="xl-vazia-folha"><h3>Carregando a estrutura…</h3></div>;
  }

  if (nos.length === 0) {
    return <EapVazia projetoId={projetoId} />;
  }

  const total = nos.length;
  const grupos = nos.filter(n => n.level === 1).length;
  const folhas = nos.filter(n => n.nodeType === "entrega").length;

  return (
    <div className="eap">
      {erro && (
        <div className="xl-aviso-erro" role="alert">
          {erro}
          <button type="button" onClick={() => setErro(null)}>
            fechar
          </button>
        </div>
      )}

      <div className="eap-topo">
        <div>
          <h2>ESTRUTURA ANALÍTICA DA OBRA</h2>
          <p>
            {total} nós · {grupos} grupos · {folhas} folhas de serviço
          </p>
        </div>
        <div className="eap-topo-acoes">
          <button
            type="button"
            className="eap-btn-secundario"
            disabled={refazer.isPending}
            title="Apaga a estrutura gerada e refaz a partir do catálogo. Atividades e versão de orçamento criadas à mão são preservadas."
            onClick={() => {
              const ok = window.confirm(
                "Refazer a EAP?\n\n" +
                  "A estrutura gerada pelo catálogo é apagada e refeita. " +
                  "As atividades do cronograma e a versão de orçamento são apagadas junto, " +
                  "porque nasceram dela. Uma versão de orçamento criada à mão é preservada."
              );
              if (!ok) return;
              refazer.mutate({ projectId: projetoId, tipoDeObra: "edificio", refazer: true });
            }}
          >
            {refazer.isPending ? "Refazendo…" : "Refazer"}
          </button>
        </div>
        <input
          className="eap-busca"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Filtrar por nome ou código…"
          aria-label="Filtrar a estrutura"
        />
      </div>

      <div className="eap-arvore" role="tree" aria-label="Estrutura da obra">
        {filtrada.map(no => (
          <NoDaArvore
            key={no.no.id}
            ramo={no}
            abertos={busca.trim() ? new Set(nos.map(n => n.id)) : aberto}
            onAlternar={id =>
              setAberto(antigo => {
                const novo = new Set(antigo);
                if (novo.has(id)) novo.delete(id);
                else novo.add(id);
                return novo;
              })
            }
            aoTrazer={id => trazer.mutate({ projectId: projetoId, wbsNodeId: id })}
            jaNoCronograma={jaNoCronograma}
            profundidade={0}
          />
        ))}
        {filtrada.length === 0 && (
          <p className="eap-nada">Nenhum nó corresponde a "{busca}".</p>
        )}
      </div>
    </div>
  );
}

type Ramo = { no: No; filhos: Ramo[] };

/** Monta a hierarquia a partir de `parentId`. Sem recursão sobre o código. */
function montarArvore(nos: No[]): Ramo[] {
  const porId = new Map<number, No>();
  for (const n of nos) porId.set(n.id, n);

  const filhosDe = new Map<number | null, No[]>();
  for (const n of nos) {
    const chave = n.parentId;
    const lista = filhosDe.get(chave) ?? [];
    lista.push(n);
    filhosDe.set(chave, lista);
  }
  for (const lista of filhosDe.values()) {
    lista.sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code, "pt-BR"));
  }

  const paraRamo = (no: No): Ramo => ({
    no,
    filhos: (filhosDe.get(no.id) ?? []).map(paraRamo),
  });

  return (filhosDe.get(null) ?? []).map(paraRamo);
}

/**
 * Filtro que mantém o ancestral de qualquer nó que casou.
 *
 * Filtrar a lista plana esconderia o grupo de uma folha que o usuário procurou:
 * ele acharia "Concreto armado" e não veria a qual capítulo ele pertence. Aqui
 * o caminho inteiro vem junto.
 */
function filtrarArvore(ramos: Ramo[], termo: string): Ramo[] {
  const out: Ramo[] = [];
  for (const ramo of ramos) {
    const filhos = filtrarArvore(ramo.filhos, termo);
    const proprio = ramo.no.name.toLowerCase().includes(termo) ||
      ramo.no.code.toLowerCase().includes(termo) ||
      (ramo.no.externalId ?? "").toLowerCase().includes(termo);
    if (proprio || filhos.length) out.push({ no: ramo.no, filhos });
  }
  return out;
}

/**
 * Um nó e seus filhos.
 *
 * O grupo começa aberto: a EAP é gerada em duas camadas (grupo → folha) e
 * fechar tudo por padrão esconde a obra inteira atrás de um clique. O estado de
 * aberto é do pai (Home), não deste componente, para que a busca possa abrir o
 * caminho inteiro de uma vez.
 */
function NoDaArvore({
  ramo,
  abertos,
  onAlternar,
  aoTrazer,
  jaNoCronograma,
  profundidade,
}: {
  ramo: Ramo;
  abertos: Set<number>;
  onAlternar: (id: number) => void;
  aoTrazer: (id: number) => void;
  jaNoCronograma: (codigo: string) => boolean;
  profundidade: number;
}) {
  const { no, filhos } = ramo;
  const temFilhos = filhos.length > 0;
  const aberto = abertos.has(no.id);

  return (
    <div role="treeitem" aria-expanded={temFilhos ? aberto : undefined}>
      <div
        className={`eap-linha eap-nivel-${no.level}${no.nodeType === "entrega" ? " eap-folha" : ""}`}
        style={{ paddingLeft: 12 + profundidade * 16 }}
      >
        {temFilhos ? (
          <button
            type="button"
            className={`eap-seta${aberto ? " aberta" : ""}`}
            onClick={() => onAlternar(no.id)}
            aria-label={aberto ? `Fechar ${no.name}` : `Abrir ${no.name}`}
          />
        ) : (
          <span className="eap-seta eap-seta-vazia" aria-hidden="true" />
        )}

        <span className="eap-codigo">{no.code}</span>
        <span className="eap-nome">{no.name}</span>

        {no.externalId && (
          <span className="eap-oficial" title="Código oficial do serviço na base de preços">
            {no.externalId}
          </span>
        )}
        {no.unit && <span className="eap-unidade">{no.unit}</span>}

        {no.nodeType === "entrega" &&
          (jaNoCronograma(no.code) ? (
            <span className="eap-no-crono" title="Esta folha já está no cronograma">
              no cronograma
            </span>
          ) : (
            <button
              type="button"
              className="eap-trazer"
              onClick={() => aoTrazer(no.id)}
              title="Trazer esta folha para o cronograma, com duração a informar"
            >
              trazer p/ cronograma
            </button>
          ))}
      </div>

      {temFilhos && aberto && (
        <div role="group">
          {filhos.map(f => (
            <NoDaArvore
              key={f.no.id}
              ramo={f}
              abertos={abertos}
              onAlternar={onAlternar}
              aoTrazer={aoTrazer}
              jaNoCronograma={jaNoCronograma}
              profundidade={profundidade + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Estado vazio: a EAP nasce do catálogo, e o caminho está escrito. */
function EapVazia({ projetoId }: { projetoId: number }) {
  const utils = trpc.useUtils();
  const gerar = trpc.projects.generateEapFromCatalog.useMutation({
    onSuccess: () => utils.projects.wbs.invalidate({ projectId: projetoId }),
  });
  const [tipo, setTipo] = useState<"edificio" | "reforma" | "pavimentacao" | "saneamento" | "todos">("edificio");

  return (
    <div className="xl-vazia-folha">
      <h3>Esta obra ainda não tem EAP</h3>
      <p className="xl-vazia-falta">
        A estrutura é montada a partir dos serviços da base oficial de preços
        (SEINFRA). Se você ainda não importou a planilha da SEINFRA no Catálogo, é
        lá que isso começa. Com a base importada, a árvore com o código oficial de
        cada serviço nasce daqui.
      </p>
      <div className="eap-acoes">
        <select
          className="eap-select"
          value={tipo}
          onChange={e => setTipo(e.target.value as typeof tipo)}
        >
          <option value="edificio">Edifício / construção nova</option>
          <option value="reforma">Reforma</option>
          <option value="pavimentacao">Pavimentação</option>
          <option value="saneamento">Saneamento</option>
          <option value="todos">Todos os grupos</option>
        </select>
        <button
          type="button"
          className="eap-btn"
          disabled={gerar.isPending}
          onClick={() => gerar.mutate({ projectId: projetoId, tipoDeObra: tipo })}
        >
          {gerar.isPending ? "Gerando…" : "Gerar EAP do catálogo"}
        </button>
      </div>
      {gerar.isError && (
        <p className="eap-erro">{gerar.error.message}</p>
      )}
      {gerar.isSuccess && (
        <p className="eap-ok">
          {gerar.data.semeadura.nosCriados} nós criados a partir de{" "}
          {gerar.data.semeadura.servicosUsados} serviços do catálogo.
        </p>
      )}
    </div>
  );
}
