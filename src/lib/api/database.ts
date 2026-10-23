import { invoke } from "@tauri-apps/api/core";

export type DatabaseEngine = "sqlite" | "mysql" | "mariadb" | "postgresql" | "oracle" | "sqlserver" | "redis" | "mongodb" | "clickhouse";

export interface DatabaseConnection {
  id: number;
  name: string;
  serverId: number;
  engine: DatabaseEngine | string;
  host: string;
  port: number;
  username: string;
  databaseName: string;
  dbIndex: number;
  isProdProtect: boolean;
  prodDatabases: string;
  prodDbList: string;
  sshTunnel: boolean;
  aiTier: string;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseConnectionInput {
  connectionId?: number;
  name: string;
  serverId: number;
  engine: DatabaseEngine | string;
  host: string;
  port: number;
  username?: string;
  databaseName?: string;
  dbIndex?: number;
  password?: string;
  isProdProtect?: boolean;
  prodDatabases?: string;
  prodDbList?: string;
  sshTunnel?: boolean;
  aiTier?: string;
}

export interface DatabaseProbeResult {
  ok: boolean;
  message: string;
  latencyMs: number | null;
}

export interface DatabaseQueryResult {
  columns: string[];
  rows: string[][];
  affectedRows: number;
  timeMs: number;
}

export interface RedisKeyItem {
  key: string;
  keyType: string;
}

export interface MongoCollectionItem {
  name: string;
  documentCount: number | null;
}

export interface DatabaseTableItem {
  name: string;
  tableType: string;
}

export const databaseApi = {
  list: () => invoke<DatabaseConnection[]>("list_database_connections"),
  create: (input: DatabaseConnectionInput) =>
    invoke<DatabaseConnection>("add_database_connection", { input }),
  update: (id: number, input: DatabaseConnectionInput) =>
    invoke<DatabaseConnection>("update_database_connection", { id, input }),
  remove: (id: number) => invoke<boolean>("delete_database_connection", { id }),
  testDraft: (input: DatabaseConnectionInput) =>
    invoke<DatabaseProbeResult>("test_database_connection", { input }),
  testSaved: (id: number) =>
    invoke<DatabaseProbeResult>("test_saved_database_connection", { id }),
  query: (connectionId: number, sql: string, databaseName?: string) =>
    invoke<DatabaseQueryResult>("execute_database_query", {
      request: { connectionId, sql, databaseName: databaseName || null },
    }),
  listDatabases: (connectionId: number) =>
    invoke<string[]>("list_sql_databases", { connectionId }),
  listTables: (connectionId: number, databaseName?: string) =>
    invoke<DatabaseTableItem[]>("list_database_tables", {
      connectionId,
      databaseName: databaseName || null,
    }),
  redisKeys: (connectionId: number, pattern = "*", limit = 200) =>
    invoke<RedisKeyItem[]>("list_redis_keys", { connectionId, pattern, limit }),
  redisValue: (connectionId: number, key: string) =>
    invoke<string>("get_redis_value", { connectionId, key }),
  mongoCollections: (connectionId: number) =>
    invoke<MongoCollectionItem[]>("list_mongo_collections", { connectionId }),
  mongoQuery: (connectionId: number, collection: string, limit = 100) =>
    invoke<string>("query_mongo_collection", { connectionId, collection, limit }),
};
