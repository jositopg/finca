declare module 'pg' {
  export class Client {
    constructor(config: { connectionString: string; ssl?: { rejectUnauthorized: boolean } })
    connect(): Promise<void>
    end(): Promise<void>
    query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>
  }

  export const types: {
    setTypeParser(oid: number, parser: (value: string) => string): void
  }
}
