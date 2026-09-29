import { BarChart3, ChevronRight, GanttChartSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  ABAS_DO_ARES,
  VISOES_LATERAIS,
  abaPorId,
  indiceParaAtalho,
  type IdDaVisaoLateral,
} from "@shared/abas-ares";

/**
 * A obra como planilha: abas embaixo, uma navegação só.
 *
 * POR QUE NÃO TEM MENU LATERAL DE MÓDULOS
 *
 * A versão anterior desta casca ficou DENTRO do menu de módulos que já existia
 * (Portfólio, EAP, Orçamento, Cronogramas…), e o resultado foi o que o dono
 * chamou de "sistema dentro do sistema": EAP aparecia no menu e na barra de
 * abas, Linha de Balanço aparecia em três lugares, e o menu e a barra mantinham
 * dois estados dizendo onde a pessoa está. Aqui as abas são a navegação. O
 * menu lateral do aplicativo guarda só o que não é aba — portfólio, catálogo,
 * relatórios, configurações.
 *
 * POR QUE A LATERAL SÓ ABRE NO GANTT
 *
 * A Linha de Balanço não é uma aba: é a mesma tabela do CRONOGRAMA vista em
 * escala de semana. Virar aba repetiria a mesma lista de atividades em outra
 * escala. Ela mora na lateral do GANTT, ao lado do controle de ritmo.
 *
 * A lateral é chrome: não tem regra de planejamento. O que ela mostra chega
 * pronto em `renderConteudo`.
 */

type Props = {
  obra: string;
  projetoId: number;
  aba: string;
  onAba: (aba: string) => void;
  renderConteudo: (aba: string) => React.ReactNode;
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
  const [visao, setVisao] = useState<IdDaVisaoLateral | null>(null);
  const [indice, setIndice] = useState(0);

  const atual = abaPorId(aba);

  // A lateral é do Gantt. Trocar de aba fecha, senão a Linha de Balanço
  // fica aberta sobre a MEDICOES, que não tem nada a ver com ela.
  useEffect(() => {
    setVisao(null);
  }, [aba]);

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

  // Com seis abas a ativa quase sempre nasce na vista, mas o contrato é o
  // mesmo da planilha: a aba ativa vai para a vista se não couber.
  const barra = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = barra.current?.querySelector<HTMLElement>('[data-ativa="true"]');
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [aba]);

  const lateralAberta = visao !== null;

  return (
    <div className="pl-obra" data-projeto={projetoId}>
      <div className="pl-corpo">
        <div className="pl-area">
          {atual.status === "pendente" ? (
            <AbaVazia titulo={atual.rotulo} falta={atual.falta ?? ""} />
          ) : (
            renderConteudo(atual.id)
          )}
        </div>

        {atual.id === "gantt" && (
          <aside className={`pl-lateral${lateralAberta ? " aberta" : ""}`}>
            <div className="pl-lateral-topo">
              <strong>Gráfico</strong>
              <button
                type="button"
                className="pl-lateral-fechar"
                onClick={() => setVisao(null)}
                title="Fechar a lateral"
              >
                <ChevronRight size={15} />
              </button>
            </div>
            <div className="pl-lateral-escolha">
              {VISOES_LATERAIS.map(v => {
                const Icone = v.id === "gantt" ? GanttChartSquare : BarChart3;
                const ativa = visao === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    className={`pl-lateral-item${ativa ? " ativa" : ""}`}
                    onClick={() => setVisao(ativa ? null : v.id)}
                    title={v.descricao}
                    aria-pressed={ativa}
                  >
                    <Icone size={15} />
                    <span>{v.rotulo}</span>
                  </button>
                );
              })}
            </div>
            {visao && <div className="pl-lateral-corpo">{renderLateral(visao)}</div>}
          </aside>
        )}
      </div>

      <div className="pl-rodape" ref={el => { barra.current = el; }}>
        <div className="pl-abas" role="tablist" aria-label="Abas da obra">
          {ABAS_DO_ARES.map((a, i) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={a.id === aba}
              data-ativa={a.id === aba}
              data-status={a.status}
              className={`pl-aba${a.id === aba ? " ativa" : ""}`}
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
        <span className="pl-rodape-info" aria-hidden="true">
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
    <div className="pl-vazia">
      <h3>{titulo} ainda não existe</h3>
      {falta && <p className="pl-vazia-falta">{falta}</p>}
      <p className="pl-vazia-nota">
        Isso é deliberado: a aba não desenha tela vazia que pareça funcionando.
        O que falta está escrito acima porque é o caminho, não um prazo.
      </p>
    </div>
  );
}
