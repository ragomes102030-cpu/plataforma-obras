import fs from "node:fs/promises";
import path from "node:path";

const BOOTSTRAP_PATH = path.resolve(process.cwd(), "docs", "ARQUIMEDES-CEREBRO-BOOTSTRAP.md");

export async function loadArquimedesBrainBootstrap(): Promise<string> {
  try {
    const content = await fs.readFile(BOOTSTRAP_PATH, "utf8");
    return content.trim().slice(0, 9000);
  } catch {
    return [
      "Cérebro mestre do Arquimedes indisponível no runtime.",
      "Considere a memória persistente e os dados atuais da obra como fontes de continuidade.",
      "Não invente aprendizados e não aplique alterações sem aprovação explícita."
    ].join("\n");
  }
}
