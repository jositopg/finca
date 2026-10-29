declare module 'pg' {
  export class Client {
    constructor(config: { connectionString: string; ssl?: { rejectUnauthorized: boolean } })
    connect(): Promise<void>
    end(): Promise<void>
    query(sql: string): Promise<{ rows: Record<string, unknown>[] }>
  }

  export const types: {
    setTypeParser(oid: number, parser: (value: string) => string): void
  }
}
