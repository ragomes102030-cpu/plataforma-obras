import { expect, test } from "@playwright/test";

test("dashboard, fluxo EAP, cronograma e painel de atividade", async ({ page }) => {
  await page.goto("/design-v2.html");
  await expect(page.getByRole("heading", { name: "Residencial Horizonte" })).toBeVisible();
  await expect(page.getByText("Prévia V2 · dados fictícios")).toBeVisible();
  await page.screenshot({ path: "test-results/design-v2/dashboard.png", fullPage: true });

  await page.getByRole("button", { name: /Continuar planejamento/ }).click();
  await expect(page.getByRole("heading", { name: "Planejamento" })).toBeVisible();
  await expect(page.getByText("Baseline bloqueada nesta versão")).toBeVisible();
  await expect(page.getByRole("tab", { name: "EAP", exact: true })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("tab", { name: "Cronograma" }).click();
  await expect(page.getByText("Baseline bloqueada nesta versão")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cronograma de atividades" })).toBeVisible();
  await page.screenshot({ path: "test-results/design-v2/gantt.png", fullPage: true });

  await page.getByRole("button", { name: /^Escavações / }).click();
  const drawer = page.getByRole("dialog", { name: "Detalhe da atividade" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("textbox", { name: "Nome da atividade" }).fill("Escavações — teste da prévia");
  await drawer.getByRole("button", { name: "Salvar na prévia" }).click();
  await expect(page.getByText("Escavações — teste da prévia")).toBeVisible();
  await expect(page.getByText("Alteração demonstrativa salva nesta sessão.", { exact: false })).toBeVisible();

  await page.getByRole("tab", { name: "Versões e baseline" }).click();
  await page.getByRole("button", { name: /Versão V2/ }).click();
  await expect(page.getByText("Versão de referência aprovada")).toBeVisible();
});

test("modo escuro e navegação responsiva no tablet", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/design-v2.html");
  await page.getByRole("button", { name: "Usar tema escuro" }).click();
  await expect(page.locator(".pv2")).toHaveAttribute("data-theme", "dark");

  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: /^Planejamento/ }).click();
  await expect(page.getByRole("heading", { name: "Planejamento" })).toBeVisible();
  await page.screenshot({ path: "test-results/design-v2/tablet.png", fullPage: true });

  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.getByRole("button", { name: "Sair da obra" }).click();
  await expect(page.getByRole("heading", { name: "Obras" })).toBeVisible();
  await page.getByRole("button", { name: /Residencial Horizonte/ }).click();
  await expect(page.getByRole("heading", { name: "Residencial Horizonte" })).toBeVisible();
});


test("todas as 17 abas têm tela própria na prévia V2", async ({ page }) => {
  await page.goto("/design-v2.html");
  const navigation = page.getByRole("navigation", { name: "Navegação principal" });
  const areas = [
    { label: "Planejamento", tabs: [
      ["Escopo","Escopo da obra"],["EAP","Estrutura Analítica do Projeto"],
      ["Atividades","Lista de atividades"],["Dependências","Relações entre atividades"],
      ["CPM","CPM · caminho crítico"],["Versões e baseline","Versões e baseline"],
      ["Cronograma","Cronograma de atividades"],["Linha de Balanço","Linha de Balanço"],
    ] },
    { label: "Execução", tabs: [["Controle de produção","Controle de produção"],["Curva S","Curva S"]] },
    { label: "Custos", tabs: [["Orçamento e custos","Orçamento e custos"]] },
    { label: "Suprimentos", tabs: [["Suprimentos","Suprimentos"],["Catálogo de insumos","Catálogo de insumos"]] },
    { label: "Gestão", tabs: [["Documentos","Documentos"],["Riscos","Riscos"]] },
  ];
  await expect(page.getByRole("heading", { name: "Residencial Horizonte" })).toBeVisible(); // dashboard
  for (const area of areas) {
    await navigation.getByRole("button", { name: new RegExp("^"+area.label) }).click();
    for (const [tab,heading] of area.tabs) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await expect(page.getByRole("heading", { name: heading, exact: true }).first()).toBeVisible();
    }
  }
  await page.getByRole("button", { name: /Central de Comando.*Prévia de IA/ }).click();
  await expect(page.getByRole("heading", { name: "Central de Comando" })).toBeVisible();
  await expect(page.getByText(/apenas a maquete da Central de Comando/)).toBeVisible();
  await page.screenshot({ path: "test-results/design-v2/central-comando.png", fullPage: true });
});

test("telas técnicas demonstram detalhes e buscam itens sem gravar dados", async ({ page }) => {
  await page.goto("/design-v2.html");
  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: /^Suprimentos/ }).click();
  await page.getByRole("button", { name: /Aço CA-50/ }).click();
  await expect(page.getByText("Plano de suprimentos fictício")).toBeVisible();
  await page.getByRole("tab", { name: "Catálogo de insumos" }).click();
  await page.getByRole("textbox", { name: "Buscar insumo" }).fill("Betoneira");
  await expect(page.getByText("Betoneira 400 L")).toBeVisible();
  await expect(page.getByText("Pedreiro", { exact: true })).toHaveCount(0);

  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: /^Gestão/ }).click();
  await page.getByRole("tab", { name: "Riscos" }).click();
  await page.getByRole("button", { name: /Interferência em fundações/ }).click();
  await expect(page.getByText(/Compatibilizar sondagem/)).toBeVisible();

  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: /^Planejamento/ }).click();
  await page.getByRole("tab", { name: "Linha de Balanço" }).click();
  await expect(page.getByRole("img", { name: /Linha de Balanço fictícia/ })).toBeVisible();
  await page.screenshot({ path: "test-results/design-v2/linha-de-balanco.png", fullPage: true });
});


test("Gantt colapsável, edição direta e alteração manual de data e predecessora", async ({page})=>{
  await page.goto("/design-v2.html");
  await page.getByRole("button", {name:/Continuar planejamento/}).click();
  await page.getByRole("tab", {name:"Cronograma"}).click();
  await expect(page.getByRole("heading",{name:"Cronograma de atividades"})).toBeVisible();
  await expect(page.getByRole("button",{name:/Escavações A03/})).toBeVisible();
  await page.getByRole("button",{name:/1.2 Infraestrutura/}).click();
  await expect(page.getByRole("button",{name:/Escavações A03/})).toHaveCount(0);
  await page.getByRole("button",{name:/Expandir tudo/}).click();
  await expect(page.getByRole("button",{name:/Escavações A03/})).toBeVisible();
  await page.getByRole("spinbutton",{name:"Avanço de Escavações"}).fill("72");
  await page.getByRole("button",{name:/Escavações A03/}).click();
  const drawer=page.getByRole("dialog",{name:"Detalhe da atividade"});
  await drawer.getByRole("tab",{name:"Planejamento"}).click();
  await drawer.getByRole("textbox",{name:"Início previsto"}).fill("2026-11-18");
  await drawer.getByRole("spinbutton",{name:"Duração (dias)"}).fill("17");
  await drawer.getByRole("tab",{name:"Vínculos"}).click();
  await drawer.getByRole("combobox",{name:"Predecessora da atividade"}).selectOption("AT-001");
  await drawer.getByRole("button",{name:"Salvar na prévia"}).click();
  await expect(page.getByRole("spinbutton",{name:"Avanço de Escavações"})).toHaveValue("72");
  await expect(page.getByRole("button",{name:"Abrir atividade Escavações"})).toHaveAttribute("title",/18\/11\/2026—04\/12\/2026/);
  await page.screenshot({path:"test-results/design-v2/gantt-profissional.png",fullPage:true});
});

test("Linha de Balanço com datas verticais, grupos recolhíveis e edição humana",async ({page})=>{
  await page.goto("/design-v2.html");
  await page.getByRole("button",{name:/Continuar planejamento/}).click();
  await page.getByRole("tab",{name:"Linha de Balanço"}).click();
  await expect(page.getByRole("img",{name:/datas no eixo vertical/})).toBeVisible();
  await page.getByRole("button",{name:/Estrutura 2/}).click();
  await expect(page.getByRole("button",{name:/Concretagem de lajes/})).toHaveCount(0);
  await page.getByRole("button",{name:/Expandir todas/}).click();
  await page.getByRole("button",{name:/Concretagem de lajes/}).click();
  await page.getByRole("spinbutton",{name:"Ritmo em dias por pavimento"}).fill("9");
  await expect(page.getByText("9 d/pav.")).toBeVisible();
  await page.getByRole("textbox",{name:"Equipe responsável pela frente"}).fill("Equipe F");
  await expect(page.getByText(/Equipe F · 9 d\/pav/)).toBeVisible();
  await page.screenshot({path:"test-results/design-v2/linha-balanco-vertical.png",fullPage:true});
});
