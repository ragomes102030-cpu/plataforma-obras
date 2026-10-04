import { useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowDownToLine,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Cpu,
  History,
  LayoutDashboard,
  LockKeyhole,
  MoreHorizontal,
  PackageCheck,
  Power,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Unplug,
  Wrench,
  XCircle,
  Zap,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { AdminLlmSettings as AdminLlmSettingsPanel } from "@/components/AdminLlmSettings";

type TabId = "overview" | "capabilities" | "mcps" | "security" | "audit" | "models";

const tabs: Array<{ id: TabId; label: string; icon: ReactNode }> = [
  { id: "overview", label: "Visão geral", icon: <LayoutDashboard size={15} /> },
  { id: "capabilities", label: "Capacidades", icon: <PackageCheck size={15} /> },
  { id: "mcps", label: "MCPs", icon: <Unplug size={15} /> },
  { id: "security", label: "Permissões", icon: <ShieldCheck size={15} /> },
  { id: "audit", label: "Auditoria", icon: <History size={15} /> },
  { id: "models", label: "Modelos e LLMs", icon: <Cpu size={15} /> },
];

const mcpStatusTone: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  online: { bg: "#ecfdf3", text: "#147a53", border: "#ccebdc" },
  degraded: { bg: "#fffaeb", text: "#a15c00", border: "#f1dfb0" },
  offline: { bg: "#fff2f0", text: "#b42318", border: "#f1d0cb" },
};

const capabilityTone: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  installed: { bg: "#eef8f5", text: "#16705a", border: "#d2e9e1" },
  available: { bg: "#f5f7f8", text: "#62747c", border: "#dfe7ea" },
  disabled: { bg: "#fff8eb", text: "#9b6a1d", border: "#efdfb9" },
};

export function CentralComandoArquimedes() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "skill" | "ability">("all");
  const [feedback, setFeedback] = useState<string | null>(null);

  const snapshot = trpc.admin.capabilities.snapshot.useQuery(undefined, {
    staleTime: 30_000,
    retry: false,
  });

  const invalidate = () => {
    setFeedback(null);
    void snapshot.refetch();
  };

  const install = trpc.admin.capabilities.install.useMutation({
    onSuccess: data => {
      setFeedback("Instalada e ativada: " + data.name);
      invalidate();
    },
    onError: error => setFeedback(error.message),
  });

  const setEnabled = trpc.admin.capabilities.setEnabled.useMutation({
    onSuccess: data => {
      setFeedback(
        data.enabled ? "Capacidade ativada: " + data.name : "Capacidade desativada: " + data.name
      );
      invalidate();
    },
    onError: error => setFeedback(error.message),
  });

  const uninstall = trpc.admin.capabilities.uninstall.useMutation({
    onSuccess: data => {
      setFeedback("Capacidade removida: " + data.name);
      invalidate();
    },
    onError: error => setFeedback(error.message),
  });

  const capabilities = snapshot.data?.capabilities ?? [];
  const filteredCapabilities = useMemo(() => {
    const query = search.trim().toLowerCase();
    return capabilities.filter(capability => {
      const kindOk = kindFilter === "all" || capability.kind === kindFilter;
      if (!kindOk) return false;
      if (!query) return true;
      return [
        capability.name,
        capability.id,
        capability.domain,
        capability.description,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [capabilities, kindFilter, search]);

  const enabledCapabilities = capabilities.filter(capability => capability.enabled);
  const installedSkills = capabilities.filter(
    capability => capability.kind === "skill" && capability.status === "installed"
  );
  const installedAbilities = capabilities.filter(
    capability => capability.kind === "ability" && capability.status === "installed"
  );

  const executingMutation =
    install.isPending || setEnabled.isPending || uninstall.isPending;

  return (
    <section style={page}>
      <header style={hero}>
        <div style={{ minWidth: 0 }}>
          <div style={eyebrow}>
            <Sparkles size={13} /> ARQUIMEDES · CENTRAL DE COMANDO
          </div>
          <h1 style={title}>Painel operacional do agente</h1>
          <p style={subtitle}>
            Um único lugar para administrar capacidades, MCPs, permissões,
            modelos e histórico do Arquimedes. O chat usa exatamente o mesmo
            catálogo e as mesmas regras de execução.
          </p>
        </div>

        <div style={heroActions}>
          <StatusBadge
            label={
              snapshot.isPending
                ? "Sincronizando"
                : snapshot.data?.overallMcpStatus === "online"
                  ? "Operacional"
                  : snapshot.data?.overallMcpStatus === "degraded"
                    ? "Parcial"
                    : "Atenção"
            }
            tone={
              snapshot.isPending
                ? "neutral"
                : snapshot.data?.overallMcpStatus === "online"
                  ? "success"
                  : snapshot.data?.overallMcpStatus === "degraded"
                    ? "warning"
                    : "danger"
            }
          />
          <button
            type="button"
            style={secondaryButton}
            onClick={() => void snapshot.refetch()}
            disabled={snapshot.isFetching}
          >
            <RefreshCw size={13} className={snapshot.isFetching ? "spin" : undefined} />
            Atualizar
          </button>
          <button
            type="button"
            style={primaryButton}
            onClick={() => window.dispatchEvent(new CustomEvent("abrir-arquimedes"))}
          >
            <Sparkles size={13} /> Abrir Arquimedes
          </button>
        </div>
      </header>

      {feedback && (
        <div
          role="status"
          style={{
            ...notice,
            borderColor: feedback.toLowerCase().includes("não") || feedback.toLowerCase().includes("erro")
              ? "#f1d0cb"
              : "#cfe7dc",
            background: feedback.toLowerCase().includes("não") || feedback.toLowerCase().includes("erro")
              ? "#fff7f5"
              : "#f2faf6",
            color: feedback.toLowerCase().includes("não") || feedback.toLowerCase().includes("erro")
              ? "#a42a20"
              : "#256b57",
          }}
        >
          <CheckCircle2 size={15} />
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} style={dismissButton}>
            <XCircle size={14} />
          </button>
        </div>
      )}

      <div style={layout}>
        <nav style={sidebar}>
          <div style={sidebarTitle}>CENTRAL</div>
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                ...navButton,
                background: activeTab === tab.id ? "#eef5f7" : "transparent",
                color: activeTab === tab.id ? "#245768" : "#71848b",
                borderColor: activeTab === tab.id ? "#d7e6ea" : "transparent",
              }}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.id === "capabilities" && snapshot.data?.summary ? (
                <span style={navCounter}>{snapshot.data.summary.installed}</span>
              ) : null}
              {tab.id === "mcps" && snapshot.data?.mcpDomains ? (
                <span style={navCounter}>{snapshot.data.mcpDomains.length}</span>
              ) : null}
            </button>
          ))}

          <div style={sidebarDivider} />

          <div style={sidebarCard}>
            <div style={sidebarCardIcon}>
              <Zap size={15} />
            </div>
            <strong>Operação por chat</strong>
            <p>
              Administradores também podem pedir ao Arquimedes para listar,
              instalar, ativar ou desativar capacidades.
            </p>
          </div>
        </nav>

        <main style={content}>
          {activeTab === "overview" && (
            <OverviewTab
              snapshot={snapshot.data}
              enabledCapabilities={enabledCapabilities}
              installedSkills={installedSkills}
              installedAbilities={installedAbilities}
              onTab={setActiveTab}
            />
          )}

          {activeTab === "capabilities" && (
            <CapabilitiesTab
              capabilities={filteredCapabilities}
              allCapabilities={capabilities}
              search={search}
              kindFilter={kindFilter}
              onSearch={setSearch}
              onKindFilter={setKindFilter}
              busy={executingMutation}
              onInstall={id => install.mutate({ capabilityId: id })}
              onToggle={(id, enabled) =>
                setEnabled.mutate({ capabilityId: id, enabled })
              }
              onUninstall={id => {
                if (
                  window.confirm(
                    "Remover esta capacidade do catálogo ativo do Arquimedes?"
                  )
                ) {
                  uninstall.mutate({ capabilityId: id });
                }
              }}
            />
          )}

          {activeTab === "mcps" && (
            <McpTab
              domains={snapshot.data?.mcpDomains ?? []}
              overallStatus={snapshot.data?.overallMcpStatus ?? "offline"}
              isRefreshing={snapshot.isFetching}
              onRefresh={() => void snapshot.refetch()}
            />
          )}

          {activeTab === "security" && (
            <SecurityTab
              permissions={snapshot.data?.permissions ?? []}
              policy={snapshot.data?.policy ?? undefined}
            />
          )}

          {activeTab === "audit" && (
            <AuditTab events={snapshot.data?.events ?? []} />
          )}

          {activeTab === "models" && <ModelsTab />}
        </main>
      </div>
    </section>
  );
}

function OverviewTab({
  snapshot,
  enabledCapabilities,
  installedSkills,
  installedAbilities,
  onTab,
}: {
  snapshot: any;
  enabledCapabilities: any[];
  installedSkills: any[];
  installedAbilities: any[];
  onTab: (tab: TabId) => void;
}) {
  const summary = snapshot?.summary;
  const mcpDomains = snapshot?.mcpDomains ?? [];
  const onlineMcps = mcpDomains.filter((item: any) => item.status === "online").length;

  return (
    <div style={stack}>
      <SectionHeader
        title="Visão geral"
        description="Estado atual do Arquimedes e dos recursos que ele pode utilizar."
      />

      <div style={metricGrid}>
        <MetricCard
          icon={<Bot size={17} />}
          label="Capacidades ativas"
          value={summary?.enabled ?? 0}
          detail={(summary?.installed ?? 0) + " instaladas"}
        />
        <MetricCard
          icon={<Wrench size={17} />}
          label="Skills ativas"
          value={installedSkills.filter(item => item.enabled).length}
          detail={installedSkills.length + " instaladas"}
        />
        <MetricCard
          icon={<Zap size={17} />}
          label="Habilidades ativas"
          value={installedAbilities.filter(item => item.enabled).length}
          detail={installedAbilities.length + " instaladas"}
        />
        <MetricCard
          icon={<Activity size={17} />}
          label="MCPs online"
          value={onlineMcps + "/" + mcpDomains.length}
          detail={snapshot?.overallMcpStatus === "online" ? "Todos respondendo" : "Verificar conexões"}
        />
      </div>

      <div style={splitGrid}>
        <Panel title="Arquimedes em operação" icon={<Bot size={16} />}>
          <div style={operationList}>
            <OperationRow
              label="Consulta e validação"
              state="Ativa"
              detail="Leitura de EAP, cronograma, CPM e Linha de Balanço."
            />
            <OperationRow
              label="Propostas de planejamento"
              state="Ativa"
              detail="Calcula e organiza propostas sem alterar o plano por efeito colateral."
            />
            <OperationRow
              label="Correção controlada"
              state="Governada"
              detail="Somente em ações explicitamente permitidas pela política."
            />
            <OperationRow
              label="Administração de capacidades"
              state="Admin"
              detail="Disponível no Central e pelo chat para administradores."
            />
          </div>
        </Panel>

        <Panel title="MCPs da obra" icon={<Unplug size={16} />} action="Ver MCPs" onAction={() => onTab("mcps")}>
          <div style={mcpMiniGrid}>
            {mcpDomains.map((mcp: any) => (
              <div key={mcp.id} style={miniCard}>
                <div style={miniCardHead}>
                  <strong>{mcp.name}</strong>
                  <StatusDot status={mcp.status} />
                </div>
                <span style={mutedText}>
                  {mcp.toolCount} ferramentas · {mcp.latencyMs} ms
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel
        title="Capacidades disponíveis"
        icon={<PackageCheck size={16} />}
        action="Gerenciar catálogo"
        onAction={() => onTab("capabilities")}
      >
        <div style={capabilityPreview}>
          {(snapshot?.capabilities ?? []).slice(0, 6).map((capability: any) => (
            <CapabilityPreview key={capability.id} capability={capability} />
          ))}
        </div>
      </Panel>
    </div>
  );
}

function CapabilitiesTab({
  capabilities,
  allCapabilities,
  search,
  kindFilter,
  onSearch,
  onKindFilter,
  busy,
  onInstall,
  onToggle,
  onUninstall,
}: {
  capabilities: any[];
  allCapabilities: any[];
  search: string;
  kindFilter: "all" | "skill" | "ability";
  onSearch: (value: string) => void;
  onKindFilter: (value: "all" | "skill" | "ability") => void;
  busy: boolean;
  onInstall: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onUninstall: (id: string) => void;
}) {
  const installed = allCapabilities.filter(item => item.status === "installed").length;
  const available = allCapabilities.filter(item => item.status === "available").length;

  return (
    <div style={stack}>
      <SectionHeader
        title="Catálogo de capacidades"
        description="Instale uma capacidade uma vez; o estado fica persistido e é respeitado pelo runtime do Arquimedes."
      />

      <div style={toolbar}>
        <div style={searchBox}>
          <Search size={14} />
          <input
            value={search}
            onChange={event => onSearch(event.target.value)}
            placeholder="Buscar por nome, domínio ou ID"
            style={searchInput}
          />
        </div>
        <div style={segmented}>
          {[
            ["all", "Todas"],
            ["skill", "Skills"],
            ["ability", "Habilidades"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onKindFilter(value as "all" | "skill" | "ability")}
              style={{
                ...segmentButton,
                ...(kindFilter === value ? segmentButtonActive : {}),
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={toolbarStats}>
          <span>{installed} instaladas</span>
          <span>{available} disponíveis</span>
        </div>
      </div>

      <div style={capabilityList}>
        {capabilities.map(capability => (
          <CapabilityCard
            key={capability.id}
            capability={capability}
            allCapabilities={allCapabilities}
            busy={busy}
            onInstall={onInstall}
            onToggle={onToggle}
            onUninstall={onUninstall}
          />
        ))}
        {capabilities.length === 0 && (
          <div style={emptyState}>
            <Search size={19} />
            <strong>Nenhuma capacidade encontrada</strong>
            <span>Altere o filtro ou a busca.</span>
          </div>
        )}
      </div>
    </div>
  );
}

function CapabilityCard({
  capability,
  allCapabilities,
  busy,
  onInstall,
  onToggle,
  onUninstall,
}: {
  capability: any;
  allCapabilities: any[];
  busy: boolean;
  onInstall: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onUninstall: (id: string) => void;
}) {
  const installed = capability.status === "installed";
  const state = !installed
    ? capabilityTone.available
    : capability.enabled
      ? capabilityTone.installed
      : capabilityTone.disabled;

  const dependencyNames = capability.dependencies
    .map((id: string) => allCapabilities.find((item: any) => item.id === id)?.name ?? id);

  return (
    <article style={capabilityCard}>
      <div style={capabilityMain}>
        <div style={capabilityIcon(capability.kind)}>
          {capability.kind === "skill" ? <Wrench size={17} /> : <Bot size={17} />}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={capabilityTitleRow}>
            <strong style={capabilityTitle}>{capability.name}</strong>
            <span style={kindBadge}>{capability.kind === "skill" ? "SKILL" : "HABILIDADE"}</span>
            <span style={{ ...statusBadge, background: state.bg, color: state.text, borderColor: state.border }}>
              {installed ? (capability.enabled ? "ATIVA" : "DESATIVADA") : "DISPONÍVEL"}
            </span>
          </div>

          <div style={capabilityMeta}>
            v{capability.version} · {capability.domain} · {capability.id}
          </div>

          <p style={capabilityDescription}>{capability.description}</p>

          {dependencyNames.length > 0 && (
            <div style={dependencyLine}>
              <span>Dependências:</span>
              {dependencyNames.map((name: string) => (
                <span key={name} style={dependencyBadge}>{name}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={capabilityActions}>
        {!installed ? (
          <button
            type="button"
            style={secondaryAction}
            onClick={() => onInstall(capability.id)}
            disabled={busy}
          >
            <ArrowDownToLine size={13} /> Instalar
          </button>
        ) : capability.enabled ? (
          <button
            type="button"
            style={secondaryAction}
            onClick={() => onToggle(capability.id, false)}
            disabled={busy || !capability.removable}
            title={!capability.removable ? "Capacidade núcleo: desativação bloqueada." : undefined}
          >
            <Power size={13} /> Desativar
          </button>
        ) : (
          <button
            type="button"
            style={primaryAction}
            onClick={() => onToggle(capability.id, true)}
            disabled={busy}
          >
            <Power size={13} /> Ativar
          </button>
        )}

        {installed && capability.removable && (
          <button
            type="button"
            style={iconAction}
            onClick={() => onUninstall(capability.id)}
            disabled={busy}
            title="Remover capacidade"
          >
            <MoreHorizontal size={15} />
          </button>
        )}
      </div>
    </article>
  );
}

function McpTab({
  domains,
  overallStatus,
  isRefreshing,
  onRefresh,
}: {
  domains: any[];
  overallStatus: string;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <div style={stack}>
      <SectionHeader
        title="MCPs conectados"
        description="Conexões operacionais que fornecem ferramentas especializadas ao Arquimedes."
        action={
          <button type="button" style={secondaryButton} onClick={onRefresh} disabled={isRefreshing}>
            <RefreshCw size={13} className={isRefreshing ? "spin" : undefined} /> Atualizar status
          </button>
        }
      />

      <div style={mcpBanner}>
        <div style={mcpBannerIcon}><Unplug size={18} /></div>
        <div>
          <strong>Saúde geral: {overallStatus === "online" ? "todos online" : overallStatus === "degraded" ? "operação parcial" : "há indisponibilidade"}</strong>
          <p>O runtime só disponibiliza ferramentas que o catálogo do MCP publica e a política permite.</p>
        </div>
      </div>

      <div style={mcpList}>
        {domains.map((mcp: any) => {
          const tone = mcpStatusTone[mcp.status] ?? mcpStatusTone.offline;
          return (
            <article key={mcp.id} style={mcpCard}>
              <div style={mcpCardTop}>
                <div>
                  <div style={eyebrowSmall}>{mcp.id}</div>
                  <h3 style={mcpName}>{mcp.name}</h3>
                </div>
                <span style={{ ...statusBadge, background: tone.bg, color: tone.text, borderColor: tone.border }}>
                  <StatusDot status={mcp.status} /> {mcp.status.toUpperCase()}
                </span>
              </div>

              <div style={mcpMetrics}>
                <MetricTiny icon={<Wrench size={13} />} label="Ferramentas" value={mcp.toolCount} />
                <MetricTiny icon={<Clock3 size={13} />} label="Latência" value={mcp.latencyMs + " ms"} />
                <MetricTiny icon={<Activity size={13} />} label="Tentativas" value={mcp.attempts ?? "—"} />
              </div>

              {mcp.lastError && (
                <div style={errorBox}>
                  <CircleAlert size={14} />
                  <span>{mcp.lastError}</span>
                </div>
              )}

              <div style={toolCloud}>
                {(mcp.tools ?? []).map((tool: string) => (
                  <span key={tool} style={toolBadge}>{tool}</span>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function SecurityTab({
  permissions,
  policy,
}: {
  permissions: readonly any[];
  policy?: { readOnlyTools: number; confirmationTools: number; destructiveTools: number };
}) {
  return (
    <div style={stack}>
      <SectionHeader
        title="Permissões e governança"
        description="As regras que limitam o que Arquimedes pode consultar, propor, executar ou destruir."
      />

      <div style={policyGrid}>
        <MetricCard icon={<Search size={17} />} label="Leitura" value={policy?.readOnlyTools ?? 0} detail="ferramentas somente leitura" />
        <MetricCard icon={<LockKeyhole size={17} />} label="Confirmação" value={policy?.confirmationTools ?? 0} detail="operações de alto impacto" />
        <MetricCard icon={<CircleAlert size={17} />} label="Destrutivas" value={policy?.destructiveTools ?? 0} detail="bloqueadas sem confirmação" />
      </div>

      <Panel title="Matriz de autonomia" icon={<ShieldCheck size={16} />}>
        <div style={permissionList}>
          {permissions.map((permission: any) => (
            <div key={permission.name} style={permissionRow}>
              <div style={permissionIcon(permission.level)}>
                {permission.level.includes("confirma") ? <LockKeyhole size={14} /> : <CheckCircle2 size={14} />}
              </div>
              <div style={{ minWidth: 0 }}>
                <strong>{permission.name}</strong>
                <p>{permission.description}</p>
              </div>
              <span style={permissionLevel}>{permission.level}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Princípio operacional" icon={<Settings2 size={16} />}>
        <div style={principleGrid}>
          <Principle title="Observar" text="consultar dados e evidências antes de agir." />
          <Principle title="Planejar" text="propor a intervenção e explicitar dependências." />
          <Principle title="Agir" text="executar somente o que a política liberar." />
          <Principle title="Verificar" text="reler, validar e registrar o resultado após uma mudança." />
        </div>
      </Panel>
    </div>
  );
}

function AuditTab({ events }: { events: any[] }) {
  return (
    <div style={stack}>
      <SectionHeader
        title="Auditoria"
        description="Histórico das instalações, ativações e desativações das capacidades do Arquimedes."
      />

      <div style={timeline}>
        {events.length === 0 ? (
          <div style={emptyState}>
            <History size={19} />
            <strong>Ainda não há eventos</strong>
            <span>As próximas alterações aparecerão aqui.</span>
          </div>
        ) : (
          events.map((event, index) => (
            <div key={event.id} style={timelineRow}>
              <div style={timelineRail}>
                <span style={timelineDot(index === 0)} />
                {index !== events.length - 1 && <span style={timelineLine} />}
              </div>
              <div style={timelineContent}>
                <div style={timelineTop}>
                  <strong>{event.capabilityName ?? event.capabilityId}</strong>
                  <span>{formatDate(event.createdAt)}</span>
                </div>
                <div style={timelineAction}>{formatAction(event.action)}</div>
                {event.detail && <p>{event.detail}</p>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ModelsTab() {
  return (
    <div style={stack}>
      <SectionHeader
        title="Modelos e LLMs"
        description="Providers, modelos, chaves e prioridade de roteamento usados pelo Arquimedes."
      />
      <AdminLlmSettingsPanel />
    </div>
  );
}

function SectionHeader({
  title: titleText,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div style={sectionHeader}>
      <div style={{ minWidth: 0 }}>
        <h2>{titleText}</h2>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

function Panel({
  title: panelTitle,
  icon,
  action,
  onAction,
  children,
}: {
  title: string;
  icon: ReactNode;
  action?: string;
  onAction?: () => void;
  children: ReactNode;
}) {
  return (
    <section style={panel}>
      <div style={panelHeader}>
        <div style={panelTitleWrap}>
          <span style={panelIcon}>{icon}</span>
          <div>
            <h3>{panelTitle}</h3>
          </div>
        </div>
        {action && (
          <button type="button" style={linkButton} onClick={onAction}>
            {action} <ChevronRight size={13} />
          </button>
        )}
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </section>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  detail: string;
}) {
  return (
    <article style={metricCard}>
      <div style={metricIcon}>{icon}</div>
      <div style={metricLabel}>{label}</div>
      <div style={metricValue}>{value}</div>
      <div style={metricDetail}>{detail}</div>
    </article>
  );
}

function MetricTiny({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <div style={metricTiny}>
      <span>{icon}</span>
      <div>
        <div style={metricTinyLabel}>{label}</div>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function OperationRow({
  label,
  state,
  detail,
}: {
  label: string;
  state: string;
  detail: string;
}) {
  return (
    <div style={operationRow}>
      <div style={operationMarker}><CheckCircle2 size={14} /></div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={operationLabelRow}>
          <strong>{label}</strong>
          <span>{state}</span>
        </div>
        <p>{detail}</p>
      </div>
    </div>
  );
}

function CapabilityPreview({ capability }: { capability: any }) {
  const active = capability.status === "installed" && capability.enabled;
  return (
    <div style={previewCard}>
      <div style={capabilityIcon(capability.kind)}>
        {capability.kind === "skill" ? <Wrench size={15} /> : <Bot size={15} />}
      </div>
      <div style={{ minWidth: 0 }}>
        <strong>{capability.name}</strong>
        <span>{active ? "ativa" : capability.status === "installed" ? "desativada" : "disponível"}</span>
      </div>
    </div>
  );
}

function Principle({ title: principleTitle, text }: { title: string; text: string }) {
  return (
    <div style={principle}>
      <div style={principleNumber}>{principleTitle.slice(0, 1)}</div>
      <div>
        <strong>{principleTitle}</strong>
        <p>{text}</p>
      </div>
    </div>
  );
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "success" | "warning" | "danger" | "neutral";
}) {
  const styles = {
    success: { background: "#ecfdf3", color: "#147a53", borderColor: "#ccebdc" },
    warning: { background: "#fffaeb", color: "#a15c00", borderColor: "#f1dfb0" },
    danger: { background: "#fff2f0", color: "#b42318", borderColor: "#f1d0cb" },
    neutral: { background: "#f5f7f8", color: "#687b83", borderColor: "#dfe7ea" },
  }[tone];
  return <span style={{ ...statusBadge, ...styles }}><StatusDot status={tone} /> {label}</span>;
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: 99,
        display: "inline-block",
        background:
          status === "online" || status === "success"
            ? "#1f9d70"
            : status === "degraded" || status === "warning"
              ? "#d28a12"
              : status === "offline" || status === "danger"
                ? "#c94d43"
                : "#81939a",
      }}
    />
  );
}

function formatAction(action: string) {
  switch (action) {
    case "installed":
      return "Instalação";
    case "re-enabled":
      return "Reativação";
    case "enabled":
      return "Ativação";
    case "disabled":
      return "Desativação";
    case "uninstalled":
      return "Remoção";
    default:
      return action;
  }
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

const page = {
  minHeight: "100%",
  background: "#f4f7f8",
  padding: "20px",
  boxSizing: "border-box" as const,
};

const hero = {
  display: "flex",
  justifyContent: "space-between",
  gap: 20,
  alignItems: "flex-start",
  padding: "22px 24px",
  border: "1px solid #dfe8eb",
  borderRadius: 16,
  background: "linear-gradient(135deg, #ffffff 0%, #f4fafb 100%)",
  boxShadow: "0 10px 30px rgba(47, 74, 84, 0.05)",
};

const eyebrow = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  color: "#537785",
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.11em",
};

const title = {
  margin: "8px 0 5px",
  color: "#294955",
  fontSize: 25,
  lineHeight: 1.08,
  letterSpacing: "-0.02em",
};

const subtitle = {
  margin: 0,
  maxWidth: 760,
  color: "#74878e",
  fontSize: 12,
  lineHeight: 1.65,
};

const heroActions = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap" as const,
  justifyContent: "flex-end",
};

const layout = {
  display: "grid",
  gridTemplateColumns: "205px minmax(0, 1fr)",
  gap: 14,
  marginTop: 14,
  alignItems: "start",
};

const sidebar = {
  position: "sticky" as const,
  top: 14,
  padding: 10,
  border: "1px solid #dfe8eb",
  borderRadius: 14,
  background: "#ffffff",
  boxShadow: "0 8px 20px rgba(47, 74, 84, 0.04)",
};

const sidebarTitle = {
  padding: "7px 9px 8px",
  color: "#9aabb1",
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: "0.12em",
};

const navButton = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 8,
  border: "1px solid transparent",
  borderRadius: 9,
  padding: "9px 10px",
  marginBottom: 3,
  fontSize: 11,
  fontWeight: 650,
  cursor: "pointer",
  textAlign: "left" as const,
};

const navCounter = {
  marginLeft: "auto",
  minWidth: 22,
  padding: "2px 6px",
  borderRadius: 999,
  background: "#f1f6f7",
  color: "#77909a",
  fontSize: 8,
  textAlign: "center" as const,
};

const sidebarDivider = {
  height: 1,
  background: "#eef2f3",
  margin: "10px 5px",
};

const sidebarCard = {
  padding: 11,
  borderRadius: 10,
  background: "#f7fafb",
  border: "1px solid #e6eef0",
};

const sidebarCardIcon = {
  width: 28,
  height: 28,
  display: "grid",
  placeItems: "center",
  borderRadius: 8,
  background: "#e9f3f5",
  color: "#4f7988",
  marginBottom: 8,
};

const content = { minWidth: 0 };

const stack = { display: "grid", gap: 14 };

const sectionHeader = {
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
  alignItems: "flex-start",
};

const panel = {
  border: "1px solid #dfe8eb",
  borderRadius: 14,
  background: "#ffffff",
  boxShadow: "0 8px 24px rgba(47, 74, 84, 0.035)",
  overflow: "hidden",
};

const panelHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "13px 18px",
  borderBottom: "1px solid #eef2f3",
};

const panelTitleWrap = {
  display: "flex",
  alignItems: "center",
  gap: 9,
};

const panelIcon = {
  width: 28,
  height: 28,
  display: "grid",
  placeItems: "center",
  borderRadius: 8,
  background: "#edf5f6",
  color: "#547b88",
};

const metricGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
};

const metricCard = {
  padding: "14px 15px",
  border: "1px solid #dfe8eb",
  borderRadius: 12,
  background: "#ffffff",
  minWidth: 0,
};

const metricIcon = {
  width: 28,
  height: 28,
  display: "grid",
  placeItems: "center",
  borderRadius: 8,
  background: "#edf5f6",
  color: "#547b88",
};

const metricLabel = {
  marginTop: 11,
  color: "#87979d",
  fontSize: 9,
  fontWeight: 700,
};

const metricValue = {
  marginTop: 4,
  color: "#345562",
  fontSize: 22,
  fontWeight: 800,
};

const metricDetail = {
  marginTop: 4,
  color: "#9aa8ad",
  fontSize: 9,
};

const splitGrid = {
  display: "grid",
  gridTemplateColumns: "1.1fr 0.9fr",
  gap: 14,
};

const operationList = { display: "grid", gap: 8 };

const operationRow = {
  display: "flex",
  gap: 9,
  padding: "9px 10px",
  border: "1px solid #edf1f2",
  borderRadius: 9,
};

const operationMarker = {
  width: 23,
  height: 23,
  display: "grid",
  placeItems: "center",
  borderRadius: 999,
  background: "#eef8f5",
  color: "#3b8b73",
  flex: "0 0 auto",
};

const operationLabelRow = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  alignItems: "center",
};

const mcpMiniGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
};

const miniCard = {
  padding: 10,
  border: "1px solid #edf1f2",
  borderRadius: 9,
};

const miniCardHead = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  alignItems: "center",
};

const capabilityPreview = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 9,
};

const previewCard = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: 10,
  border: "1px solid #edf1f2",
  borderRadius: 9,
};

const toolbar = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap" as const,
  alignItems: "center",
};

const searchBox = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flex: "1 1 280px",
  minWidth: 220,
  height: 38,
  padding: "0 11px",
  border: "1px solid #d8e3e6",
  borderRadius: 9,
  background: "#ffffff",
  color: "#82949b",
};

const searchInput = {
  width: "100%",
  border: 0,
  outline: "none",
  background: "transparent",
  color: "#344f59",
  fontSize: 11,
};

const segmented = {
  display: "inline-flex",
  padding: 3,
  gap: 2,
  border: "1px solid #dde7ea",
  borderRadius: 9,
  background: "#ffffff",
};

const segmentButton = {
  border: 0,
  background: "transparent",
  color: "#71848b",
  borderRadius: 7,
  padding: "7px 9px",
  fontSize: 9,
  fontWeight: 700,
  cursor: "pointer",
};

const segmentButtonActive = {
  background: "#eef5f7",
  color: "#245768",
};

const toolbarStats = {
  display: "flex",
  gap: 8,
  color: "#91a0a6",
  fontSize: 9,
};

const capabilityList = {
  display: "grid",
  gap: 9,
};

const capabilityCard = {
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
  alignItems: "center",
  padding: 14,
  border: "1px solid #dfe8eb",
  borderRadius: 12,
  background: "#ffffff",
};

const capabilityMain = {
  display: "flex",
  gap: 10,
  alignItems: "flex-start",
  minWidth: 0,
  flex: 1,
};

const capabilityIcon = (kind: string) => ({
  width: 34,
  height: 34,
  display: "grid",
  placeItems: "center",
  borderRadius: 9,
  background: kind === "skill" ? "#edf5f6" : "#f4f0fb",
  color: kind === "skill" ? "#4f7988" : "#725c91",
  flex: "0 0 auto",
});

const capabilityTitleRow = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap" as const,
};

const capabilityTitle = {
  color: "#365460",
  fontSize: 12,
};

const kindBadge = {
  border: "1px solid #e3eaec",
  background: "#f7f9fa",
  color: "#88979d",
  borderRadius: 999,
  padding: "2px 5px",
  fontSize: 7,
  fontWeight: 800,
  letterSpacing: "0.05em",
};

const statusBadge = {
  border: "1px solid",
  borderRadius: 999,
  padding: "3px 7px",
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  fontSize: 8,
  fontWeight: 800,
  letterSpacing: "0.04em",
  whiteSpace: "nowrap" as const,
};

const capabilityMeta = {
  marginTop: 5,
  color: "#8e9ca2",
  fontSize: 9,
};

const capabilityDescription = {
  margin: "6px 0 0",
  color: "#687c84",
  fontSize: 10,
  lineHeight: 1.5,
};

const dependencyLine = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  flexWrap: "wrap" as const,
  marginTop: 7,
  color: "#8c9aa0",
  fontSize: 8,
};

const dependencyBadge = {
  padding: "3px 6px",
  borderRadius: 999,
  background: "#f6f8f9",
  border: "1px solid #e8eef0",
  color: "#71858d",
};

const capabilityActions = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flex: "0 0 auto",
};

const secondaryAction = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  height: 33,
  padding: "0 10px",
  border: "1px solid #d5e1e4",
  borderRadius: 8,
  background: "#ffffff",
  color: "#496c78",
  fontSize: 9,
  fontWeight: 750,
  cursor: "pointer",
};

const primaryAction = {
  ...secondaryAction,
  background: "#245f73",
  color: "#ffffff",
  borderColor: "#245f73",
};

const iconAction = {
  width: 33,
  height: 33,
  display: "grid",
  placeItems: "center",
  border: "1px solid #dfe7e9",
  borderRadius: 8,
  background: "#ffffff",
  color: "#809198",
  cursor: "pointer",
};

const mcpBanner = {
  display: "flex",
  alignItems: "flex-start",
  gap: 11,
  padding: "12px 14px",
  borderRadius: 11,
  border: "1px solid #dce8eb",
  background: "#f8fbfb",
};

const mcpBannerIcon = {
  width: 32,
  height: 32,
  display: "grid",
  placeItems: "center",
  borderRadius: 9,
  background: "#eaf4f6",
  color: "#507887",
  flex: "0 0 auto",
};

const mcpList = {
  display: "grid",
  gap: 10,
};

const mcpCard = {
  padding: 15,
  border: "1px solid #dfe8eb",
  borderRadius: 12,
  background: "#ffffff",
};

const mcpCardTop = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
};

const eyebrowSmall = {
  color: "#a0adb2",
  fontSize: 8,
  fontWeight: 800,
  letterSpacing: "0.1em",
};

const mcpName = {
  margin: "4px 0 0",
  color: "#3f5b66",
  fontSize: 13,
};

const mcpMetrics = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
  marginTop: 13,
};

const metricTiny = {
  display: "flex",
  gap: 7,
  alignItems: "center",
  padding: 9,
  borderRadius: 8,
  background: "#f7fafb",
};

const metricTinyLabel = {
  color: "#9aa7ac",
  fontSize: 8,
};

const toolCloud = {
  display: "flex",
  gap: 5,
  flexWrap: "wrap" as const,
  marginTop: 10,
};

const toolBadge = {
  padding: "4px 6px",
  borderRadius: 6,
  background: "#f5f8f9",
  color: "#66818b",
  fontSize: 8,
  border: "1px solid #e6edef",
};

const errorBox = {
  display: "flex",
  gap: 7,
  alignItems: "flex-start",
  marginTop: 10,
  padding: 9,
  border: "1px solid #f0d3ce",
  borderRadius: 8,
  background: "#fff7f5",
  color: "#a94a41",
  fontSize: 9,
};

const policyGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 10,
};

const permissionList = {
  display: "grid",
  gap: 8,
};

const permissionRow = {
  display: "grid",
  gridTemplateColumns: "30px minmax(0, 1fr) auto",
  gap: 9,
  alignItems: "start",
  padding: 10,
  border: "1px solid #edf1f2",
  borderRadius: 9,
};

const permissionIcon = (level: string) => ({
  width: 28,
  height: 28,
  display: "grid",
  placeItems: "center",
  borderRadius: 8,
  background: level.includes("confirma") ? "#fff5e9" : "#edf7f3",
  color: level.includes("confirma") ? "#a36a21" : "#3c806c",
});

const permissionLevel = {
  padding: "4px 7px",
  borderRadius: 999,
  background: "#f5f8f9",
  color: "#72858c",
  fontSize: 8,
  fontWeight: 750,
  whiteSpace: "nowrap" as const,
};

const principleGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 8,
};

const principle = {
  display: "flex",
  gap: 8,
  alignItems: "flex-start",
  padding: 10,
  border: "1px solid #edf1f2",
  borderRadius: 9,
};

const principleNumber = {
  width: 25,
  height: 25,
  display: "grid",
  placeItems: "center",
  borderRadius: 7,
  background: "#eef5f7",
  color: "#537987",
  fontSize: 10,
  fontWeight: 800,
  flex: "0 0 auto",
};

const timeline = {
  display: "grid",
};

const timelineRow = {
  display: "grid",
  gridTemplateColumns: "26px minmax(0, 1fr)",
};

const timelineRail = {
  position: "relative" as const,
  display: "flex",
  justifyContent: "center",
};

const timelineDot = (active: boolean) => ({
  width: 9,
  height: 9,
  marginTop: 14,
  borderRadius: 999,
  background: active ? "#4f7f8d" : "#a9bdc3",
  border: "2px solid #eff6f7",
  zIndex: 1,
});

const timelineLine = {
  position: "absolute" as const,
  top: 23,
  bottom: 0,
  width: 1,
  background: "#dce7ea",
};

const timelineContent = {
  padding: "11px 0 13px",
  borderBottom: "1px solid #edf1f2",
};

const timelineTop = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
};

const timelineAction = {
  marginTop: 3,
  color: "#547783",
  fontSize: 9,
  fontWeight: 750,
};

const notice = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginTop: 12,
  padding: "10px 12px",
  border: "1px solid",
  borderRadius: 9,
  fontSize: 10,
};

const dismissButton = {
  marginLeft: "auto",
  display: "grid",
  placeItems: "center",
  border: 0,
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
};

const secondaryButton = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  height: 34,
  padding: "0 10px",
  border: "1px solid #d5e1e4",
  borderRadius: 8,
  background: "#ffffff",
  color: "#4d6f7a",
  fontSize: 9,
  fontWeight: 750,
  cursor: "pointer",
};

const primaryButton = {
  ...secondaryButton,
  background: "#245f73",
  color: "#ffffff",
  borderColor: "#245f73",
};

const linkButton = {
  display: "inline-flex",
  alignItems: "center",
  gap: 3,
  border: 0,
  background: "transparent",
  color: "#5a7b86",
  fontSize: 9,
  fontWeight: 750,
  cursor: "pointer",
};

const mutedText = {
  color: "#9aa7ac",
  fontSize: 8,
};

const emptyState = {
  display: "grid",
  justifyItems: "center",
  gap: 6,
  padding: "40px 20px",
  color: "#93a2a7",
  textAlign: "center" as const,
};

