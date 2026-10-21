import { CircleDollarSign, Plus, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";

/**
 * Valor Ganho com custo REAL.
 *
 * O painel existia como rota (`planning.evm`) e nunca era renderizado. Enquanto
 * isso, o AC era deduzido do orçamento (`executado × preço`), o que faz
 * `AC ≡ EV` e o CPI valer 1,000 sempre: não havia como uma obra aparecer
 * estourada. O número era estável porque era falso.
 *
 * Aqui o CPI vem de `cost_entries`. Quando não há custo lançado, os índices
 * aparecem como "—" e o painel diz o que fazer; ele NÃO inventa 1,000.
 *
 * `costCoveragePct` é a parte que evita a armadilha seguinte: com custo lançado
 * em 10% do escopo, EV/AC compara a obra inteira com um décimo do gasto e
 * devolve um CPI lindo que não significa nada. Abaixo de 80% o painel avisa.
 */

const CATEGORIAS = [
  { valor: "material", rotulo: "Material" },
  { valor: "mao_de_obra", rotulo: "Mão de obra" },
  { valor: "equipamento", rotulo: "Equipamento" },
  { valor: "servico", rotulo: "Serviço" },
  { valor: "administrativo", rotulo: "Administrativo" },
  { valor: "outro", rotulo: "Outro" },
] as const;

type Categoria = (typeof CATEGORIAS)[number]["valor"];

const brl = (valor: number | null | undefined): string =>
  valor == null
    ? "—"
    : valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const indice = (valor: number | null | undefined): string =>
  valor == null ? "—" : valor.toFixed(3).replace(".", ",");

const percentual = (valor: number | null | undefined): string =>
  valor == null ? "—" : `${valor.toFixed(1).replace(".", ",")}%`;

const dataBr = (iso: string | Date): string => {
  const data = typeof iso === "string" ? new Date(iso) : iso;
  return Number.isNaN(data.getTime())
    ? "—"
    : data.toLocaleDateString("pt-BR", { timeZone: "UTC" });
};

const hojeIso = (): string => {
  const agora = new Date();
  const local = new Date(agora.getTime() - agora.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const paraValor = (texto: string): number => {
  const limpo = texto.replace(/\./g, "").replace(",", ".").trim();
  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : NaN;
};

export function PainelValorGanho({ projetoId }: { projetoId: number }) {
  const utils = trpc.useUtils();
  const [competencia, setCompetencia] = useState(hojeIso);
  const [valor, setValor] = useState("");
  const [categoria, setCategoria] = useState<Categoria>("material");
  const [atividadeId, setAtividadeId] = useState<string>("");
  const [fornecedor, setFornecedor] = useState("");
  const [documento, setDocumento] = useState("");
  const [mensagem, setMensagem] = useState<string | null>(null);

  const evm = trpc.planning.evm.useQuery({ projectId: projetoId });
  const custos = trpc.planning.custos.useQuery({ projectId: projetoId });
  const planejamento = trpc.planning.list.useQuery({ projectId: projetoId });

  const atividades = useMemo(
    () => planejamento.data?.activities ?? [],
    [planejamento.data]
  );

  const invalidar = async () => {
    await Promise.all([
      utils.planning.evm.invalidate({ projectId: projetoId }),
      utils.planning.custos.invalidate({ projectId: projetoId }),
    ]);
  };

  const registrar = trpc.planning.registrarCusto.useMutation({
    onSuccess: async () => {
      setMensagem("Custo lançado.");
      setValor("");
      setFornecedor("");
      setDocumento("");
      await invalidar();
    },
    onError: erro => setMensagem(erro.message),
  });

  const estornar = trpc.planning.cancelarCusto.useMutation({
    onSuccess: async () => {
      setMensagem("Lançamento estornado.");
      await invalidar();
    },
    onError: erro => setMensagem(erro.message),
  });

  const lancar = () => {
    const quantia = paraValor(valor);
    if (!Number.isFinite(quantia) || quantia <= 0) {
      setMensagem("Informe um valor maior que zero.");
      return;
    }
    if (!competencia) {
      setMensagem("Informe a data de competência (emissão da nota ou medição).");
      return;
    }
    registrar.mutate({
      projectId: projetoId,
      // Meio-dia local: o fuso de Brasília não empurra a data para o dia
      // anterior quando o valor é convertido para UTC.
      competenceDate: new Date(`${competencia}T12:00:00`),
      amount: quantia,
      category: categoria,
      activityId: atividadeId ? Number(atividadeId) : null,
      supplier: fornecedor || null,
      document: documento || null,
      status: "confirmado",
    });
  };

  const dados = evm.data;
  const linhas = custos.data?.itens ?? [];

  return (
    <section className="pl-evm">
      <header className="pl-evm-topo">
        <div>
          <h3>
            <CircleDollarSign size={16} /> Valor Ganho
          </h3>
          <p className="pl-evm-sub">
            Custo real lançado até{" "}
            <strong>{dados?.asOf ? dataBr(dados.asOf) : "—"}</strong>
            {dados?.baselineStatus === "aprovada" && dados.baselineVersionId
              ? ` · baseline: versão ${dados.baselineVersionId}`
              : ""}
          </p>
        </div>
      </header>

      {!dados?.available ? (
        <p className="pl-evm-aviso">
          <TriangleAlert size={14} /> {dados?.note ?? "EVM indisponível."}
        </p>
      ) : (
        <>
          <div className="pl-evm-cartoes">
            <Cartao titulo="PV — planejado" valor={brl(dados.pv)} />
            <Cartao titulo="EV — ganho" valor={brl(dados.ev)} />
            <Cartao
              titulo="AC — custo real"
              valor={brl(dados.ac)}
              vazio={dados.ac === null}
            />
            <Cartao
              titulo="SPI — prazo"
              valor={indice(dados.spi)}
              alerta={dados.spi !== null && dados.spi < 1}
            />
            <Cartao
              titulo="CPI — custo"
              valor={indice(dados.cpi)}
              vazio={dados.cpi === null}
              alerta={dados.cpi !== null && dados.cpi < 1}
            />
            <Cartao titulo="EAC — projeção" valor={brl(dados.eac)} />
            <Cartao
              titulo="VAC — sobra/estouro"
              valor={brl(dados.vac)}
              alerta={dados.vac !== null && dados.vac < 0}
            />
            <Cartao titulo="TCPI — exigido" valor={indice(dados.tcpi)} />
          </div>

          <div className="pl-evm-barras">
            <Barra rotulo="Avanço planejado" valor={dados.plannedPct} />
            <Barra rotulo="Avanço real" valor={dados.actualPct} />
            <Barra
              rotulo="Escopo com custo lançado"
              valor={dados.costCoveragePct}
              alerta={dados.costCoveragePct < 80}
            />
          </div>

          {(dados.acOutOfScope > 0 || dados.acUnallocated > 0) && (
            <p className="pl-evm-sub">
              Fora do CPI: {brl(dados.acOutOfScope)} em itens fora do escopo e{" "}
              {brl(dados.acUnallocated)} sem vínculo (mobilização, canteiro).
            </p>
          )}

          {dados.note && (
            <p className="pl-evm-aviso">
              <TriangleAlert size={14} /> {dados.note}
            </p>
          )}
        </>
      )}

      <div className="pl-evm-form">
        <label>
          Competência
          <input
            type="date"
            value={competencia}
            onChange={evento => setCompetencia(evento.target.value)}
          />
        </label>
        <label>
          Valor (R$)
          <input
            inputMode="decimal"
            placeholder="0,00"
            value={valor}
            onChange={evento => setValor(evento.target.value)}
          />
        </label>
        <label>
          Categoria
          <select
            value={categoria}
            onChange={evento => setCategoria(evento.target.value as Categoria)}
          >
            {CATEGORIAS.map(item => (
              <option key={item.valor} value={item.valor}>
                {item.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="pl-evm-largo">
          Atividade (opcional)
          <select
            value={atividadeId}
            onChange={evento => setAtividadeId(evento.target.value)}
          >
            <option value="">Sem vínculo — custo da obra</option>
            {atividades.map(atividade => (
              <option key={atividade.id} value={atividade.id}>
                {atividade.wbsCode ? `${atividade.wbsCode} — ` : ""}
                {atividade.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Fornecedor
          <input
            value={fornecedor}
            onChange={evento => setFornecedor(evento.target.value)}
            maxLength={160}
          />
        </label>
        <label>
          NF / documento
          <input
            value={documento}
            onChange={evento => setDocumento(evento.target.value)}
            maxLength={64}
          />
        </label>
        <button
          type="button"
          onClick={lancar}
          disabled={registrar.isPending}
          className="pl-evm-botao"
        >
          <Plus size={14} /> {registrar.isPending ? "Lançando…" : "Lançar custo"}
        </button>
      </div>

      {mensagem && <p className="pl-evm-sub">{mensagem}</p>}

      <div className="pl-evm-tabela">
        <table>
          <thead>
            <tr>
              <th>Competência</th>
              <th>Atividade / item</th>
              <th>Categoria</th>
              <th>Fornecedor</th>
              <th>Doc.</th>
              <th className="pl-evm-num">Valor</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr>
                <td colSpan={7} className="pl-evm-vazio">
                  Nenhum custo lançado. Sem custo real não há CPI, EAC nem VAC —
                  o sistema não preenche esses números por conta própria.
                </td>
              </tr>
            )}
            {linhas.map(linha => (
              <tr key={linha.id} className={linha.status === "cancelado" ? "pl-evm-cancelado" : ""}>
                <td>{dataBr(linha.competenceDate)}</td>
                <td>
                  {linha.wbsCode ? `${linha.wbsCode} — ` : ""}
                  {linha.activityName ?? linha.itemDescription ?? "Obra (sem vínculo)"}
                </td>
                <td>
                  {CATEGORIAS.find(item => item.valor === linha.category)?.rotulo ??
                    linha.category}
                </td>
                <td>{linha.supplier ?? "—"}</td>
                <td>{linha.document ?? "—"}</td>
                <td className="pl-evm-num">{brl(Number(linha.amount))}</td>
                <td>
                  {linha.status === "cancelado" ? (
                    <span className="pl-evm-sub">estornado</span>
                  ) : (
                    <button
                      type="button"
                      className="pl-evm-link"
                      onClick={() =>
                        estornar.mutate({
                          projectId: projetoId,
                          costEntryId: linha.id,
                        })
                      }
                      disabled={estornar.isPending}
                    >
                      Estornar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Cartao({
  titulo,
  valor,
  alerta,
  vazio,
}: {
  titulo: string;
  valor: string;
  alerta?: boolean;
  vazio?: boolean;
}) {
  return (
    <div
      className={`pl-evm-cartao${alerta ? " pl-evm-alerta" : ""}${
        vazio ? " pl-evm-vazio-cartao" : ""
      }`}
    >
      <span>{titulo}</span>
      <strong>{valor}</strong>
    </div>
  );
}

function Barra({
  rotulo,
  valor,
  alerta,
}: {
  rotulo: string;
  valor: number;
  alerta?: boolean;
}) {
  const largura = Math.max(0, Math.min(100, valor));
  return (
    <div className="pl-evm-barra">
      <span>
        {rotulo} <strong>{percentual(valor)}</strong>
      </span>
      <div className="pl-evm-trilho">
        <div
          className={`pl-evm-preenchido${alerta ? " pl-evm-alerta" : ""}`}
          style={{ width: `${largura}%` }}
        />
      </div>
    </div>
  );
}
