import { useEffect, useRef, useState } from "react";
import { ABAS_DO_ARES, abaPorId, indiceParaAtalho, type IdDaVisaoLateral } from "@shared/abas-ares";

/**
 * A planilha: abas embaixo, corpo no meio, nada de menu ao lado.
 *
 * POR QUE NÃO HÁ MENU LATERAL
 *
 * A navegação da obra são as abas. Um menu com EAP, Orçamento, Cronogramas,
 * Linha de Balanço, Frentes, Produção, Medição e Restrições ao lado dessas
 * abas dava dois caminhos para o mesmo lugar — e era o que o dono chamava de
 * "sistema dentro do sistema". O que não é aba (portfólio, catálogo,
 * relatórios, configurações) mora na barra de título, no `Home`.
 *
 * POR QUE A CASCA NÃO CALCULA NADA
 *
 * Este componente não tem regra de planejamento. Ele escolhe a aba, mostra o
 * que a aba tem e declara o que falta. Se um valor depende de data,
 * calendário, duração ou CPM, ele chega pronto no `renderConteudo`.
 *
 * POR QUE A LINHA DE BALANÇO NÃO É ABA
 *
 * Ela é a mesma tabela do CRONOGRAMA vista em escala de semana. Virar aba
 * repetiria a mesma lista de atividades duas vezes. Fica na lateral do GANTT,
 * que é o lugar onde a escala muda.
 */

type Props = {
  obra: string;
  projetoId: number;
  aba: string;
  onAba: (aba: string) => void;
  renderConteudo: (aba: string) => React.ReactNode;
  /** Gancho das visões de tela cheia (Gantt, Linha de Balanço). */
  renderLateral: (visao: IdDaVisaoLateral) => React.ReactNode;
};

export function PlanilhaObra({
  obra,
  projetoId,
  aba,
  onAba,
  renderConteudo,
  renderLateral,
}: Props) {
  const [indice, setIndice] = useState(0);
  const [visao, setVisao] = useState<IdDaVisaoLateral | null>(null);

  const atual = abaPorId(aba);

  // `renderLateral` e `projetoId` ficam no contrato desde que a lateral do
  // Gantt foi desenhada. A lateral não tem desenho ainda; as abas funcionam
  // sem ela, e a prop segue aqui para a aba GANTT abrir sem mexer na casca.
  void renderLateral;
  void projetoId;
  void visao;
  void setVisao;

  // Ctrl+1..9 como na planilha. Se a pessoa está digitando numa célula, o
  // atalho é da célula.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (!e.ctrlKey || e.altKey || e.metaKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) return;
      const numero = Number(e.key);
      if (!Number.isInteger(numero)) return;
      const i = numero === 0 ? 9 : numero - 1;
      if (i >= ABAS_DO_ARES.length) return;
      e.preventDefault();
      setIndice(i);
      onAba(ABAS_DO_ARES[i]!.id);
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onAba]);

  // A aba ativa vai para a vista se não couber.
  const barra = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = barra.current?.querySelector<HTMLElement>('[data-ativa="true"]');
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [aba]);

  return (
    <div className="xl-pasta" data-projeto={projetoId}>
      <div className="xl-area">
        {atual.status === "pendente" ? (
          <AbaVazia titulo={atual.rotulo} falta={atual.falta ?? ""} />
        ) : (
          renderConteudo(atual.id)
        )}
      </div>

      <div className="xl-rodape" ref={el => { barra.current = el; }}>
        <div className="xl-abas" role="tablist" aria-label="Abas da obra">
          {ABAS_DO_ARES.map((a, i) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={a.id === aba}
              data-ativa={a.id === aba}
              data-status={a.status}
              className={`xl-aba${a.id === aba ? " ativa" : ""}`}
              onClick={() => {
                setIndice(i);
                onAba(a.id);
              }}
              title={a.falta ?? a.componenteExistente ?? a.rotulo}
            >
              {a.rotulo}
            </button>
          ))}
        </div>
        <span className="xl-rodape-info" aria-hidden="true">
          {obra} · Ctrl+{indiceParaAtalho(indice)}
        </span>
      </div>
    </div>
  );
}

/**
 * Aba sem conteúdo. Diz o que falta e por quê.
 *
 * A alternativa — um cartão "em breve" — é estrutura de mentira que parece
 * pronta. Aqui a ausência é explícita e nomeia o bloqueio.
 */
function AbaVazia({ titulo, falta }: { titulo: string; falta: string }) {
  return (
    <div className="xl-vazia-folha">
      <h3>{titulo} ainda não existe</h3>
      {falta && <p className="xl-vazia-falta">{falta}</p>}
      <p className="xl-vazia-nota">
        Isso é deliberado: a aba não desenha tela vazia que pareça funcionando.
        O que falta está escrito acima porque é o caminho, não um prazo.
      </p>
    </div>
  );
}
