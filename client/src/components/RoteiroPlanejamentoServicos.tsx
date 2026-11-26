import React from "react";
import { ArrowRight, Check } from "lucide-react";

export type RoteiroPlanejamentoServicosProps = {
  readiness: {
    eapApproved: boolean;
    activityCount: number;
    durationsComplete: boolean;
    networkValid: boolean;
    plannedStartDefined: boolean;
    cpmCurrent: boolean;
    baselineActive: boolean;
    totalActivities: number;
    activitiesWithUpdate: number;
  };
  forecast: {
    loading: boolean;
    available: boolean;
    plannedFinishDate: string | null;
    forecastFinishDate: string | null;
    activitiesWithUpdate: number;
    totalActivities: number;
    outOfSequenceActivityIds: readonly string[];
    warnings: readonly { code: string; activityIds: readonly string[]; message: string }[];
    unavailableReason: string | null;
  };
  onOpen: (aba: string) => void;
};

const dataBr = (data: string | null) => data
  ? `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`
  : "Sem data";

export function RoteiroPlanejamentoServicos({ readiness, forecast, onOpen }: RoteiroPlanejamentoServicosProps) {
  const { eapApproved, activityCount, durationsComplete, networkValid, plannedStartDefined, cpmCurrent, baselineActive, totalActivities, activitiesWithUpdate } = readiness;
  const etapas = [
    { titulo: "Definir os serviços na EAP", aba: "eap", concluida: eapApproved, detalhe: "A EAP organiza o escopo em pacotes executáveis." },
    { titulo: "Planejar a duração de cada serviço", aba: "atividades", concluida: activityCount > 0 && durationsComplete, detalhe: "Informe uma duração ou uma quantidade com produtividade justificada." },
    { titulo: "Ordenar a execução", aba: "dependencias", concluida: networkValid, detalhe: "Registre as predecessoras que representam a sequência real da obra." },
    { titulo: "Calcular o prazo e congelar a baseline", aba: !plannedStartDefined ? "escopo" : !cpmCurrent ? "cpm" : "baseline", concluida: plannedStartDefined && cpmCurrent && baselineActive, detalhe: "Defina a data inicial, recalcule o CPM e registre a referência de prazo." },
    { titulo: "Atualizar os serviços em campo", aba: "gantt", concluida: totalActivities > 0 && activitiesWithUpdate >= totalActivities, detalhe: "Informe início real, duração restante, conclusão ou bloqueio por atividade." },
  ];

  const nextIndex = !eapApproved ? 0
    : activityCount === 0 || !durationsComplete ? 1
      : !networkValid ? 2
        : !plannedStartDefined || !cpmCurrent || !baselineActive ? 3
          : 4;
  const next = etapas[nextIndex]!;
  const detalheDaProximaAcao = nextIndex === 3
    ? !plannedStartDefined
      ? "Defina a data inicial da obra para converter os dias úteis do CPM em datas civis."
      : !cpmCurrent
        ? "Recalcule o CPM depois de revisar durações, vínculos e calendário."
        : "Registre a baseline para comparar o plano congelado com as atualizações de campo."
    : next.detalhe;
  const tituloDaProximaAcao = nextIndex === 3
    ? !plannedStartDefined
      ? "Definir a data inicial e calcular o CPM"
      : !cpmCurrent
        ? "Recalcular o CPM atual"
        : "Registrar a baseline de prazo"
    : nextIndex === 4 && totalActivities > 0 && activitiesWithUpdate >= totalActivities
      ? "Revisar o acompanhamento dos serviços"
      : next.titulo;
  const inicioCampo = Math.max(0, Math.min(etapas.length - 1, nextIndex));
  const totalCoberturaForecast = forecast.totalActivities > 0 ? forecast.totalActivities : totalActivities;
  const atualizadasForecast = forecast.totalActivities > 0 ? forecast.activitiesWithUpdate : activitiesWithUpdate;
  const semRelatosDeCampo = !forecast.loading && forecast.available && totalCoberturaForecast > 0 && atualizadasForecast === 0;
  const labelForecast = forecast.loading
    ? "Calculando a previsão pelos relatos…"
    : forecast.available
      ? semRelatosDeCampo
        ? `Cenário conservador sem relatos: ${dataBr(forecast.forecastFinishDate)}`
        : `Previsão pelos relatos: ${dataBr(forecast.forecastFinishDate)}`
      : "Previsão pelos relatos indisponível";
  const labelFimForecast = semRelatosDeCampo ? "Prazo no cenário sem relatos" : "Previsão após relatos";

  return (
    <section className="ct-service-guide" aria-labelledby="ct-service-guide-title" data-testid="roteiro-planejamento-servicos">
      <header className="ct-service-guide-heading">
        <div>
          <span className="ct-overline">PLANEJAMENTO POR SERVIÇOS</span>
          <h2 id="ct-service-guide-title">Como planejar esta obra</h2>
          <p>Organize serviços, duração e sequência; depois atualize o que acontece no campo. Preço e orçamento são opcionais para programar prazo; unidade repetitiva só é exigida para a Linha de Balanço.</p>
        </div>
        <span className="ct-service-guide-optional">Orçamento opcional</span>
      </header>

      <ol className="ct-service-guide-steps" aria-label="Etapas do planejamento">
        {etapas.map((etapa, index) => {
          const atual = index === inicioCampo && !etapa.concluida;
          const estado = etapa.concluida ? "Concluída" : atual ? "Próxima etapa" : "Pendente";
          return (
            <li key={etapa.aba} className={etapa.concluida ? "concluida" : atual ? "atual" : "pendente"}>
              <span className="ct-service-guide-number" aria-hidden="true">{etapa.concluida ? <Check size={15} /> : index + 1}</span>
              <div>
                <strong>{etapa.titulo}</strong>
                <small>{estado} · {etapa.detalhe}</small>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="ct-service-guide-next">
          <div><small>PRÓXIMA AÇÃO</small><strong>{tituloDaProximaAcao}</strong><span>{detalheDaProximaAcao}</span></div>
        <button type="button" data-next-action={next.aba} onClick={() => onOpen(next.aba)}>
          Abrir etapa <ArrowRight size={15} aria-hidden="true" />
        </button>
      </div>

      <section className="ct-service-forecast" aria-label={semRelatosDeCampo ? "Cenário conservador de término sem relatos" : "Previsão de término por relatos de campo"} aria-live="polite">
        <div className="ct-service-forecast-title">
          <div><small>PRAZO A PARTIR DO CAMPO</small><strong>{labelForecast}</strong></div>
          <span>{forecast.loading ? "Lendo relatos" : totalCoberturaForecast > 0 ? `${Math.min(atualizadasForecast, totalCoberturaForecast)} de ${totalCoberturaForecast} serviços atualizados` : "Aguardando atividades"}</span>
        </div>
        <div className="ct-service-forecast-details">
          <span><small>Plano calculado</small><strong>{dataBr(forecast.plannedFinishDate)}</strong></span>
          <span><small>{labelFimForecast}</small><strong>{forecast.available ? dataBr(forecast.forecastFinishDate) : "Indisponível"}</strong></span>
          <span><small>Orçamento</small><strong>Opcional para o prazo</strong></span>
        </div>
        {!forecast.loading && !forecast.available && forecast.unavailableReason && (
          <p className="ct-service-forecast-warning" role="status">{forecast.unavailableReason}</p>
        )}
        {forecast.warnings.map(warning => (
          <p className="ct-service-forecast-warning" key={warning.code} role="note">{warning.message}</p>
        ))}
        {semRelatosDeCampo && (
          <p className="ct-service-forecast-warning" role="note">Sem relatos, serviços com início planejado até a data de corte são tratados como não iniciados e mantêm a duração planejada. É um cenário conservador; não confirma atraso nem execução.</p>
        )}
        <small className="ct-service-forecast-note">A projeção usa o CPM, o calendário e as posições informadas. Ela não altera a baseline nem representa avanço físico ou custo.</small>
      </section>
    </section>
  );
}
