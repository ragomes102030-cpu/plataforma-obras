import { BarChart3, TrendingUp } from "lucide-react";
import { GanttView } from "@/components/GanttView";
import { GraficosView } from "@/components/GraficosView";
import { ABAS_DO_ARES, type IdDaVisaoLateral } from "@shared/abas-ares";

/**
 * As três visões de tela cheia da lateral.
 *
 * Gantt e Curva-S reaproveitam telas que já existem e já leem o backend. A Linha
 * de Balanço NÃO é reaproveitada, e a razão é técnica, não de escopo: a que
 * existe é calculada no navegador (auditoria §11 — eixo com `12` e `7` literais,
 * "hoje" pelo relógio do cliente, dias corridos ignorando o calendário) e é por
 * ATIVIDADE, enquanto a da planilha é por SERVIÇO.
 *
 * Reaproveitar a versão do navegador seria levar a matemática para dentro da
 * interface, que é exatamente o que a regra principal proíbe. E a versão por
 * SERVIÇO depende da entidade SERVIÇO, que ainda não existe (GAP-02 na
 * auditoria). Então a tela diz isso, em vez de mostrar um desenho que parece
 * linha de balanço e não é.
 */

type Props = {
  visao: IdDaVisaoLateral;
  projectId: number;
  projectName: string;
  activities: unknown[];
  plannedStart?: string | Date;
};

function SemServico({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="ares-vazia">
      <BarChart3 size={22} />
      <h3>{titulo}</h3>
      <p>{children}</p>
    </div>
  );
}

export function VisaoLateral({ visao, projectId, projectName, activities, plannedStart }: Props) {
  if (visao === "gantt") {
    // `GanttView` não recebe `projectName`: ele lê o projeto pelo id. Passar
    // seria inventar prop que ele ignora.
    void projectName;
    return (
      <GanttView projectId={projectId} plannedStart={plannedStart} fill />
    );
  }

  if (visao === "curva-s") {
    return (
      <GraficosView
        projectId={projectId}
        projectName={projectName}
        activities={activities as never[]}
      />
    );
  }

  // Linha de Balanço: a versão por SERVIÇO depende de GAP-02.
  const abaServicos = ABAS_DO_ARES.find(aba => aba.id === "servicos")!;
  return (
    <SemServico titulo="Linha de Balanço ainda não pode ser calculada">
      A linha de balanço é <strong>serviço × semana</strong>: a planilha marca a
      célula quando <em>qualquer</em> atividade daquele serviço se sobrepõe à
      semana. Isso exige a entidade <strong>SERVIÇO</strong>
      (EAP × FRENTE × LOCAL), que ainda não existe no banco.
      <br />
      <br />
      {abaServicos.falta}
      <br />
      <br />
      A versão que existe hoje é calculada no navegador e por atividade — não
      serve, e por isso não está sendo mostrada aqui.
    </SemServico>
  );
}

/** Evita import não usado quando a Curva-S não é referenciada. */
export const ICONE_CURVA_S = TrendingUp;
