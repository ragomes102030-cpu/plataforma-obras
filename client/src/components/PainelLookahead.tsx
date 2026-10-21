import { CalendarRange, Check, LockKeyhole, Plus, TriangleAlert, X } from "lucide-react";
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";

/**
 * Lookahead de 4 semanas + PPC (Last Planner).
 *
 * A tela responde duas perguntas que a obra faz na reunião de segunda:
 * o que vai acontecer nas próximas 4 semanas e o que está travado; e quanto do
 * que foi prometido na semana passada realmente saiu.
 *
 * Três decisões de interface que existem para o número não virar enfeite:
 *
 *   - PPC sem avaliação aparece como "—", nunca "0%" nem "100%". Semana em
 *     andamento com compromissos em aberto mostra quantos faltam avaliar.
 *   - "Não cumpriu" exige motivo na própria linha. Motivo obrigatório é o que
 *     transforma o indicador em pauta: material atrasado, projeto incompleto,
 *     frente liberada.
 *   - Restrição aberta aparece colada na atividade, não num menu separado. Se
 *     estiver escondida, ninguém remove.
 */

const TIPOS_RESTRICAO = [
  { valor: "material", rotulo: "Material" },
  { valor: "mao_de_obra", rotulo: "Mão de obra" },
  { valor: "equipamento", rotulo: "Equipamento" },
  { valor: "projeto", rotulo: "Projeto / documentação" },
  { valor: "permissao", rotulo: "Permissão / licença" },
  { valor: "frente_trabalho", rotulo: "Frente de trabalho" },
  { valor: "seguranca", rotulo: "Segurança" },
  { valor: "outro", rotulo: "Outro" },
] as const;

const MOTIVOS = [
  { valor: "material", rotulo: "Material" },
  { valor: "mao_de_obra", rotulo: "Mão de obra" },
  { valor: "equipamento", rotulo: "Equipamento" },
  { valor: "projeto", rotulo: "Projeto" },
  { valor: "permissao", rotulo: "Permissão" },
  { valor: "clima", rotulo: "Clima" },
  { valor: "cliente", rotulo: "Cliente" },
  { valor: "fornecedor", rotulo: "Fornecedor" },
  { valor: "retrabalho", rotulo: "Retrabalho" },
  { valor: "frente_trabalho", rotulo: "Frente" },
  { valor: "seguranca", rotulo: "Segurança" },
  { valor: "outro", rotulo: "Outro" },
] as const;

type TipoRestricao = (typeof TIPOS_RESTRICAO)[number]["valor"];
type Motivo = (typeof MOTIVOS)[number]["valor"];

const percentual = (valor: number | null | undefined): string =>
  valor == null ? "—" : `${valor.toFixed(1).replace(".", ",")}%`;

const dataCurta = (iso: string): string => {
  const [, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}`;
};

const ROTULO_MOTIVO = (motivo: string): string =>
  MOTIVOS.find(item => item.valor === motivo)?.rotulo ?? motivo;

const ROTULO_TIPO = (tipo: string): string =>
  TIPOS_RESTRICAO.find(item => item.valor === tipo)?.rotulo ?? tipo;

const hojeLocalIso = (): string => {
  const agora = new Date();
  const local = new Date(agora.getTime() - agora.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const SITUACAO_ROTULO: Record<string, string> = {
  encerrada: "encerrada",
  corrente: "corrente",
  futura: "futura",
};

export function PainelLookahead({ projetoId }: { projetoId: number }) {
  const utils = trpc.useUtils();
  const [semanaEscolhida, setSemanaEscolhida] = useState<number | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [motivoPorCompromisso, setMotivoPorCompromisso] = useState<Record<number, Motivo>>({});

  const [restricaoAtividade, setRestricaoAtividade] = useState("");
  const [restricaoTipo, setRestricaoTipo] = useState<TipoRestricao>("material");
  const [restricaoDescricao, setRestricaoDescricao] = useState("");
  const [restricaoResponsavel, setRestricaoResponsavel] = useState("");
  const [restricaoPrazo, setRestricaoPrazo] = useState("");

  // `hoje` vai no fuso do navegador: no servidor (Render) é UTC, e às 22h daqui
  // já seria "amanhã" lá — a semana corrente mudaria de lugar.
  const hoje = hojeLocalIso();
  const look = trpc.planning.lookahead.useQuery({ projectId: projetoId, hoje });
  const restricoes = trpc.planning.restricoes.useQuery({
    projectId: projetoId,
    incluirResolvidas: false,
  });
  const planejamento = trpc.planning.list.useQuery({ projectId: projetoId });

  const atividades = useMemo(
    () => planejamento.data?.activities ?? [],
    [planejamento.data]
  );

  const invalidar = async () => {
    await Promise.all([
      utils.planning.lookahead.invalidate(),
      utils.planning.restricoes.invalidate(),
    ]);
  };

  const aoFalhar = (erro: { message: string }) => setMensagem(erro.message);

  const criarRestricao = trpc.planning.criarRestricao.useMutation({
    onSuccess: async () => {
      setMensagem("Restrição registrada.");
      setRestricaoDescricao("");
      setRestricaoResponsavel("");
      setRestricaoPrazo("");
      await invalidar();
    },
    onError: aoFalhar,
  });

  const removerRestricao = trpc.planning.removerRestricao.useMutation({
    onSuccess: async () => {
      setMensagem("Restrição resolvida.");
      await invalidar();
    },
    onError: aoFalhar,
  });

  const salvarCompromisso = trpc.planning.salvarCompromisso.useMutation({
    onSuccess: async () => {
      setMensagem("Compromisso assumido.");
      await invalidar();
    },
    onError: aoFalhar,
  });

  const avaliarCompromisso = trpc.planning.avaliarCompromisso.useMutation({
    onSuccess: async () => {
      setMensagem("Avaliação registrada.");
      await invalidar();
    },
    onError: aoFalhar,
  });

  const dados = look.data;
  const semanas = dados?.semanas ?? [];
  const indiceCorrente = semanas.findIndex(semana => semana.situacao === "corrente");
  const indiceAtivo =
    semanaEscolhida ?? (indiceCorrente >= 0 ? indiceCorrente : 0);
  const semana = semanas[indiceAtivo];
  const abertas = restricoes.data?.itens ?? [];

  const comprometer = (activityId: number) => {
    if (!semana) return;
    salvarCompromisso.mutate({
      projectId: projetoId,
      activityId,
      weekStart: semana.inicio,
      plannedQuantity: null,
      responsible: null,
    });
  };

  const registrarRestricao = () => {
    if (!restricaoAtividade) {
      setMensagem("Escolha a atividade que está travada.");
      return;
    }
    if (restricaoDescricao.trim().length < 3) {
      setMensagem("Descreva a restrição (mínimo 3 caracteres).");
      return;
    }
    criarRestricao.mutate({
      projectId: projetoId,
      activityId: Number(restricaoAtividade),
      type: restricaoTipo,
      description: restricaoDescricao.trim(),
      responsible: restricaoResponsavel.trim() || null,
      neededBy: restricaoPrazo || null,
    });
  };

  return (
    <section className="pl-look">
      <header className="pl-look-topo">
        <div>
          <h3>
            <CalendarRange size={16} /> Lookahead 4 semanas · PPC
          </h3>
          <p className="pl-look-sub">
            Semana base {dados ? dataCurta(dados.semanaBase) : "—"} · hoje{" "}
            {dataCurta(hoje)} · {dados?.totalAtividades ?? 0} atividade(s) na janela
            {dados?.atividadesSemData
              ? ` · ${dados.atividadesSemData} sem data no cronograma`
              : ""}
          </p>
        </div>
        <div className="pl-look-ppc">
          <span>PPC da semana</span>
          <strong>{percentual(dados?.ppcCorrente)}</strong>
          <span className="pl-look-mini">
            média das encerradas: {percentual(dados?.ppcMedio)}
            {dados?.tendencia && dados.tendencia !== "sem_dados"
              ? ` · ${dados.tendencia}`
              : ""}
          </span>
        </div>
      </header>

      {!dados?.available && (
        <p className="pl-look-aviso">
          <TriangleAlert size={14} /> {dados?.note ?? "Lookahead indisponível."}
        </p>
      )}

      {dados?.alertas.map(alerta => (
        <p key={alerta} className="pl-look-aviso">
          <TriangleAlert size={14} /> {alerta}
        </p>
      ))}

      <div className="pl-look-semanas">
        {semanas.map((item, indice) => (
          <button
            key={item.inicio}
            type="button"
            className={`pl-look-semana${indice === indiceAtivo ? " pl-look-ativa" : ""}`}
            onClick={() => setSemanaEscolhida(indice)}
          >
            <strong>
              {dataCurta(item.inicio)} – {dataCurta(item.fim)}
            </strong>
            <span>
              {SITUACAO_ROTULO[item.situacao] ?? item.situacao} · PPC{" "}
              {percentual(item.ppc)}
            </span>
          </button>
        ))}
      </div>

      {semana && (
        <>
          <div className="pl-look-kpis">
            <Kpi titulo="Compromissos" valor={String(semana.compromissos.length)} />
            <Kpi titulo="Cumpridos" valor={String(semana.concluidos)} />
            <Kpi
              titulo="Não cumpridos"
              valor={String(semana.naoConcluidos)}
              alerta={semana.naoConcluidos > 0}
            />
            <Kpi
              titulo="Sem avaliação"
              valor={String(semana.pendentes)}
              alerta={semana.pendentes > 0}
            />
            <Kpi
              titulo="PPC"
              valor={percentual(semana.ppc)}
              alerta={semana.ppc !== null && semana.ppc < 60}
            />
            <Kpi titulo="PPC em quantidade" valor={percentual(semana.ppcQuantidade)} />
            <Kpi
              titulo="Prontas p/ executar"
              valor={`${semana.prontas}/${semana.atividades.length}`}
              alerta={semana.bloqueadas > 0}
            />
          </div>

          {semana.causas.length > 0 && (
            <div className="pl-look-causas">
              <span className="pl-look-sub">Causas das não conformidades</span>
              {semana.causas.map(causa => (
                <div key={causa.reason} className="pl-look-causa">
                  <span>{ROTULO_MOTIVO(causa.reason)}</span>
                  <div className="pl-look-trilho">
                    <div
                      className="pl-look-preenchido"
                      style={{ width: `${causa.participacao}%` }}
                    />
                  </div>
                  <strong>
                    {causa.quantidade} ({percentual(causa.participacao)})
                  </strong>
                </div>
              ))}
            </div>
          )}

          <div className="pl-look-tabela">
            <table>
              <thead>
                <tr>
                  <th>EAP</th>
                  <th>Atividade da semana</th>
                  <th>Período</th>
                  <th className="pl-look-num">Executado</th>
                  <th>Restrições</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {semana.atividades.length === 0 && (
                  <tr>
                    <td colSpan={6} className="pl-look-vazio">
                      Nenhuma atividade planejada nesta semana. Se o cronograma
                      está correto, a obra não tem frente aberta aqui.
                    </td>
                  </tr>
                )}
                {semana.atividades.map(atividade => (
                  <tr key={atividade.id}>
                    <td>{atividade.wbsCode || "—"}</td>
                    <td>{atividade.name}</td>
                    <td>
                      {dataCurta(atividade.startIso)} – {dataCurta(atividade.finishIso)}
                    </td>
                    <td className="pl-look-num">
                      {percentual(atividade.percentualExecutado)}
                    </td>
                    <td>
                      {atividade.pronta ? (
                        <span className="pl-look-ok">
                          <Check size={12} /> pronta
                        </span>
                      ) : (
                        <span className="pl-look-bloqueio">
                          <LockKeyhole size={12} /> {atividade.openConstraints} aberta(s)
                        </span>
                      )}
                    </td>
                    <td>
                      {atividade.comprometida ? (
                        <span className="pl-look-mini">comprometida</span>
                      ) : (
                        <button
                          type="button"
                          className="pl-look-link"
                          onClick={() => comprometer(atividade.id)}
                          disabled={salvarCompromisso.isPending}
                        >
                          <Plus size={12} /> comprometer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pl-look-tabela">
            <table>
              <thead>
                <tr>
                  <th>Compromisso</th>
                  <th>Responsável</th>
                  <th className="pl-look-num">Planejado</th>
                  <th className="pl-look-num">Executado</th>
                  <th>Situação</th>
                  <th>Avaliar</th>
                </tr>
              </thead>
              <tbody>
                {semana.compromissos.length === 0 && (
                  <tr>
                    <td colSpan={6} className="pl-look-vazio">
                      Nenhum compromisso assumido nesta semana. Sem compromisso não
                      existe PPC — a semana entra como “sem medição”, não como 0%.
                    </td>
                  </tr>
                )}
                {semana.compromissos.map(compromisso => {
                  const atividade = atividades.find(a => a.id === compromisso.activityId);
                  const motivo = motivoPorCompromisso[compromisso.id] ?? "material";
                  return (
                    <tr key={compromisso.id}>
                      <td>
                        {atividade?.wbsCode ? `${atividade.wbsCode} — ` : ""}
                        {atividade?.name ?? `Atividade ${compromisso.activityId}`}
                      </td>
                      <td>{compromisso.responsible ?? "—"}</td>
                      <td className="pl-look-num">{compromisso.plannedQuantity ?? "—"}</td>
                      <td className="pl-look-num">{compromisso.executedQuantity ?? "—"}</td>
                      <td>
                        {compromisso.status === "concluido" && (
                          <span className="pl-look-ok">cumprido</span>
                        )}
                        {compromisso.status === "nao_concluido" && (
                          <span className="pl-look-bloqueio">
                            não cumprido · {ROTULO_MOTIVO(compromisso.reason ?? "")}
                          </span>
                        )}
                        {compromisso.status === "planejado" && (
                          <span className="pl-look-mini">sem avaliação</span>
                        )}
                      </td>
                      <td className="pl-look-acoes">
                        <button
                          type="button"
                          className="pl-look-link"
                          title="Marcar como cumprido"
                          onClick={() =>
                            avaliarCompromisso.mutate({
                              projectId: projetoId,
                              commitmentId: compromisso.id,
                              status: "concluido",
                              executedQuantity: compromisso.plannedQuantity,
                            })
                          }
                        >
                          <Check size={12} />
                        </button>
                        <select
                          value={motivo}
                          onChange={evento =>
                            setMotivoPorCompromisso(atual => ({
                              ...atual,
                              [compromisso.id]: evento.target.value as Motivo,
                            }))
                          }
                          aria-label="Motivo de não cumprimento"
                        >
                          {MOTIVOS.map(item => (
                            <option key={item.valor} value={item.valor}>
                              {item.rotulo}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="pl-look-link"
                          title="Marcar como não cumprido"
                          onClick={() =>
                            avaliarCompromisso.mutate({
                              projectId: projetoId,
                              commitmentId: compromisso.id,
                              status: "nao_concluido",
                              reason: motivo,
                            })
                          }
                        >
                          <X size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="pl-look-form">
        <label className="pl-look-largo">
          Atividade travada
          <select
            value={restricaoAtividade}
            onChange={evento => setRestricaoAtividade(evento.target.value)}
          >
            <option value="">Escolha a atividade</option>
            {atividades.map(atividade => (
              <option key={atividade.id} value={atividade.id}>
                {atividade.wbsCode ? `${atividade.wbsCode} — ` : ""}
                {atividade.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tipo
          <select
            value={restricaoTipo}
            onChange={evento => setRestricaoTipo(evento.target.value as TipoRestricao)}
          >
            {TIPOS_RESTRICAO.map(item => (
              <option key={item.valor} value={item.valor}>
                {item.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="pl-look-largo">
          O que falta
          <input
            value={restricaoDescricao}
            onChange={evento => setRestricaoDescricao(evento.target.value)}
            placeholder="Ex.: aço CA-50 do 3º lote não chegou"
            maxLength={400}
          />
        </label>
        <label>
          Quem resolve
          <input
            value={restricaoResponsavel}
            onChange={evento => setRestricaoResponsavel(evento.target.value)}
            maxLength={160}
          />
        </label>
        <label>
          Precisa estar resolvida até
          <input
            type="date"
            value={restricaoPrazo}
            onChange={evento => setRestricaoPrazo(evento.target.value)}
          />
        </label>
        <button
          type="button"
          className="pl-look-botao"
          onClick={registrarRestricao}
          disabled={criarRestricao.isPending}
        >
          <Plus size={14} /> {criarRestricao.isPending ? "Registrando…" : "Registrar restrição"}
        </button>
      </div>

      {mensagem && <p className="pl-look-sub">{mensagem}</p>}

      <div className="pl-look-tabela">
        <table>
          <thead>
            <tr>
              <th>Restrições abertas</th>
              <th>Atividade</th>
              <th>Tipo</th>
              <th>Quem resolve</th>
              <th>Prazo</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {abertas.length === 0 && (
              <tr>
                <td colSpan={6} className="pl-look-vazio">
                  Nenhuma restrição aberta. Tudo que está na janela é executável.
                </td>
              </tr>
            )}
            {abertas.map(restricao => (
              <tr key={restricao.id}>
                <td>{restricao.description}</td>
                <td>
                  {restricao.wbsCode ? `${restricao.wbsCode} — ` : ""}
                  {restricao.activityName ?? `Atividade ${restricao.activityId}`}
                </td>
                <td>{ROTULO_TIPO(restricao.type)}</td>
                <td>{restricao.responsible ?? "—"}</td>
                <td>{restricao.neededBy ? dataCurta(String(restricao.neededBy)) : "—"}</td>
                <td>
                  <button
                    type="button"
                    className="pl-look-link"
                    onClick={() =>
                      removerRestricao.mutate({
                        projectId: projetoId,
                        constraintId: restricao.id,
                      })
                    }
                    disabled={removerRestricao.isPending}
                  >
                    resolver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Kpi({
  titulo,
  valor,
  alerta,
}: {
  titulo: string;
  valor: string;
  alerta?: boolean;
}) {
  return (
    <div className={`pl-look-kpi${alerta ? " pl-look-alerta" : ""}`}>
      <span>{titulo}</span>
      <strong>{valor}</strong>
    </div>
  );
}
