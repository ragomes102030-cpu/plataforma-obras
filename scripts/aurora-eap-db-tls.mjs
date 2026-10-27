import { X509Certificate } from "node:crypto";

/**
 * Conexão TLS autenticada da regressão EAP.
 * CA privada vem de SUPABASE_DB_CA_PEM (secret do GitHub Actions),
 * nunca da URL e nunca com rejectUnauthorized:false.
 */
export function configurarConexaoEap(databaseUrl, caPem = process.env.SUPABASE_DB_CA_PEM) {
  if (!databaseUrl) throw new Error("DATABASE_URL não configurada.");
  const url = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("DATABASE_URL inválida: use PostgreSQL.");
  if (!url.hostname || !url.username || !url.password) throw new Error("DATABASE_URL incompleta.");
  const sslMode = (url.searchParams.get("ssl-mode") ?? url.searchParams.get("sslmode") ?? "").toLowerCase();
  if (["disable", "disabled", "allow", "prefer"].includes(sslMode)) {
    throw new Error("A regressão exige TLS verificado; o sslmode informado permite conexão insegura.");
  }
  // node-postgres pode sobrescrever ssl:{ ca, rejectUnauthorized } quando a
  // string traz sslmode. Remove para manter o contrato explícito de confiança.
  for (const option of ["sslmode", "ssl-mode", "sslrootcert", "sslcert", "sslkey"]) {
    url.searchParams.delete(option);
  }
  const ssl = { rejectUnauthorized: true };
  const cert = caPem?.trim().replace(/\\n/g, "\n");
  if (cert) {
    const certificates = cert.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
    if (!certificates?.length) throw new Error("SUPABASE_DB_CA_PEM não contém certificado PEM válido.");
    try {
      for (const pem of certificates) new X509Certificate(pem);
    } catch {
      throw new Error("SUPABASE_DB_CA_PEM contém certificado inválido.");
    }
    ssl.ca = cert;
  }
  return { connectionString: url.toString(), ssl };
}

export function diagnosticoCertificado(error) {
  const msg = error instanceof Error ? error.message : String(error);
  if (/self[- ]signed certificate|certificate chain|unable to verify|CERT_HAS_EXPIRED|UNABLE_TO_VERIFY_LEAF_SIGNATURE|SELF_SIGNED_CERT_IN_CHAIN/i.test(msg)) {
    return [
      "Falha de verificação TLS ao conectar ao Supabase. A EAP ainda não foi validada.",
      "Obtenha o certificado CA do projeto em Supabase → Database Settings → SSL Configuration.",
      "Configure o secret SUPABASE_DB_CA_PEM no repositório GitHub (PEM completo, sem credenciais).",
      "Confirme que SUPABASE_DB_URL aponta para o host exato fornecido em Supabase → Connect.",
      "O teste mantém rejectUnauthorized:true. Não desative a verificação de certificados.",
      "Detalhe TLS: " + msg,
    ].join("\n");
  }
  return msg;
}
