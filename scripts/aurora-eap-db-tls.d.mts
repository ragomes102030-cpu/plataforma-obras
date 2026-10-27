export declare function configurarConexaoEap(
  databaseUrl: string,
  caPem?: string,
): { connectionString: string; ssl: { rejectUnauthorized: true; ca?: string } };
export declare function diagnosticoCertificado(error: unknown): string;
