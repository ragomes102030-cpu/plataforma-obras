import { AlertTriangle, Calculator, CheckCircle2, Network, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { isStoredCpmCurrent } from "@shared/cpm-validity";

type Props = { projetoId: number };

export function AbaCpm({ projetoId }: Props) {
  const utils = trpc.useUtils();
  const plano = trpc.planning.list.useQuery(
    { projectId: projetoId },
    { enabled: projetoId > 0 }
  );
  const [mensagem, setMensagem] = useState<string | null>(null);

  const calcular = trpc.planning.calculateCpm.useMutation({
    onSuccess: async result => {
      setMensagem(
        result.valid
          ? `CPM calculado · ${result.projectDuration} dias úteis.`
          : result.issues?.[0]?.message ?? "A rede precisa de correção antes do cálculo."
      );
      await Promise.all([
        utils.planning.list.invalidate({ projectId: projetoId }),
        utils.planning.grade.invalidate({ projectId: projetoId }),
      ]);
    },
    onError: error => setMensagem(error.message),
  });

  const activities = plano.data?.activities ?? [];
  const dependencies = plano.data?.dependencies ?? [];

  const resumo = useMemo(() => {
    const validas = activities.filter(activity => Number(activity.durationDays) >= 1);
    const calculadas = validas.filter(activity => activity.cpmCalculatedAt);
    const criticas = validas.filter(activity => Number(activity.critical) === 1);
    const desatualizado = validas.some(
      activity =>
        !activity.cpmCalculatedAt ||
        new Date(activity.cpmCalculatedAt).getTime() < new Date(activity.updatedAt).getTime()
    );
    const projectDuration = validas.length
      ? Math.max(...validas.map(activity => Number(activity.earlyFinish ?? 0)))
      : 0;
    const hasStoredCpm = validas.length > 0 && calculadas.length === validas.length && !desatualizado;
    const critical = [...criticas].sort(
      (a, b) => Number(a.earlyStart ?? 0) - Number(b.earlyStart ?? 0) || a.id - b.id
    );
    return { validas, calculadas, criticas, desatualizado, projectDuration, hasStoredCpm, critical };
  }, [activities]);

  const problemaRede =
    activities.length === 0
      ? "Crie atividades a partir da EAP aprovada antes de calcular o CPM."
      : resumo.validas.length !== activities.length
        ? `${activities.length - resumo.validas.length} atividade(s) ainda possuem duração inválida.`
        : activities.length > 1 && dependencies.length === 0
          ? "A rede ainda não possui dependências. O CPM pode calcular uma rede sem vínculos, mas isso não representa a lógica completa da obra."
          : null;

  if (plano.isPending) {
    return (
      <section className="pl-planejamento-panel">
        <div className="pl-planejamento-loading">
          <RefreshCw size={14} className="pl-spin" /> Carregando cálculo CPM…
        </div>
      </section>
    );
  }

  if (plano.isError) {
    return (
      <section className="pl-planejamento-panel">
        <div className="pl-planejamento-alerta erro">{plano.error.message}</div>
      </section>
    );
  }

  return (
    <section className="pl-planejamento-panel">
      <header className="pl-planejamento-head">
        <div>
          <div className="pl-planejamento-kicker"><Network size={13} /> CPM / CAMINHO CRÍTICO</div>
          <h2>Rede calculada do cronograma</h2>
          <p>
            O motor calcula início cedo, término cedo, início tarde, término tarde,
            folga total e caminho crítico a partir das atividades e dependências da versão atual.
          </p>
        </div>
        <button
          type="button"
          className="pl-planejamento-cpm"
          onClick={() => {
            setMensagem(null);
            calcular.mutate({ projectId: projetoId });
          }}
          disabled={calcular.isPending || activities.length === 0 || resumo.validas.length !== activities.length}
          title={
            activities.length === 0
              ? "Crie atividades primeiro."
              : resumo.validas.length !== activities.length
                ? "Todas as atividades precisam de duração válida."
                : "Executar o cálculo determinístico do CPM."
          }
        >
          <Calculator size={13} />
          {calcular.isPending ? "Calculando…" : "Calcular CPM"}
        </button>
      </header>

      {mensagem && <div className="pl-planejamento-alerta">{mensagem}</div>}

      <div className="pl-planejamento-cards">
        <div>
          <span>Atividades</span>
          <strong>{activities.length}</strong>
          <small>{resumo.validas.length} com duração válida</small>
        </div>
        <div>
          <span>Dependências</span>
          <strong>{dependencies.length}</strong>
          <small>{dependencies.length ? "rede lógica registrada" : "nenhum vínculo"}</small>
        </div>
        <div>
          <span>Caminho crítico</span>
          <strong>{resumo.criticas.length}</strong>
          <small>folga total ≤ 0</small>
        </div>
        <div className={resumo.desatualizado ? "alerta" : ""}>
          <span>Estado do CPM</span>
          <strong>
            {resumo.desatualizado
              ? "Desatualizado"
              : resumo.hasStoredCpm
                ? "Calculado"
                : "Aguardando cálculo"}
          </strong>
          <small>
            {resumo.desatualizado
              ? "edite as atividades e recalcule"
              : resumo.hasStoredCpm
                ? `${resumo.projectDuration} dias úteis`
                : "ainda não há resultado persistido"}
          </small>
        </div>
      </div>

      {problemaRede && (
        <div className="pl-planejamento-box">
          <div className="pl-planejamento-box-head">
            <div>
              <strong><AlertTriangle size={13} /> Atenção antes do CPM</strong>
              <span>O sistema mantém o cálculo determinístico e não inventa duração.</span>
            </div>
          </div>
          <p className="pl-planejamento-vazio">{problemaRede}</p>
        </div>
      )}

      <div className="pl-planejamento-grid">
        <div className="pl-planejamento-box">
          <div className="pl-planejamento-box-head">
            <div>
              <strong><Network size={13} /> Caminho crítico</strong>
              <span>Atividades persistidas com folga total menor ou igual a zero.</span>
            </div>
          </div>
          {resumo.criticas.length === 0 ? (
            <p className="pl-planejamento-vazio">
              Ainda não há caminho crítico persistido. Calcule o CPM com uma rede válida.
            </p>
          ) : (
            <div className="pl-cpm-tabela criticos">
              <div className="pl-cpm-linha pl-cpm-cabecalho">
                <span>#</span><span>Atividade</span><span>EF</span><span>Folga</span>
              </div>
              {resumo.critical.map((activity, index) => (
                <div key={activity.id} className={Number(activity.critical) === 1 ? "pl-cpm-linha critica" : "pl-cpm-linha"}>
                  <span>{index + 1}</span>
                  <span title={`${activity.wbsCode} — ${activity.name}`}>{activity.wbsCode} — {activity.name}</span>
                  <span>{Number(activity.earlyFinish ?? 0)}</span>
                  <span>{Number(activity.totalFloat ?? 0)}d</span>
                </div>
              ))}
              <small>EF = término mais cedo (dias) · Folga = folga total; zero ou negativa caracteriza o caminho crítico.</small>
            </div>
          )}
        </div>

        <div className="pl-planejamento-box">
          <div className="pl-planejamento-box-head">
            <div>
              <strong><CheckCircle2 size={13} /> Folgas e marcos CPM</strong>
              <span>Referência útil para revisão da lógica antes da baseline.</span>
            </div>
          </div>
          {resumo.validas.length === 0 ? (
            <p className="pl-planejamento-vazio">Sem atividades calculáveis.</p>
          ) : (
            <div className="pl-cpm-tabela">
              <div className="pl-cpm-linha pl-cpm-cabecalho">
                <span>Atividade</span><span>ES</span><span>EF</span><span>LS</span><span>LF</span><span>FT</span>
              </div>
              {resumo.validas.slice(0, 40).map(activity => (
                <div key={activity.id} className={Number(activity.critical) === 1 ? "pl-cpm-linha critica" : "pl-cpm-linha"}>
                  <span>{activity.wbsCode} — {activity.name}</span>
                  <span>{Number(activity.earlyStart ?? 0)}</span>
                  <span>{Number(activity.earlyFinish ?? 0)}</span>
                  <span>{Number(activity.lateStart ?? 0)}</span>
                  <span>{Number(activity.lateFinish ?? 0)}</span>
                  <span>{Number(activity.totalFloat ?? 0)}</span>
                </div>
              ))}
              {resumo.validas.length > 40 && (
                <small>Mostrando 40 de {resumo.validas.length} atividades calculáveis.</small>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="pl-planejamento-box">
        <div className="pl-planejamento-box-head">
          <div>
            <strong>Critério de gate</strong>
            <span>O CPM não aprova a baseline sozinho.</span>
          </div>
        </div>
        <div className="pl-planejamento-cards">
          <div><span>Duração</span><strong>{resumo.validas.length === activities.length && activities.length ? "OK" : "Pendente"}</strong><small>todas as atividades precisam de duração válida</small></div>
          <div><span>Rede</span><strong>{dependencies.length > 0 || activities.length < 2 ? "OK" : "Pendente"}</strong><small>relações devem representar a lógica real da obra</small></div>
          <div><span>Resultado</span><strong>{resumo.hasStoredCpm ? "Persistido" : "Não calculado"}</strong><small>o resultado fica registrado nas atividades da versão</small></div>
          <div><span>Próxima etapa</span><strong>{resumo.hasStoredCpm ? "Baseline" : "CPM"}</strong><small>baseline só depois de revisão do caminho crítico</small></div>
        </div>
      </div>
    </section>
  );
}
