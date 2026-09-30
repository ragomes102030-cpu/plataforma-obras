import { useMemo, type ReactNode } from "react";
import {
  Activity,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  CircleAlert,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { AdminLlmSettings } from "@/components/AdminLlmSettings";

const tone: Record<string, { background: string; color: string; border: string }> = {
  online: { background: "#edf7f1", color: "#4d7966", border: "#d4e8dd" },
  degraded: { background: "#fff7e9", color: "#8b6b3f", border: "#eadfc6" },
  offline: { background: "#fff0ef", color: "#96605d", border: "#edd7d4" },
};

export function CentralComandoArquimedes() {
  const snapshot = trpc.admin.capabilities.snapshot.useQuery(undefined, {
    staleTime: 60_000,
    retry: false,
  });

  const installedSkills = useMemo(
    () => snapshot.data?.skills.filter(skill => skill.status === "installed") ?? [],
    [snapshot.data]
  );
  const availableSkills = useMemo(
    () => snapshot.data?.skills.filter(skill => skill.status === "available") ?? [],
    [snapshot.data]
  );
  const activeAbilities = useMemo(
    () => snapshot.data?.abilities.filter(ability => ability.status === "active") ?? [],
    [snapshot.data]
  );
  const plannedAbilities = useMemo(
    () => snapshot.data?.abilities.filter(ability => ability.status === "propose") ?? [],
    [snapshot.data]
  );

  return (
    <section className="module-page">
      <div className="module-hero">
        <div>
          <p className="eyebrow accent">ARQUIMEDES · CENTRAL DE COMANDO</p>
          <h2>Capacidades do Arquimedes</h2>
          <p>
            Um lugar único para acompanhar modelos, MCPs, Skills, habilidades e
            permissões. O agente só usa aquilo que estiver disponível e
            homologado pelo sistema.
          </p>
        </div>
        <div className="module-icon"><BrainCircuit size={22} /></div>
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        <AdminLlmSettings />

        <section className="panel" style={{ padding: 0 }}>
          <div className="panel-heading" style={{ alignItems: "center" }}>
            <div>
              <h3 style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <PlugZap size={16} /> MCPs instalados
              </h3>
              <p>Conexões operacionais que dão ao Arquimedes acesso aos motores da obra.</p>
            </div>
            <button
              type="button"
              className="ghost-button"
              onClick={() => void snapshot.refetch()}
              disabled={snapshot.isFetching}
              title="Atualizar status dos MCPs"
            >
              <RefreshCw size={13} className={snapshot.isFetching ? "spin" : undefined} />
              Atualizar
            </button>
          </div>

          {snapshot.isError ? (
            <div style={{ padding: "18px 20px", color: "#96605d", fontSize: 11 }}>
              Não foi possível consultar o catálogo de capacidades agora.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 10, padding: "12px 18px 18px" }}>
              {(snapshot.data?.mcpDomains ?? []).map(mcp => {
                const state = tone[mcp.status] ?? tone.offline;
                return (
                  <article key={mcp.id} style={{ border: "1px solid #e0e8ea", borderRadius: 10, padding: 13, background: "var(--card)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <strong style={{ color: "#4a626c", fontSize: 12 }}>{mcp.name}</strong>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 7px", borderRadius: 999, background: state.background, color: state.color, border: `1px solid ${state.border}`, fontSize: 9, fontWeight: 700 }}>
                        <span style={{ width: 6, height: 6, borderRadius: 50, background: "currentColor" }} />
                        {mcp.status}
                      </span>
                    </div>
                    <p style={{ margin: "8px 0 0", color: "#8a9aa0", fontSize: 10 }}>
                      {mcp.toolCount} ferramenta{mcp.toolCount === 1 ? "" : "s"} publicada{mcp.toolCount === 1 ? "" : "s"} · {mcp.latencyMs} ms
                    </p>
                    {mcp.lastError && (
                      <p style={{ margin: "7px 0 0", color: "#96605d", fontSize: 9 }}>{mcp.lastError}</p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <CapabilitySection
          icon={<BookOpen size={16} />}
          title="Skills instaladas"
          subtitle="Conhecimento profissional versionado que orienta o trabalho do agente."
        >
          {installedSkills.map(skill => (
            <CapabilityRow
              key={skill.id}
              title={skill.name}
              meta={`v${skill.version} · ${skill.domain}`}
              description={skill.description}
              state="instalada"
            />
          ))}
          {availableSkills.map(skill => (
            <CapabilityRow
              key={skill.id}
              title={skill.name}
              meta={`v${skill.version} · ${skill.domain}`}
              description={skill.description}
              state="disponível"
            />
          ))}
        </CapabilitySection>

        <CapabilitySection
          icon={<Wrench size={16} />}
          title="Habilidades"
          subtitle="Capacidades compostas que combinam Skills, MCPs e regras de execução."
        >
          {activeAbilities.map(ability => (
            <CapabilityRow
              key={ability.id}
              title={ability.name}
              meta={`Skills: ${ability.skills.join(", ")} · MCPs: ${ability.mcps.join(", ")}`}
              description={ability.description}
              state="ativa"
            />
          ))}
          {plannedAbilities.map(ability => (
            <CapabilityRow
              key={ability.id}
              title={ability.name}
              meta={`Skills: ${ability.skills.join(", ")} · MCPs: ${ability.mcps.join(", ")}`}
              description={ability.description}
              state="em evolução"
            />
          ))}
        </CapabilitySection>

        <CapabilitySection
          icon={<ShieldCheck size={16} />}
          title="Permissões"
          subtitle="Ações e níveis de autonomia que o runtime reconhece hoje."
        >
          {(snapshot.data?.permissions ?? []).map(permission => (
            <CapabilityRow
              key={permission.name}
              title={permission.name}
              meta={permission.level}
              description={permission.description}
              state={permission.level.includes("confirma") ? "aprovação" : "ativa"}
            />
          ))}
        </CapabilitySection>

        <section className="panel" style={{ padding: "16px 18px" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <Activity size={18} color="#638492" />
            <div style={{ minWidth: 0 }}>
              <p className="eyebrow" style={{ marginBottom: 4 }}>PRÓXIMA FASE</p>
              <strong style={{ color: "#46616b", fontSize: 13 }}>Capacidades configuráveis pelo chat</strong>
              <p style={{ margin: "6px 0 0", color: "#8c9ba1", fontSize: 10, lineHeight: 1.6 }}>
                Esta central já consolida o que está instalado e homologado. A
                próxima evolução é permitir que o usuário peça pelo próprio chat
                para ativar, desativar ou instalar capacidades compatíveis.
              </p>
              <button
                type="button"
                className="primary-button"
                style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6 }}
                onClick={() => window.dispatchEvent(new CustomEvent("abrir-arquimedes"))}
              >
                <Sparkles size={13} /> Abrir Arquimedes
              </button>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}

function CapabilitySection({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="panel" style={{ padding: 0 }}>
      <div className="panel-heading">
        <div>
          <h3 style={{ display: "flex", alignItems: "center", gap: 7 }}>{icon} {title}</h3>
          <p>{subtitle}</p>
        </div>
      </div>
      <div style={{ display: "grid", gap: 8, padding: "12px 18px 18px" }}>
        {children}
      </div>
    </section>
  );
}

function CapabilityRow({
  title,
  meta,
  description,
  state,
}: {
  title: string;
  meta: string;
  description: string;
  state: string;
}) {
  const approval = state === "aprovação";
  return (
    <article style={{ display: "grid", gridTemplateColumns: "20px minmax(0, 1fr) auto", gap: 10, alignItems: "start", padding: "10px 11px", border: "1px solid #e2e9eb", borderRadius: 9, background: "var(--card)" }}>
      <span style={{ paddingTop: 1, color: approval ? "#9a7a4f" : "#638492" }}>
        {approval ? <CircleAlert size={15} /> : <CheckCircle2 size={15} />}
      </span>
      <div style={{ minWidth: 0 }}>
        <strong style={{ display: "block", color: "#506873", fontSize: 11 }}>{title}</strong>
        <span style={{ display: "block", marginTop: 3, color: "#93a1a7", fontSize: 9 }}>{meta}</span>
        <p style={{ margin: "5px 0 0", color: "#7f9097", fontSize: 10, lineHeight: 1.45 }}>{description}</p>
      </div>
      <span style={{ padding: "4px 7px", borderRadius: 999, background: approval ? "#fbf4e8" : "#eef5f7", color: approval ? "#8a6a40" : "#5c7d89", fontSize: 8, fontWeight: 700, whiteSpace: "nowrap" }}>
        {state}
      </span>
    </article>
  );
}
