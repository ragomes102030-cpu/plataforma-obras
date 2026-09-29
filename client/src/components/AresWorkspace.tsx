import { BarChart3, CalendarDays, ChevronUp, GanttChartSquare, LayoutGrid, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ABAS_DO_ARES,
  VISOES_LATERAIS,
  indiceParaAtalho,
  type IdDaVisaoLateral,
} from "@shared/abas-ares";

/**
 * A casca do ARES: planilha com abas embaixo e visões de tela cheia na lateral.
 *
 * POR QUE O CONTEÚDO VEM PRONTO DE FORA
 *
 * Este componente NÃO tem regra de planejamento. Ele escolhe a aba, mostra o
 * que a aba tem e declara o que falta. A matemática é do backend — a auditoria
 * (`AUDITORIA_MOTOR_DE_PLANEJAMENTO.md` §10) mediu seis constantes de
 * milissegundo, três `Date.now()` e três `defaultCalendar()` calculando data no
 * navegador. Nada disso entra aqui, e a regra é: se um valor depende de data,
 * calendário, duração ou CPM, ele chega pronto no `renderAba`.
 *
 * O estado da aba mora no pai, não aqui, para que a rota e a barra lateral nunca
 * discordem sobre "em que aba estou".
 */

export type AbaDoAres = (typeof ABAS_DO_ARES)[number]["id"];

type Props = {
  obra: string;
  projetoId: number;
  aba: AbaDoAres;
  onAba: (aba: AbaDoAres) => void;
  /**
   * Conteúdo de cada aba. Só é chamado quando a aba existe de verdade — aba
   * pendente não chega aqui.
   */
  renderAba: (aba: AbaDoAres) => React.ReactNode;
  /** Conteúdo das visões de tela cheia, pela mesma razão. */
  renderVisao: (visao: IdDaVisaoLateral) => React.ReactNode;
};

export function AresWorkspace({
  obra,
  projetoId,
  aba,
  onAba,
  renderAba,
  renderVisao,
}: Props) {
  const [visao, setVisao] = useState<IdDaVisaoLateral | null>(null);
  const [indiceAba, setIndiceAba] = useState(0);

  // Ctrl+1..9 / Ctrl+0, como na planilha. Só quando a barra inferior tem foco
  // conceitual: se o usuário está digitando numa célula, o atalho é da célula.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (!e.ctrlKey || e.altKey || e.metaKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) return;
      const numero = Number(e.key);
      if (!Number.isInteger(numero)) return;
      const indice = numero === 0 ? 9 : numero - 1;
      if (indice >= ABAS_DO_ARES.length) return;
      e.preventDefault();
      setIndiceAba(indice);
      onAba(ABAS_DO_ARES[indice]!.id);
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onAba]);

  // Rola a barra até a aba ativa: com 18 abas, a ativa nasce fora da vista.
  const barra = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = barra.current?.querySelector<HTMLElement>('[data-ativa="true"]');
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [aba]);

  const abaAtual = useMemo(
    () => ABAS_DO_ARES.find(a => a.id === aba) ?? ABAS_DO_ARES[0]!,
    [aba]
  );

  const ICONES: Record<IdDaVisaoLateral, typeof GanttChartSquare> = {
    gantt: GanttChartSquare,
    lob: BarChart3,
    "curva-s": TrendingUp,
  };

  return (
    <div className="ares-shell" data-projeto={projetoId}>
      <header className="ares-topo">
        <div className="ares-marca">
          <LayoutGrid size={15} />
          <strong>ARES</strong>
        </div>
        <span className="ares-obra">{obra}</span>
        <div className="ares-topo-fim">
          {abaAtual.status !== "pronta" && (
            <span className={`ares-status ares-status-${abaAtual.status}`}>
              {abaAtual.status === "pendente" ? "aba vazia" : "incompleta"}
            </span>
          )}
        </div>
      </header>

      <div className="ares-corpo">
        <nav className="ares-lateral" aria-label="Visões de tela cheia">
          {VISOES_LATERAIS.map(v => {
            const Icone = ICONES[v.id];
            const ativa = visao === v.id;
            return (
              <button
                key={v.id}
                type="button"
                className={`ares-lateral-item${ativa ? " ativa" : ""}`}
                onClick={() => setVisao(ativa ? null : v.id)}
                title={v.descricao}
                aria-pressed={ativa}
              >
                <Icone size={16} />
                <span>{v.rotulo}</span>
              </button>
            );
          })}
        </nav>

        <main className="ares-area">
          {visao ? (
            <section className="ares-visao" aria-label={visao}>
              <div className="ares-visao-topo">
                <button
                  type="button"
                  className="outline-button"
                  onClick={() => setVisao(null)}
                >
                  <ChevronUp size={13} /> Voltar às abas
                </button>
                <h2>{VISOES_LATERAIS.find(v => v.id === visao)?.rotulo}</h2>
              </div>
              <div className="ares-visao-corpo">{renderVisao(visao)}</div>
            </section>
          ) : (
            <section className="ares-grade-area" aria-label={abaAtual.rotulo}>
              {abaAtual.status === "pendente" ? (
                <AbaVazia aba={abaAtual} />
              ) : (
                renderAba(abaAtual.id)
              )}
            </section>
          )}
        </main>
      </div>

      <div className="ares-rodape" ref={el => { barra.current = el; }}>
        <div className="ares-abas" role="tablist" aria-label="Abas do modelo ARES">
          {ABAS_DO_ARES.map((a, indice) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={a.id === aba}
              data-ativa={a.id === aba}
              data-status={a.status}
              className={`ares-aba${a.id === aba ? " ativa" : ""}`}
              onClick={() => {
                setIndiceAba(indice);
                onAba(a.id);
              }}
              title={
                a.falta ? `${a.rotulo} — ${a.falta}` : (a.componenteExistente ?? a.rotulo)
              }
            >
              <span className="ares-aba-ponto" aria-hidden="true" />
              {a.rotulo}
            </button>
          ))}
        </div>
        <span className="ares-atalhos" aria-hidden="true">
          Ctrl+{indiceParaAtalho(indiceAba)} · {indiceAba + 1} de {ABAS_DO_ARES.length}
        </span>
      </div>
    </div>
  );
}

/**
 * Aba sem conteúdo. Diz o que falta e por quê.
 *
 * A alternativa — um cartão "em breve" genérico — é o que o `seedStarterPlan`
 * fazia: estrutura de mentira que parecia pronta. Aqui a ausência é explícita e
 * nomeia o bloqueio, para ninguém concluir que a tela quebrou.
 */
function AbaVazia({ aba }: { aba: (typeof ABAS_DO_ARES)[number] }) {
  return (
    <div className="ares-vazia">
      <CalendarDays size={22} />
      <h3>{aba.rotulo} ainda não existe</h3>
      <p>{aba.falta}</p>
      <p className="ares-vazia-nota">
        Isso é deliberado: a aba não desenha tela vazia que pareça funcionando.
        O que falta está escrito acima porque é o caminho, não um prazo.
      </p>
    </div>
  );
}
