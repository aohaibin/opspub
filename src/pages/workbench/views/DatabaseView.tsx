import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Form, Input, Modal, Select, Switch, Table, message } from "antd";
import { open as openFile, save } from "@tauri-apps/plugin-dialog";
import {
  Database,
  Key,
  Leaf,
  Plus,
  History,
  Code2,
  Search,
  Inbox,
  Sparkles,
  Play,
  GitMerge,
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Wifi,
  X,
  Download,
  RefreshCw,
  RotateCw,
  Zap,
  Copy,
  Trash2,
  FileCode,
  List,
  ChevronRight,
  Folder,
  Table2,
  Terminal,
  Pencil,
  Settings2,
} from "lucide-react";
import { getErrorMessage } from "@/lib/api/client";
import { databaseApi, type DatabaseColumnItem, type DatabaseConnection, type DatabaseTableItem, type MongoCollectionItem, type RedisKeyItem } from "@/lib/api/database";
import { fileApi } from "@/lib/api/file";
import { serverApi } from "@/lib/api/server";
import { useWorkbenchRuntime } from "../context";

export type DatabaseSubTab = "sql" | "redis" | "mongodb";

interface DbConnectionItem {
  id: string;
  serverId: number;
  name: string;
  server: string;
  type: string;
  host: string;
  port: string;
  user: string;
  database?: string;
  isProdProtect: boolean;
  prodDatabases?: string;
  sshTunnel: boolean;
  aiTier: string;
  createdAt: string;
}

interface RedisConnectionItem {
  id: string;
  serverId: number;
  name: string;
  server: string;
  type: "Redis";
  host: string;
  port: string;
  dbIndex: string;
  isProdProtect: boolean;
  prodDbList?: string;
  sshTunnel: boolean;
  aiTier: string;
  createdAt: string;
}

interface SqlTabItem {
  id: string;
  title: string;
  sql: string;
}

interface DatabaseObjectGroup {
  key: string;
  label: string;
  items: DatabaseTableItem[];
}

type QueryRow = Record<string, string>;

const SQL_KEYWORDS = [
  "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "JOIN", "LEFT JOIN", "RIGHT JOIN",
  "INNER JOIN", "ON", "AS", "ORDER BY", "GROUP BY", "HAVING", "LIMIT", "OFFSET",
  "INSERT INTO", "VALUES", "UPDATE", "SET", "DELETE FROM", "CREATE TABLE", "ALTER TABLE",
  "DISTINCT", "COUNT", "SUM", "AVG", "MIN", "MAX", "NULL", "IS NULL", "LIKE", "IN",
];

function getSqlSuggestions(sql: string, caret: number, tableNames: string[]) {
  const beforeCaret = sql.slice(0, caret);
  const tokenMatch = beforeCaret.match(/[\w$]+$/);
  if (!tokenMatch) return { start: caret, items: [] as string[], tableContext: false };

  const prefix = tokenMatch[0].toLowerCase();
  const start = caret - tokenMatch[0].length;
  const tableContext = /\b(from|join|update|into|table)\s+[\w$]*$/i.test(beforeCaret);
  const source = tableContext ? tableNames : SQL_KEYWORDS;
  const items = source
    .filter((item) => item.toLowerCase().startsWith(prefix) && item.toLowerCase() !== prefix)
    .slice(0, 8);
  return { start, items, tableContext };
}

function displayEngineName(engine: string): string {
  if (engine.toLowerCase() === "sqlite") return "SQLite";
  if (engine.toLowerCase() === "mysql") return "MySQL";
  if (engine.toLowerCase() === "mariadb") return "MariaDB";
  if (engine.toLowerCase() === "postgresql") return "PostgreSQL";
  if (engine.toLowerCase() === "oracle") return "Oracle";
  if (["sqlserver", "mssql", "microsoft sql server"].includes(engine.toLowerCase())) return "Microsoft SQL Server";
  if (engine.toLowerCase() === "mongodb") return "MongoDB";
  if (engine.toLowerCase() === "redis") return "Redis";
  if (engine.toLowerCase() === "clickhouse") return "ClickHouse";
  return engine;
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "::1" || /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

function groupDatabaseObjects(items: DatabaseTableItem[]): DatabaseObjectGroup[] {
  const groups = new Map<string, DatabaseTableItem[]>();
  items.forEach((item) => {
    const normalized = item.tableType.trim().toLowerCase();
    const key = normalized.includes("view")
      ? "view"
      : normalized.includes("procedure") || normalized.includes("proc")
        ? "procedure"
        : normalized.includes("function") || normalized.includes("func")
          ? "function"
          : normalized.includes("trigger")
            ? "trigger"
            : normalized.includes("index") || normalized.includes("idx")
              ? "index"
              : "table";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  });

  const categories: Array<[string, string]> = [
    ["table", "表"],
    ["view", "视图"],
    ["procedure", "存储过程"],
    ["function", "函数"],
    ["trigger", "触发器"],
    ["index", "索引"],
  ];
  return categories.map(([key, label]) => ({
    key,
    label,
    items: groups.get(key) ?? [],
  }));
}

function databaseDisplayName(connection: Pick<DbConnectionItem, "type" | "host">, databaseName: string): string {
  if (connection.type !== "SQLite") return databaseName;
  if (databaseName.includes(" (")) return databaseName;
  const fileName = connection.host.split(/[\\/]/).filter(Boolean).pop();
  return fileName ? `${databaseName} (${fileName})` : databaseName;
}

export const DatabaseView: React.FC = () => {
  const { server } = useWorkbenchRuntime();

  // 子标签状态
  const [subTab, setSubTab] = useState<DatabaseSubTab>("sql");

  // 连接列表
  const [sqlConnections, setSqlConnections] = useState<DbConnectionItem[]>([]);
  const [redisConnections, setRedisConnections] = useState<RedisConnectionItem[]>([]);
  const [mongoConnections, setMongoConnections] = useState<DbConnectionItem[]>([]);
  const [filterText, setFilterText] = useState("");
  const [serverFilter, setServerFilter] = useState("all");
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [expandedConnectionIds, setExpandedConnectionIds] = useState<Record<string, boolean>>({});
  const [historyOpen, setHistoryOpen] = useState(false);
  const [snippetsOpen, setSnippetsOpen] = useState(false);
  const [queryHistory, setQueryHistory] = useState<Array<{ sql: string; createdAt: string }>>([]);
  const [serverNames, setServerNames] = useState<Record<number, string>>({});
  const [availableServers, setAvailableServers] = useState<Array<{ id: number; alias: string; hostname: string; port: number }>>([]);
  const [databaseOptions, setDatabaseOptions] = useState<Record<string, string[]>>({});
  const [databaseLoading, setDatabaseLoading] = useState<Record<string, boolean>>({});
  const [databaseObjects, setDatabaseObjects] = useState<Record<string, DatabaseTableItem[]>>({});
  const [databaseObjectLoading, setDatabaseObjectLoading] = useState<Record<string, boolean>>({});
  const [expandedDatabaseKeys, setExpandedDatabaseKeys] = useState<Record<string, boolean>>({});
  const [expandedObjectGroupKeys, setExpandedObjectGroupKeys] = useState<Record<string, boolean>>({});
  const [structureOpen, setStructureOpen] = useState(false);
  const [structureLoading, setStructureLoading] = useState(false);
  const [structureTables, setStructureTables] = useState<DatabaseTableItem[]>([]);
  const [selectedTable, setSelectedTable] = useState<DatabaseTableItem | null>(null);
  const [tableColumns, setTableColumns] = useState<DatabaseColumnItem[]>([]);
  const [tableColumnsLoading, setTableColumnsLoading] = useState(false);
  const [columnModalOpen, setColumnModalOpen] = useState(false);
  const [columnForm] = Form.useForm();
  const [contextMenu, setContextMenu] = useState<{
    kind: "connection" | "database";
    connection: DbConnectionItem;
    databaseName?: string;
    x: number;
    y: number;
  } | null>(null);
  const [createTableOpen, setCreateTableOpen] = useState(false);
  const [createTableForm] = Form.useForm();
  const [sqlSuggestions, setSqlSuggestions] = useState<string[]>([]);
  const [activeSqlSuggestion, setActiveSqlSuggestion] = useState(0);
  const [suggestingTable, setSuggestingTable] = useState(false);
  const sqlEditorRef = useRef<HTMLTextAreaElement>(null);

  // 查询标签页
  const [sqlTabs, setSqlTabs] = useState<SqlTabItem[]>([
    { id: "1", title: "查询 1", sql: "" },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>("1");

  // AI Prompt 与执行库
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [selectedDb, setSelectedDb] = useState<string>("");
  const [executing, setExecuting] = useState(false);
  const [resultRows, setResultRows] = useState<QueryRow[] | null>(null);
  const [resultColumnNames, setResultColumnNames] = useState<string[]>([]);
  const [execStats, setExecStats] = useState<{ affected: number; timeMs: number } | null>(null);

  const [redisKeys, setRedisKeys] = useState<RedisKeyItem[]>([]);
  const [redisPattern, setRedisPattern] = useState("*");
  const [redisValue, setRedisValue] = useState<string | null>(null);
  const [mongoCollections, setMongoCollections] = useState<MongoCollectionItem[]>([]);
  const [mongoDocuments, setMongoDocuments] = useState<QueryRow[]>([]);

  // 新建 DB 凭据弹窗 (截图 2 & 3)
  const [dbModalOpen, setDbModalOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<DbConnectionItem | null>(null);
  const [editingRedisConnection, setEditingRedisConnection] = useState<RedisConnectionItem | null>(null);
  const [detailConnection, setDetailConnection] = useState<DbConnectionItem | RedisConnectionItem | null>(null);
  const [dbForm] = Form.useForm();
  const [dbFormKey, setDbFormKey] = useState(0);
  const [dbFormInitialValues, setDbFormInitialValues] = useState<Record<string, unknown>>({});
  const selectedDbType = Form.useWatch("type", dbForm) as string | undefined;
  const isSqliteForm = selectedDbType === "SQLite";
  const [dbProdProtect, setDbProdProtect] = useState(false);
  const [dbSshTunnel, setDbSshTunnel] = useState(false);
  const [dbPasswordVisible, setDbPasswordVisible] = useState(false);
  const [testDbLoading, setTestDbLoading] = useState(false);
  const [dbValidationFailed, setDbValidationFailed] = useState(false);

  // 新建 Redis 连接弹窗 (截图 5)
  const [redisModalOpen, setRedisModalOpen] = useState(false);
  const [redisForm] = Form.useForm();
  const [redisFormKey, setRedisFormKey] = useState(0);
  const [redisFormInitialValues, setRedisFormInitialValues] = useState<Record<string, unknown>>({});
  const [redisProdProtect, setRedisProdProtect] = useState(false);
  const [redisSshTunnel, setRedisSshTunnel] = useState(false);
  const [redisPasswordVisible, setRedisPasswordVisible] = useState(false);
  const [testRedisLoading, setTestRedisLoading] = useState(false);
  const [redisValidationFailed, setRedisValidationFailed] = useState(false);

  const mapConnection = (connection: DatabaseConnection, aliases = serverNames): DbConnectionItem | RedisConnectionItem => {
    const base = {
      id: String(connection.id),
      serverId: connection.serverId,
      name: connection.name,
      server: connection.serverId === 0 ? "本机" : aliases[connection.serverId] ?? `server-${connection.serverId}`,
      host: connection.host,
      port: String(connection.port),
      isProdProtect: connection.isProdProtect,
      sshTunnel: connection.sshTunnel,
      aiTier: connection.aiTier,
      createdAt: connection.createdAt,
    };
    if (connection.engine === "redis") {
      return {
        ...base,
        type: "Redis",
        dbIndex: String(connection.dbIndex),
        prodDbList: connection.prodDbList,
      };
    }
    return {
      ...base,
      type: connection.engine === "mongodb" ? "MongoDB" : connection.engine === "sqlite" ? "SQLite" : displayEngineName(connection.engine),
      user: connection.username,
      database: connection.databaseName,
      prodDatabases: connection.prodDatabases,
    };
  };

  useEffect(() => {
    let cancelled = false;
    void Promise.all([databaseApi.list(), serverApi.list()])
      .then(([connections, servers]) => {
        if (cancelled) return;
        const aliases = Object.fromEntries(servers.map((item) => [item.id, item.alias]));
        setServerNames(aliases);
        setAvailableServers(servers.map((item) => ({ id: item.id, alias: item.alias, hostname: item.hostname, port: item.port })));
        const mapped = connections.map((connection) => mapConnection(connection, aliases));
        setSqlConnections(mapped.filter((connection): connection is DbConnectionItem => connection.type !== "Redis" && connection.type !== "MongoDB"));
        setRedisConnections(mapped.filter((connection): connection is RedisConnectionItem => connection.type === "Redis"));
        setMongoConnections(mapped.filter((connection): connection is DbConnectionItem => connection.type === "MongoDB"));
      })
      .catch((error) => {
        if (!cancelled) message.error(getErrorMessage(error));
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContextMenu(null);
    };
    document.addEventListener("click", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("click", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const activeConnections = useMemo(() => {
    if (subTab === "redis") return redisConnections;
    if (subTab === "mongodb") return mongoConnections;
    return sqlConnections;
  }, [mongoConnections, redisConnections, sqlConnections, subTab]);

  const filteredConnections = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    return activeConnections.filter((connection) => {
      const matchesServer =
        serverFilter === "all" ||
        String(connection.serverId) === serverFilter ||
        connection.server === serverFilter ||
        connection.server === `server-${serverFilter}` ||
        (server && connection.server.includes(server.alias) && serverFilter === String(server.id));
      const matchesQuery = !query || [connection.name, connection.server, connection.host, connection.type]
        .join(" ")
        .toLowerCase()
        .includes(query);
      return matchesServer && matchesQuery;
    });
  }, [activeConnections, filterText, server, serverFilter]);

  const selectedConnection = useMemo(
    () => activeConnections.find((connection) => connection.id === selectedConnectionId) ?? null,
    [activeConnections, selectedConnectionId],
  );

  const selectConnection = (connection: DbConnectionItem | RedisConnectionItem) => {
    setSelectedConnectionId(connection.id);
    setExpandedConnectionIds((current) => ({ ...current, [connection.id]: true }));
    if ("database" in connection) {
      setSelectedDb(connection.database ?? "");
      void handleLoadSqlDatabases(connection.id, true);
    }
  };

  const handleLoadSqlDatabases = async (
    connectionId: string,
    selectFirst = false,
    connectionOverride?: DbConnectionItem,
  ) => {
    setDatabaseLoading((current) => ({ ...current, [connectionId]: true }));
    try {
      const connection = connectionOverride ?? sqlConnections.find((item) => item.id === connectionId);
      const names = await databaseApi.listDatabases(Number(connectionId));
      const displayNames = connection?.type === "SQLite"
        ? names.map((name) => `${name} (${connection.host.split(/[\\/]/).filter(Boolean).pop() || connection.host})`)
        : names;
      setDatabaseOptions((current) => ({ ...current, [connectionId]: displayNames }));
      if (selectFirst && displayNames.length > 0) {
        setSelectedDb((current) => current && displayNames.includes(current) ? current : displayNames[0]);
        const firstDatabaseKey = `${connectionId}:${displayNames[0]}`;
        setExpandedDatabaseKeys((current) => ({ ...current, [firstDatabaseKey]: true }));
        void handleLoadDatabaseObjects(connectionId, displayNames[0]);
      }
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setDatabaseLoading((current) => ({ ...current, [connectionId]: false }));
    }
  };

  const handleLoadDatabaseObjects = async (connectionId: string, databaseName: string) => {
    const key = `${connectionId}:${databaseName}`;
    if (Object.prototype.hasOwnProperty.call(databaseObjects, key) || databaseObjectLoading[key]) return;

    setDatabaseObjectLoading((current) => ({ ...current, [key]: true }));
    try {
      const objects = await databaseApi.listTables(Number(connectionId), databaseName);
      setDatabaseObjects((current) => ({ ...current, [key]: objects }));
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setDatabaseObjectLoading((current) => ({ ...current, [key]: false }));
    }
  };

  const handleCreateTable = async () => {
    if (!selectedConnectionId || !selectedDb) return;
    try {
      const values = await createTableForm.validateFields();
      const tableName = String(values.name).trim();
      const columns = String(values.columns).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(tableName)) {
        throw new Error("表名只能包含字母、数字、下划线或 $，且不能以数字开头");
      }
      await databaseApi.query(Number(selectedConnectionId), `CREATE TABLE ${tableName} (${columns});`, selectedDb);
      message.success(`表 ${tableName} 已创建`);
      setCreateTableOpen(false);
      createTableForm.resetFields();
      const key = `${selectedConnectionId}:${selectedDb}`;
      setDatabaseObjects((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      await handleLoadDatabaseObjects(selectedConnectionId, selectedDb);
    } catch (error) {
      if (error && typeof error === "object" && "errorFields" in error) return;
      message.error(getErrorMessage(error));
    }
  };

  const handleRunSqlFile = async () => {
    if (!selectedConnectionId || !selectedDb) return;
    try {
      const selected = await openFile({
        title: "选择 SQL 文件",
        multiple: false,
        directory: false,
        filters: [{ name: "SQL 文件", extensions: ["sql", "txt"] }],
      });
      const path = Array.isArray(selected) ? selected[0] : selected;
      if (!path) return;
      const sql = await fileApi.readText(path);
      if (!sql.trim()) {
        message.warning("SQL 文件为空");
        return;
      }
      updateCurrentTabSql(sql);
      const result = await databaseApi.query(Number(selectedConnectionId), sql, selectedDb);
      setResultColumnNames(result.columns);
      setResultRows(result.rows.map((row) => Object.fromEntries(
        result.columns.map((column, index) => [column, row[index] ?? ""]),
      )));
      setExecStats({ affected: result.affectedRows, timeMs: result.timeMs });
      message.success(`SQL 文件执行完成，耗时 ${result.timeMs}ms`);
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const handleDumpDatabaseSql = async (connectionId: string, databaseName: string) => {
    try {
      const key = `${connectionId}:${databaseName}`;
      let objects = databaseObjects[key];
      if (!objects) {
        objects = await databaseApi.listTables(Number(connectionId), databaseName);
        setDatabaseObjects((current) => ({ ...current, [key]: objects ?? [] }));
      }
      const tables = objects.filter((item) => {
        const type = item.tableType.toLowerCase();
        return type === "table" || type === "base table" || type.includes("table");
      });
      if (tables.length === 0) {
        message.info("当前数据库没有可导出的表");
        return;
      }
      const definitions = await Promise.all(tables.map(async (table) => {
        try {
          return await databaseApi.tableDdl(Number(connectionId), databaseName, table.name);
        } catch {
          return `-- 无法读取表 ${table.name} 的结构`;
        }
      }));
      const path = await save({
        title: "导出数据库 SQL",
        defaultPath: `${databaseName}-schema.sql`,
        filters: [{ name: "SQL 文件", extensions: ["sql"] }],
      });
      if (!path) return;
      await fileApi.writeText(path, `-- Database: ${databaseName}\n\n${definitions.join("\n\n")}`);
      message.success(`数据库 SQL 已导出到 ${path}`);
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const handleDbContextAction = async (action: string) => {
    const current = contextMenu;
    setContextMenu(null);
    if (!current) return;
    const connectionId = current.connection.id;
    if (current.kind === "connection") {
      setSelectedConnectionId(connectionId);
      if (action === "reconnect") {
        try {
          await databaseApi.testSaved(Number(connectionId));
          await handleLoadSqlDatabases(connectionId, true);
          message.success("数据库连接已刷新");
        } catch (error) {
          message.error(getErrorMessage(error));
        }
      } else if (action === "test") {
        try {
          const result = await databaseApi.testSaved(Number(connectionId));
          if (!result.ok) throw new Error(result.message || "数据库连接测试失败");
          message.success(`连接测试成功${result.latencyMs == null ? "" : `，耗时 ${result.latencyMs}ms`}`);
        } catch (error) {
          message.error(getErrorMessage(error));
        }
      } else if (action === "edit") {
        handleEditDbConnection(current.connection);
      } else if (action === "copy") {
        try {
          await navigator.clipboard.writeText(current.connection.name);
          message.success("连接名称已复制");
        } catch (error) {
          message.error(getErrorMessage(error));
        }
      } else if (action === "delete") {
        handleDeleteConnection(current.connection);
      }
      return;
    }

    const databaseName = current.databaseName;
    if (!databaseName) return;
    setSelectedConnectionId(connectionId);
    setSelectedDb(databaseName);
    if (action === "search") {
      setSelectedTable(null);
      const engine = current.connection.type.toLowerCase();
      const searchSql = engine === "sqlite"
        ? "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name;"
        : engine === "oracle"
          ? "SELECT table_name FROM user_tables ORDER BY table_name;"
          : engine === "clickhouse"
            ? "SHOW TABLES;"
            : `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = '${databaseName}';`;
      updateCurrentTabSql(`-- 在数据库 ${databaseName} 中查询\n${searchSql}`);
      message.info("已将数据库搜索语句放入 SQL 编辑器");
    } else if (action === "createTable") {
      createTableForm.resetFields();
      setCreateTableOpen(true);
    } else if (action === "runSql") {
      await handleRunSqlFile();
    } else if (action === "dumpSql") {
      await handleDumpDatabaseSql(connectionId, databaseName);
    } else if (action === "tableList") {
      setSelectedTable(null);
      setTableColumns([]);
      await handleLoadDatabaseObjects(connectionId, databaseName);
      message.success(`已打开 ${databaseName} 的表清单`);
    } else if (action === "copy") {
      try {
        await navigator.clipboard.writeText(databaseName);
        message.success("数据库名称已复制");
      } catch (error) {
        message.error(getErrorMessage(error));
      }
    } else if (action === "refresh") {
      const key = `${connectionId}:${databaseName}`;
      setDatabaseObjects((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      await handleLoadDatabaseObjects(connectionId, databaseName);
      message.success("数据库对象已刷新");
    } else if (action === "delete") {
      if (current.connection.type === "SQLite") {
        message.warning("SQLite 不支持删除数据库节点，请直接管理数据库文件");
        return;
      }
      Modal.confirm({
        title: `删除数据库“${databaseName}”？`,
        content: "该操作会执行 DROP DATABASE，数据库中的表和数据将永久删除。",
        okText: "确认删除",
        okButtonProps: { danger: true },
        cancelText: "取消",
        onOk: async () => {
          try {
            await databaseApi.query(Number(connectionId), `DROP DATABASE ${databaseName};`, databaseName);
            setDatabaseOptions((current) => ({ ...current, [connectionId]: (current[connectionId] ?? []).filter((item) => item !== databaseName) }));
            setSelectedDb("");
            message.success(`数据库 ${databaseName} 已删除`);
          } catch (error) {
            message.error(getErrorMessage(error));
          }
        },
      });
    }
  };

  const handleSelectTable = async (connectionId: string, databaseName: string, table: DatabaseTableItem) => {
    const connection = sqlConnections.find((item) => item.id === connectionId);
    if (!connection || table.tableType.toLowerCase().includes("view") === false && table.tableType.toLowerCase() !== "table" && table.tableType.toLowerCase() !== "base table") {
      return;
    }
    setSelectedConnectionId(connectionId);
    setSelectedDb(databaseName);
    setSelectedTable(table);
    setTableColumns([]);
    setTableColumnsLoading(true);
    try {
      const columns = await databaseApi.listColumns(Number(connectionId), databaseName, table.name);
      setTableColumns(columns);
      updateCurrentTabSql(`SELECT * FROM ${table.name} LIMIT 100;`);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setTableColumnsLoading(false);
    }
  };

  const refreshSelectedTable = async () => {
    if (!selectedConnectionId || !selectedDb || !selectedTable) return;
    await handleSelectTable(selectedConnectionId, selectedDb, selectedTable);
  };

  const handleAddColumn = async () => {
    if (!selectedConnectionId || !selectedDb || !selectedTable) return;
    try {
      const values = await columnForm.validateFields();
      await databaseApi.addColumn({
        connectionId: Number(selectedConnectionId),
        databaseName: selectedDb,
        tableName: selectedTable.name,
        name: values.name.trim(),
        dataType: values.dataType.trim(),
        nullable: values.nullable !== false,
        defaultValue: values.defaultValue?.trim() || undefined,
      });
      message.success("字段已创建");
      setColumnModalOpen(false);
      columnForm.resetFields();
      await refreshSelectedTable();
    } catch (error) {
      if (error && typeof error === "object" && "errorFields" in error) return;
      message.error(getErrorMessage(error));
    }
  };

  const handleDropColumn = (column: DatabaseColumnItem) => {
    if (!selectedConnectionId || !selectedDb || !selectedTable) return;
    if (column.primaryKey) {
      message.warning("主键字段不能直接删除，请先调整表约束");
      return;
    }
    Modal.confirm({
      title: `删除字段“${column.name}”？`,
      content: "删除字段会直接修改远端表结构，请确认已备份数据。",
      okText: "删除字段",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await databaseApi.dropColumn(Number(selectedConnectionId), selectedDb, selectedTable.name, column.name);
          message.success("字段已删除");
          await refreshSelectedTable();
        } catch (error) {
          message.error(getErrorMessage(error));
        }
      },
    });
  };

  const handleExportTableCsv = async () => {
    if (!selectedConnectionId || !selectedDb || !selectedTable) return;
    try {
      const result = await databaseApi.query(Number(selectedConnectionId), `SELECT * FROM ${selectedTable.name};`, selectedDb);
      const escapeCsv = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
      const csv = [
        result.columns.map(escapeCsv).join(","),
        ...result.rows.map((row) => row.map(escapeCsv).join(",")),
      ].join("\n");
      const path = await save({
        title: "导出表 CSV",
        defaultPath: `${selectedTable.name}-${Date.now()}.csv`,
        filters: [{ name: "CSV 文件", extensions: ["csv"] }],
      });
      if (!path) return;
      await fileApi.writeText(path, `\uFEFF${csv}`);
      message.success(`CSV 已导出到 ${path}`);
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const handleExportTableSql = async () => {
    if (!selectedConnectionId || !selectedDb || !selectedTable) return;
    try {
      const ddl = await databaseApi.tableDdl(Number(selectedConnectionId), selectedDb, selectedTable.name);
      const path = await save({
        title: "导出表 SQL",
        defaultPath: `${selectedTable.name}-schema.sql`,
        filters: [{ name: "SQL 文件", extensions: ["sql"] }],
      });
      if (!path) return;
      await fileApi.writeText(path, ddl);
      message.success(`SQL 已导出到 ${path}`);
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const toggleDatabaseNode = (connection: DbConnectionItem, databaseName: string) => {
    const key = `${connection.id}:${databaseName}`;
    const nextExpanded = !expandedDatabaseKeys[key];
    setExpandedDatabaseKeys((current) => ({ ...current, [key]: nextExpanded }));
    setSelectedConnectionId(connection.id);
    setSelectedDb(databaseName);
    setSelectedTable(null);
    setTableColumns([]);
    if (nextExpanded) void handleLoadDatabaseObjects(connection.id, databaseName);
  };

  const toggleObjectGroup = (databaseKey: string, groupKey: string) => {
    const key = `${databaseKey}:${groupKey}`;
    setExpandedObjectGroupKeys((current) => ({ ...current, [key]: !current[key] }));
  };

  // 当前活跃标签的 SQL 内容
  const currentTab = sqlTabs.find((t) => t.id === activeTabId) || sqlTabs[0];
  const updateCurrentTabSql = (val: string) => {
    setSqlTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, sql: val } : t))
    );
  };

  const refreshSqlSuggestions = (sql: string, caret: number) => {
    const result = getSqlSuggestions(sql, caret, structureTables.map((table) => table.name));
    setSqlSuggestions(result.items);
    setSuggestingTable(result.tableContext);
    setActiveSqlSuggestion(0);
  };

  const applySqlSuggestion = (suggestion: string) => {
    const editor = sqlEditorRef.current;
    if (!editor) return;
    const caret = editor.selectionStart;
    const result = getSqlSuggestions(currentTab.sql, caret, structureTables.map((table) => table.name));
    const nextSql = `${currentTab.sql.slice(0, result.start)}${suggestion}${currentTab.sql.slice(caret)}`;
    const nextCaret = result.start + suggestion.length;
    updateCurrentTabSql(nextSql);
    setSqlSuggestions([]);
    requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const handleSqlEditorKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (sqlSuggestions.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveSqlSuggestion((current) => (current + direction + sqlSuggestions.length) % sqlSuggestions.length);
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      applySqlSuggestion(sqlSuggestions[activeSqlSuggestion]);
    } else if (event.key === "Escape") {
      setSqlSuggestions([]);
    }
  };

  // 添加新 SQL 标签
  const handleAddNewSqlTab = () => {
    const nextNum = sqlTabs.length + 1;
    const newId = String(Date.now());
    const newTab: SqlTabItem = {
      id: newId,
      title: `查询 ${nextNum}`,
      sql: "",
    };
    setSqlTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
    message.info(`已新建 [${newTab.title}] 工作区`);
  };

  // 关闭 SQL 标签
  const handleCloseSqlTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (sqlTabs.length <= 1) {
      message.warning("至少保留一个查询标签");
      return;
    }
    const nextTabs = sqlTabs.filter((t) => t.id !== id);
    setSqlTabs(nextTabs);
    if (activeTabId === id) {
      setActiveTabId(nextTabs[nextTabs.length - 1].id);
    }
  };

  // AI 生成 SQL
  const handleAiGenerate = () => {
    setAiGenerating(true);
    message.loading({ content: "🤖 AI 正在基于数据库 Schema 生成优化 SQL...", key: "aiGen" });
    setTimeout(() => {
      const promptLower = aiPrompt.toLowerCase();
      let generatedSql = "";
      if (promptLower.includes("用户") || promptLower.includes("状态")) {
        generatedSql =
          "-- AI 根据需求生成：统计各状态用户数量及活跃时间\nSELECT status, COUNT(*) AS user_count, MAX(last_login_time) AS latest_active\nFROM sys_users\nGROUP BY status\nORDER BY user_count DESC;";
      } else if (promptLower.includes("天") || promptLower.includes("订单")) {
        generatedSql =
          "-- AI 根据需求生成：按天聚合订单总量\nSELECT DATE(created_at) AS order_date, COUNT(*) AS total_orders, SUM(amount) AS total_revenue\nFROM sys_orders\nGROUP BY DATE(created_at)\nORDER BY order_date DESC LIMIT 30;";
      } else {
        generatedSql =
          "-- AI 生成优化 SQL\nSELECT id, username, email, role, status, created_at\nFROM sys_users\nORDER BY id DESC\nLIMIT 24;";
      }
      updateCurrentTabSql(generatedSql);
      setAiGenerating(false);
      message.success({ content: "✨ AI 已成功生成 SQL 脚本", key: "aiGen" });
    }, 600);
  };

  // 快捷试词点击
  const handleSetSample = (sql: string) => {
    updateCurrentTabSql(sql);
    message.info("已载入快捷 SQL 查询");
  };

  // 执行 SQL
  const handleExecuteSql = async () => {
    const sql = currentTab?.sql?.trim();
    if (!sql) {
      message.warning("⚠️ 请输入或由 AI 生成要执行的 SQL 语句");
      return;
    }
    if (!selectedConnection) {
      message.warning("请先在左侧连接树选择数据库连接");
      return;
    }
    if (!selectedDb) {
      message.warning("请先选择要执行的数据库");
      return;
    }
    setQueryHistory((current) => [
      { sql, createdAt: new Date().toLocaleString() },
      ...current,
    ].slice(0, 50));
    setExecuting(true);
    try {
      const result = await databaseApi.query(Number(selectedConnection.id), sql, selectedDb);
      const rows = result.rows.map((row) => Object.fromEntries(
        result.columns.map((column, index) => [column, row[index] ?? ""]),
      ));
      setResultColumnNames(result.columns);
      setResultRows(rows);
      setExecStats({ affected: result.affectedRows, timeMs: result.timeMs });
      message.success(`SQL 执行成功，返回 ${result.rows.length} 行（耗时 ${result.timeMs}ms）`);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setExecuting(false);
    }
  };

  // 解释 SQL 执行计划：通过远端数据库的 EXPLAIN 返回真实结果。
  const handleExplainSql = async () => {
    const sql = currentTab?.sql?.trim();
    if (!sql) {
      message.warning("⚠️ 请输入要分析解释的 SQL 语句");
      return;
    }
    if (!selectedConnection || selectedConnection.type === "Redis" || selectedConnection.type === "MongoDB") {
      message.warning("请先选择 SQL 数据库连接");
      return;
    }
    if (!selectedDb) {
      message.warning("请先选择要执行的数据库");
      return;
    }
    setExecuting(true);
    try {
      const explainSql = /^\s*explain\b/i.test(sql) ? sql : `EXPLAIN ${sql}`;
      const result = await databaseApi.query(Number(selectedConnection.id), explainSql, selectedDb);
      setResultColumnNames(result.columns);
      setResultRows(result.rows.map((row) => Object.fromEntries(
        result.columns.map((column, index) => [column, row[index] ?? ""]),
      )));
      setExecStats({ affected: result.affectedRows, timeMs: result.timeMs });
      message.success(`EXPLAIN 已完成（${result.timeMs}ms）`);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setExecuting(false);
    }
  };

  // 清空编辑器
  const handleClearSql = () => {
    updateCurrentTabSql("");
    setResultRows(null);
    setResultColumnNames([]);
    setExecStats(null);
    message.info("SQL 编辑器已清空");
  };

  // 打开新建 DB 凭据弹窗
  const handleOpenDbModal = (presetType = "MySQL") => {
    setEditingConnection(null);
    setEditingRedisConnection(null);
    setRedisModalOpen(false);
    const defaultServerId = server?.id ?? availableServers[0]?.id;
    setDbFormInitialValues({
      server: presetType === "SQLite" ? "local" : defaultServerId ? `server-${defaultServerId}` : undefined,
      type: presetType,
      aiTier: "default",
      port: presetType === "SQLite" ? "" : presetType === "PostgreSQL" ? "5432" : presetType === "MongoDB" ? "27017" : presetType === "Oracle" ? "1521" : presetType === "Microsoft SQL Server" ? "1433" : "3306",
      host: presetType === "SQLite" ? "" : "127.0.0.1",
      sqlitePath: "",
    });
    setDbFormKey((key) => key + 1);
    setDbProdProtect(false);
    setDbSshTunnel(presetType !== "SQLite");
    setDbPasswordVisible(false);
    setDbValidationFailed(false);
    setDbModalOpen(true);
  };

  const handleEditDbConnection = (connection: DbConnectionItem | RedisConnectionItem) => {
    if ("dbIndex" in connection) {
      setEditingConnection(null);
      setEditingRedisConnection(connection);
      setDbModalOpen(false);
      setRedisFormInitialValues({
        name: connection.name,
        server: `server-${connection.serverId}`,
        type: "Redis",
        aiTier: connection.aiTier,
        host: connection.host,
        port: connection.port,
        dbIndex: connection.dbIndex,
        password: "",
        prodDbList: connection.prodDbList,
      });
      setRedisFormKey((key) => key + 1);
      setRedisProdProtect(connection.isProdProtect);
      setRedisSshTunnel(connection.sshTunnel);
      setRedisPasswordVisible(false);
      setRedisValidationFailed(false);
      setRedisModalOpen(true);
      return;
    }
    setEditingRedisConnection(null);
    setEditingConnection(connection);
    setRedisModalOpen(false);
    setDbFormInitialValues({
      name: connection.name,
      server: connection.serverId === 0 ? "local" : `server-${connection.serverId}`,
      type: connection.type,
      aiTier: connection.aiTier,
      host: connection.type === "SQLite" ? "" : connection.host,
      sqlitePath: connection.type === "SQLite" ? connection.host : "",
      port: connection.port,
      user: connection.user,
      database: connection.database,
      password: "",
      prodDatabases: connection.prodDatabases,
    });
    setDbFormKey((key) => key + 1);
    setDbProdProtect(connection.isProdProtect);
    setDbSshTunnel(
      connection.sshTunnel || (connection.serverId > 0 && isLoopbackHost(connection.host)),
    );
    setDbPasswordVisible(false);
    setDbValidationFailed(false);
    setDbModalOpen(true);
  };

  // 测试 DB 连接
  const handleTestDbConn = async () => {
    try {
      const values = await dbForm.validateFields();
      const isSqlite = values.type === "SQLite";
      const serverId = isSqlite ? 0 : Number(String(values.server ?? "").replace("server-", ""));
      if (!isSqlite && (!Number.isInteger(serverId) || serverId <= 0)) throw new Error("请选择 SSH 服务器");
      if (isSqlite && !values.sqlitePath?.trim()) throw new Error("请选择 SQLite 数据库文件路径");
      setTestDbLoading(true);
      const probe = await databaseApi.testDraft({
        connectionId: editingConnection ? Number(editingConnection.id) : undefined,
        name: values.name || "临时连接",
        serverId,
        engine: values.type || "MySQL",
        host: isSqlite ? values.sqlitePath.trim() : values.host || "127.0.0.1",
        port: isSqlite ? 0 : Number(values.port || 3306),
        username: isSqlite ? "" : values.user || "root",
        databaseName: values.database || "",
        password: isSqlite ? undefined : values.password || undefined,
        isProdProtect: dbProdProtect,
        prodDatabases: values.prodDatabases || "",
        sshTunnel: isSqlite ? false : dbSshTunnel,
        aiTier: values.aiTier || "default",
      });
      if (!probe.ok) throw new Error(probe.message || "数据库连接失败");
      message.success(`连接测试成功（${probe.latencyMs ?? 0}ms）`);
      return;
    } catch (error) {
      message.error(getErrorMessage(error));
      return;
    } finally {
      setTestDbLoading(false);
    }
  };

  // 保存 DB 凭据
  const handleSaveDbCredential = async () => {
    try {
      const values = await dbForm.validateFields();
      const isSqlite = values.type === "SQLite";
      const serverId = isSqlite ? 0 : Number(String(values.server ?? "").replace("server-", ""));
      if (!isSqlite && (!Number.isInteger(serverId) || serverId <= 0)) throw new Error("请选择 SSH 服务器");
      if (isSqlite && !values.sqlitePath?.trim()) throw new Error("请选择 SQLite 数据库文件路径");
      const input = {
        connectionId: editingConnection ? Number(editingConnection.id) : undefined,
        name: values.name?.trim() || "",
        serverId,
        engine: values.type || "MySQL",
        host: isSqlite ? values.sqlitePath.trim() : values.host || "127.0.0.1",
        port: isSqlite ? 0 : Number(values.port || 3306),
        username: isSqlite ? "" : values.user || "root",
        databaseName: values.database || "",
        password: isSqlite ? undefined : values.password || undefined,
        isProdProtect: dbProdProtect,
        prodDatabases: values.prodDatabases || "",
        sshTunnel: isSqlite ? false : dbSshTunnel,
        aiTier: values.aiTier || "default",
      };
      const created = editingConnection
        ? await databaseApi.update(Number(editingConnection.id), input)
        : await databaseApi.create(input);
      const mapped = mapConnection(created);
      const replaceOrAppend = (items: DbConnectionItem[]) => editingConnection
        ? items.map((item) => item.id === mapped.id ? mapped as DbConnectionItem : item)
        : [...items, mapped as DbConnectionItem];
      if (mapped.type === "MongoDB") setMongoConnections(replaceOrAppend);
      else setSqlConnections(replaceOrAppend);
      setSelectedConnectionId(mapped.id);
      setSelectedDb("database" in mapped ? mapped.database || "" : "");
      setExpandedConnectionIds((current) => ({ ...current, [mapped.id]: true }));
      if (mapped.type !== "MongoDB") void handleLoadSqlDatabases(mapped.id, true, mapped as DbConnectionItem);
      setDbModalOpen(false);
      setEditingConnection(null);
      message.success(isSqlite
        ? editingConnection ? "SQLite 连接已更新" : "SQLite 本机文件连接已保存"
        : editingConnection ? "数据库连接已更新" : "数据库连接已保存，密码已写入系统凭据管理器");
      return;
    } catch (error) {
      setDbValidationFailed(true);
      message.error(getErrorMessage(error));
      return;
    }
    /*
      const values = await dbForm.validateFields();
      if (!values.name?.trim()) {
        setDbValidationFailed(true);
        return;
      }
      setDbValidationFailed(false);

      const newItem: DbConnectionItem = {
        id: String(Date.now()),
        name: values.name.trim(),
        server: values.server || "💻 我的香草云 · 156.226.177.226:22000",
        type: values.type || "MySQL",
        host: values.host || "127.0.0.1",
        port: values.port || "3306",
        user: values.user || "root",
        database: values.database,
        isProdProtect: dbProdProtect,
        prodDatabases: values.prodDatabases,
        sshTunnel: dbSshTunnel,
        aiTier: values.aiTier || "default",
        createdAt: new Date().toLocaleString(),
      };

      if (newItem.type === "MongoDB") {
        setMongoConnections((prev) => [...prev, newItem]);
      } else {
        setSqlConnections((prev) => [...prev, newItem]);
        setSelectedDb(newItem.database || "db_ops_production");
      }

      setSelectedConnectionId(newItem.id);
      setExpandedConnectionIds((current) => ({ ...current, [newItem.id]: true }));

      setDbModalOpen(false);
      message.success("✅ 数据库凭据已安全落库 (AES-256-GCM 硬件加密)");
    } catch {
      setDbValidationFailed(true);
    }
  };

  // 打开新建 Redis 连接弹窗
    */
  };

  const handleOpenRedisModal = () => {
    setEditingRedisConnection(null);
    setEditingConnection(null);
    setDbModalOpen(false);
    const defaultServerId = server?.id ?? availableServers[0]?.id;
    setRedisFormInitialValues({
      server: defaultServerId ? `server-${defaultServerId}` : undefined,
      type: "Redis",
      aiTier: "default",
      port: "6379",
      dbIndex: "0",
    });
    setRedisFormKey((key) => key + 1);
    setRedisProdProtect(false);
    setRedisSshTunnel(false);
    setRedisPasswordVisible(false);
    setRedisValidationFailed(false);
    setRedisModalOpen(true);
  };

  // 测试 Redis 连接
  const handleTestRedisConn = async () => {
    try {
      const values = await redisForm.validateFields();
      const serverId = Number(String(values.server ?? "").replace("server-", ""));
      if (!Number.isInteger(serverId) || serverId <= 0) throw new Error("请选择 SSH 服务器");
      setTestRedisLoading(true);
      const probe = await databaseApi.testDraft({
        name: values.name || "临时 Redis",
        serverId,
        engine: "redis",
        host: values.host || "127.0.0.1",
        port: Number(values.port || 6379),
        dbIndex: Number(values.dbIndex || 0),
        password: values.password || undefined,
        isProdProtect: redisProdProtect,
        prodDbList: values.prodDbList || "",
        sshTunnel: redisSshTunnel,
        aiTier: values.aiTier || "default",
      });
      if (!probe.ok) throw new Error(probe.message || "Redis 连接失败");
      message.success(`Redis PONG（${probe.latencyMs ?? 0}ms）`);
      return;
    } catch (error) {
      message.error(getErrorMessage(error));
      return;
    } finally {
      setTestRedisLoading(false);
    }
  };

  // 保存 Redis 连接
  const handleSaveRedisConn = async () => {
    try {
      const values = await redisForm.validateFields();
      const serverId = Number(String(values.server ?? "").replace("server-", ""));
      if (!Number.isInteger(serverId) || serverId <= 0) throw new Error("请选择 SSH 服务器");
      const input = {
        connectionId: editingRedisConnection ? Number(editingRedisConnection.id) : undefined,
        name: values.name?.trim() || "",
        serverId,
        engine: "redis",
        host: values.host || "127.0.0.1",
        port: Number(values.port || 6379),
        dbIndex: Number(values.dbIndex || 0),
        password: values.password || undefined,
        isProdProtect: redisProdProtect,
        prodDbList: values.prodDbList || "",
        sshTunnel: redisSshTunnel,
        aiTier: values.aiTier || "default",
      };
      const created = editingRedisConnection
        ? await databaseApi.update(Number(editingRedisConnection.id), input)
        : await databaseApi.create(input);
      const mapped = mapConnection(created) as RedisConnectionItem;
      setRedisConnections((prev) => editingRedisConnection
        ? prev.map((item) => item.id === mapped.id ? mapped : item)
        : [...prev, mapped]);
      setSelectedConnectionId(mapped.id);
      setRedisModalOpen(false);
      setEditingRedisConnection(null);
      message.success(`Redis 连接 [${mapped.name}] 保存成功`);
      return;
    } catch (error) {
      setRedisValidationFailed(true);
      message.error(getErrorMessage(error));
      return;
    }
    /*
      const values = await redisForm.validateFields();
      if (!values.name?.trim()) {
        setRedisValidationFailed(true);
        return;
      }
      setRedisValidationFailed(false);

      const newItem: RedisConnectionItem = {
        id: String(Date.now()),
        name: values.name.trim(),
        server: values.server || "💻 我的香草云 · 156.226.177.226:22000",
        type: "Redis",
        host: values.host || "127.0.0.1",
        port: values.port || "6379",
        dbIndex: values.dbIndex || "0",
        isProdProtect: redisProdProtect,
        prodDbList: values.prodDbList,
        sshTunnel: redisSshTunnel,
        aiTier: values.aiTier || "default",
        createdAt: new Date().toLocaleString(),
      };

      setRedisConnections((prev) => [...prev, newItem]);
      setSelectedConnectionId(newItem.id);
      setRedisModalOpen(false);
      message.success(`✅ Redis 连接 [${newItem.name}] 保存成功`);
    } catch {
      setRedisValidationFailed(true);
    }
  };

  // 顶部通用新建连接按键
    */
  };

  const handleDeleteConnection = (connection: DbConnectionItem | RedisConnectionItem) => {
    Modal.confirm({
      title: "删除数据库连接？",
      content: `将删除连接“${connection.name}”，系统凭据也会一并移除。`,
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await databaseApi.remove(Number(connection.id));
          setSqlConnections((items) => items.filter((item) => item.id !== connection.id));
          setRedisConnections((items) => items.filter((item) => item.id !== connection.id));
          setMongoConnections((items) => items.filter((item) => item.id !== connection.id));
          if (selectedConnectionId === connection.id) {
            setSelectedConnectionId(null);
            setRedisKeys([]);
            setMongoCollections([]);
            setMongoDocuments([]);
          }
          message.success("数据库连接已删除");
        } catch (error) {
          message.error(getErrorMessage(error));
        }
      },
    });
  };

  const handleProbeSelectedConnection = async () => {
    if (!selectedConnection) {
      message.warning("请先在左侧连接树选择连接");
      return;
    }
    setExecuting(true);
    try {
      const probe = await databaseApi.testSaved(Number(selectedConnection.id));
      if (!probe.ok) throw new Error(probe.message || "数据库连接失败");
      if (selectedConnection.type === "Redis") {
        const keys = await databaseApi.redisKeys(Number(selectedConnection.id), redisPattern);
        setRedisKeys(keys);
        setRedisValue(null);
      } else if (selectedConnection.type === "MongoDB") {
        setMongoCollections(await databaseApi.mongoCollections(Number(selectedConnection.id)));
        setMongoDocuments([]);
      }
      message.success(`${selectedConnection.type} 连接测试成功`);
      return;
      /*
      const command = selectedConnection.type === "Redis"
        ? `redis-cli -h ${selectedConnection.host} -p ${selectedConnection.port} PING`
        : `mongosh --quiet --host ${selectedConnection.host}:${selectedConnection.port} --eval "db.runCommand({ ping: 1 }).ok"`;
      const result = await runCommand(command);
      if (result.exitCode !== 0) {
        throw new Error(result.stderr || "数据库探测失败");
      }
      message.success(`${selectedConnection.type} 连接测试成功`);
      */
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setExecuting(false);
    }
  };

  const handleLoadRedisKeys = async () => {
    if (!selectedConnection || selectedConnection.type !== "Redis") return;
    setExecuting(true);
    try {
      setRedisKeys(await databaseApi.redisKeys(Number(selectedConnection.id), redisPattern));
      setRedisValue(null);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setExecuting(false);
    }
  };

  const handleReadRedisValue = async (key: string) => {
    if (!selectedConnection || selectedConnection.type !== "Redis") return;
    try {
      setRedisValue(await databaseApi.redisValue(Number(selectedConnection.id), key));
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const handleLoadMongoCollections = async () => {
    if (!selectedConnection || selectedConnection.type !== "MongoDB") return;
    setExecuting(true);
    try {
      setMongoCollections(await databaseApi.mongoCollections(Number(selectedConnection.id)));
      setMongoDocuments([]);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setExecuting(false);
    }
  };

  const handleReadMongoCollection = async (collection: string) => {
    if (!selectedConnection || selectedConnection.type !== "MongoDB") return;
    try {
      const raw = await databaseApi.mongoQuery(Number(selectedConnection.id), collection);
      const parsed: unknown = JSON.parse(raw || "[]");
      if (!Array.isArray(parsed)) throw new Error("MongoDB 返回的数据格式无效");
      setMongoDocuments(parsed.map((document) => {
        if (!document || typeof document !== "object") return { value: String(document) };
        return Object.fromEntries(Object.entries(document).map(([key, value]) => [
          key,
          typeof value === "string" ? value : JSON.stringify(value),
        ]));
      }));
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  // 查询结果按服务端返回的列名动态生成，避免把结果强行映射成演示用户表。
  const resultColumns = resultColumnNames.map((column) => ({
    title: column,
    dataIndex: column,
    key: column,
    render: (value: string) => <span className="font-mono text-slate-300">{value ?? ""}</span>,
  }));

  const handleExportCsv = async () => {
    if (!resultRows?.length) return;
    const headers = resultColumnNames;
    const escapeCsv = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = [
      headers.join(","),
      ...resultRows.map((row) => headers.map((header) => escapeCsv(row[header])).join(",")),
    ].join("\n");
    try {
      const path = await save({
        title: "导出查询结果",
        defaultPath: `query-result-${Date.now()}.csv`,
        filters: [{ name: "CSV 文件", extensions: ["csv"] }],
      });
      if (!path) return;
      await fileApi.writeText(path, `\uFEFF${csv}`);
      message.success(`CSV 已导出到 ${path}`);
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const handleCopyJson = async () => {
    if (!resultRows?.length) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(resultRows, null, 2));
      message.success("结果集 JSON 已复制");
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  const handleShowStructure = async () => {
    if (!selectedConnection || selectedConnection.type === "Redis" || selectedConnection.type === "MongoDB") {
      message.warning("请先选择 SQL 数据库连接");
      return;
    }
    if (!selectedDb) {
      message.warning("请先选择要查看结构的数据库");
      return;
    }
    setStructureLoading(true);
    setStructureOpen(true);
    try {
      setStructureTables(await databaseApi.listTables(Number(selectedConnection.id), selectedDb));
    } catch (error) {
      setStructureOpen(false);
      message.error(getErrorMessage(error));
    } finally {
      setStructureLoading(false);
    }
  };

  const handleTopExport = () => {
    if (!resultRows?.length) {
      message.info("请先执行查询，再导出结果集");
      return;
    }
    void handleExportCsv();
  };

  const hasActiveConnection = Boolean(
    selectedConnection && ("dbIndex" in selectedConnection || selectedConnection.type === "MongoDB" || selectedDb),
  );
  const selectedDatabaseTables = selectedConnectionId && selectedDb
    ? (databaseObjects[`${selectedConnectionId}:${selectedDb}`] ?? []).filter((item) => {
      const type = item.tableType.trim().toLowerCase();
      return type === "table" || type === "base table" || type.includes("table");
    })
    : [];

  return (
    <div className="h-full min-h-0 flex flex-col gap-2.5 overflow-hidden select-none">
      {/* 顶部横条工具栏 (截图 1) */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          {/* 子标签按钮组 */}
          <div className="flex items-center space-x-1 p-0.5 rounded-lg bg-surface-950 border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setSubTab("sql")}
              className={`px-3 py-1 rounded font-medium flex items-center space-x-1.5 transition cursor-pointer ${
                subTab === "sql" ? "bg-surface-800 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              <Database className={`w-3.5 h-3.5 ${subTab === "sql" ? "text-teal-400" : ""}`} />
              <span>SQL 数据库</span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab("redis")}
              className={`px-3 py-1 rounded font-medium flex items-center space-x-1.5 transition cursor-pointer ${
                subTab === "redis" ? "bg-surface-800 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              <Key className={`w-3.5 h-3.5 ${subTab === "redis" ? "text-teal-400" : ""}`} />
              <span>Redis</span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab("mongodb")}
              className={`px-3 py-1 rounded font-medium flex items-center space-x-1.5 transition cursor-pointer ${
                subTab === "mongodb" ? "bg-surface-800 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              <Leaf className={`w-3.5 h-3.5 ${subTab === "mongodb" ? "text-teal-400" : ""}`} />
              <span>MongoDB</span>
            </button>
          </div>

        </div>

        {/* 右侧服务器筛选 */}
        <div className="flex items-center space-x-2 text-xs">
          <select
            value={serverFilter}
            onChange={(event) => setServerFilter(event.target.value)}
            className="bg-surface-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-teal-500 cursor-pointer"
          >
            <option value="all">全部服务器</option>
            {sqlConnections.some((connection) => connection.serverId === 0) && <option value="0">本机</option>}
            {Object.entries(serverNames).map(([id, alias]) => (
              <option key={id} value={id}>{alias}{availableServers.find((item) => String(item.id) === id) ? ` (${availableServers.find((item) => String(item.id) === id)?.hostname})` : ""}</option>
            ))}
            {server && !serverNames[server.id] && <option value={String(server.id)}>{server.alias} ({server.hostname})</option>}
          </select>
        </div>
      </div>

      {/* 当前连接状态栏：连接树未选中时保持原型中的引导提示 */}
      <div className="flex items-center justify-between px-1 text-xs shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {hasActiveConnection && selectedConnection ? (
            <>
              <span className={`font-medium truncate ${selectedConnection.type === "Redis" ? "text-rose-400" : selectedConnection.type === "MongoDB" ? "text-emerald-400" : "text-teal-400"}`}>
                {displayEngineName(selectedConnection.type)} @ {selectedConnection.server}
              </span>
              <span className="text-slate-500 mx-1">/</span>
              <span className="text-slate-200 font-medium truncate">
                {"dbIndex" in selectedConnection ? `DB${selectedConnection.dbIndex}` : selectedConnection.type === "MongoDB" ? (selectedConnection.database || "admin") : (selectedDb || "未选库")}
              </span>
              {selectedConnection.type !== "Redis" && selectedConnection.type !== "MongoDB" && (
                <div className="flex items-center gap-2 ml-1">
                  <button
                    type="button"
                    onClick={() => void handleShowStructure()}
                    className="px-2.5 py-1 rounded bg-surface-900 hover:bg-surface-800 text-slate-300 border border-slate-800 flex items-center gap-1 transition"
                  >
                    <Table2 className="w-3.5 h-3.5 text-slate-400" />
                    <span>结构</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleTopExport}
                    className="px-2.5 py-1 rounded bg-surface-900 hover:bg-surface-800 text-slate-300 border border-slate-800 flex items-center gap-1 transition"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-400" />
                    <span>导出</span>
                  </button>
                </div>
              )}
            </>
          ) : (
            <span className="text-slate-400">← 在左侧连接树选择连接</span>
          )}
        </div>

        {/* 历史与片段按钮 */}
        <div className="flex items-center space-x-1.5 text-xs shrink-0">
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="px-2.5 py-1 rounded-lg bg-surface-900 hover:bg-surface-800 text-slate-300 hover:text-white border border-slate-800 flex items-center space-x-1.5 transition cursor-pointer"
          >
            <History className="w-3.5 h-3.5" />
            <span>历史</span>
          </button>
          <button
            type="button"
            onClick={() => setSnippetsOpen(true)}
            className="px-2.5 py-1 rounded-lg bg-surface-900 hover:bg-surface-800 text-slate-300 hover:text-white border border-slate-800 flex items-center space-x-1.5 transition cursor-pointer"
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>片段</span>
          </button>
        </div>
      </div>

      {/* 视图 1: SQL 数据库 (截图 1) */}
      {subTab === "sql" && (
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-4 gap-3 overflow-hidden">
          {/* 左栏：连接树 */}
          <div className="md:col-span-1 glass-card p-3 rounded-xl border border-slate-800 bg-surface-950/60 flex flex-col min-h-0 overflow-hidden space-y-2.5">
            <button
              type="button"
              onClick={() => handleOpenDbModal("MySQL")}
              className="w-full flex items-center justify-center space-x-1.5 py-1.5 rounded-lg bg-surface-900 hover:bg-surface-800 text-slate-300 text-xs border border-slate-700/80 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新建连接</span>
            </button>
            <div className="relative">
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="过滤库 / 表 / 对象"
                className="w-full bg-surface-900 border border-slate-800 rounded-lg pl-7 pr-2.5 py-1 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-teal-500 transition"
              />
              <Search className="w-3 h-3 text-slate-500 absolute left-2 top-2 pointer-events-none" />
            </div>
            <div className="px-1 text-[10px] leading-relaxed text-slate-500">
              支持按连接名、服务器、主机和数据库类型实时过滤
            </div>

            {/* 当没有连接时的空状态展示 (截图 1 严格对齐) */}
            {filteredConnections.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center space-y-3 py-14 text-center">
                <div className="w-12 h-12 rounded-xl bg-surface-900/90 border border-slate-800 flex items-center justify-center text-slate-500 shadow-inner">
                  <Inbox className="w-6 h-6" />
                </div>
                <span className="text-xs text-slate-500 font-medium">还没有连接</span>
                <button
                  type="button"
                  onClick={() => handleOpenDbModal("MySQL")}
                  className="flex items-center space-x-1 px-3 py-1 rounded-lg bg-teal-500/20 text-teal-300 border border-teal-500/40 text-xs font-medium hover:bg-teal-500/30 transition cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>新建连接</span>
                </button>
              </div>
            ) : (
              /* 连接树列表 */
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-1.5 text-xs">
                {filteredConnections.map((conn) => {
                  const sqlConnection = conn as DbConnectionItem;
                  const isSelected = selectedConnectionId === conn.id;
                  const isExpanded = Boolean(expandedConnectionIds[conn.id]);
                  const connectionDatabases = databaseOptions[conn.id] ?? [];
                  return (
                  <div
                    key={conn.id}
                    className={`rounded-lg border overflow-hidden transition ${isSelected ? "border-teal-500/50 bg-teal-500/10" : "border-slate-800 bg-surface-900/40"}`}
                  >
                    <div
                      className="flex items-center gap-1.5 p-2 hover:bg-surface-800/60 cursor-pointer transition select-none"
                      onClick={() => selectConnection(conn)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setSelectedConnectionId(conn.id);
                        setContextMenu({ kind: "connection", connection: sqlConnection, x: event.clientX, y: event.clientY });
                      }}
                    >
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setExpandedConnectionIds((current) => ({ ...current, [conn.id]: !current[conn.id] }));
                          if (!isExpanded) void handleLoadSqlDatabases(conn.id);
                        }}
                        className="shrink-0 text-slate-500 hover:text-slate-200"
                        aria-label={expandedConnectionIds[conn.id] ? "收起连接" : "展开连接"}
                      >
                          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                      </button>
                      {conn.type === "SQLite" ? <div className="w-5 h-5 rounded-md border border-sky-400/50 bg-sky-500/10 text-sky-300 flex items-center justify-center text-[9px] font-bold shrink-0">S</div> : <Database className={`w-4 h-4 shrink-0 ${conn.type === "PostgreSQL" ? "text-indigo-400" : conn.type === "Oracle" ? "text-rose-400" : conn.type === "Microsoft SQL Server" ? "text-blue-400" : "text-amber-400"}`} />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-medium truncate text-slate-200 text-xs">{conn.name || `${displayEngineName(conn.type)} @ ${conn.server}`}</span>
                          <span className="shrink-0 rounded border border-slate-700 bg-surface-950/70 px-1 py-0.5 font-mono text-[9px] text-slate-500">{displayEngineName(conn.type)}</span>
                        </div>
                        <div className="mt-0.5 truncate font-mono text-[10px] text-slate-500" title={`${conn.server} · ${conn.host}:${conn.port}`}>
                          {conn.server} · {conn.type === "SQLite" ? conn.host : `${conn.host}:${conn.port}`}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {conn.sshTunnel && <span className="rounded border border-cyan-500/20 bg-cyan-500/10 px-1 py-0.5 text-[9px] text-cyan-300">SSH</span>}
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" title="已保存连接" />
                      </div>
                      <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); setDetailConnection(conn); }}
                        className="ml-1 px-1 text-slate-500 hover:text-teal-300"
                        aria-label="查看连接详情"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); handleEditDbConnection(conn); }}
                        className="px-1 text-slate-500 hover:text-blue-300"
                        aria-label="编辑连接"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); handleDeleteConnection(conn); }}
                        className="ml-2 px-1 text-slate-600 hover:text-rose-400"
                        aria-label="删除连接"
                      >
                        ×
                      </button>
                    </div>
                    {isExpanded && <div className="border-t border-slate-800/60 bg-surface-950/40 px-2 pb-2 pt-1.5 text-slate-400 text-[11px]">
                      {connectionDatabases.map((databaseName) => {
                        const databaseKey = `${conn.id}:${databaseName}`;
                        const isDatabaseExpanded = Boolean(expandedDatabaseKeys[databaseKey]);
                        const objects = databaseObjects[databaseKey] ?? [];
                        const objectGroups = groupDatabaseObjects(objects);
                        return (
                          <div key={databaseName} className="rounded-md">
                            <button
                              type="button"
                              className={`flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left transition hover:bg-surface-800/80 ${selectedDb === databaseName && selectedConnectionId === conn.id ? "bg-teal-500/10 text-teal-200" : "text-slate-300"}`}
                              onClick={() => toggleDatabaseNode(sqlConnection, databaseName)}
                              onContextMenu={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setSelectedConnectionId(conn.id);
                                setSelectedDb(databaseName);
                                setContextMenu({ kind: "database", connection: sqlConnection, databaseName, x: event.clientX, y: event.clientY });
                              }}
                            >
                              <ChevronRight className={`h-3 w-3 shrink-0 text-slate-500 transition-transform ${isDatabaseExpanded ? "rotate-90" : ""}`} />
                              <Folder className="h-3.5 w-3.5 shrink-0 text-teal-400" />
                              <span className="min-w-0 flex-1 truncate">{databaseDisplayName(sqlConnection, databaseName)}</span>
                            </button>
                            {isDatabaseExpanded && (
                              <div className="ml-5 border-l border-teal-500/20 pl-2">
                                {databaseObjectLoading[databaseKey] && <div className="px-1.5 py-1 text-[10px] text-slate-500">正在加载表和视图…</div>}
                                {!databaseObjectLoading[databaseKey] && objectGroups.length === 0 && (
                                  <button type="button" onClick={() => void handleLoadDatabaseObjects(conn.id, databaseName)} className="px-1.5 py-1 text-[10px] text-slate-500 hover:text-teal-300">暂无对象，点击重新加载</button>
                                )}
                                {objectGroups.map((group) => {
                                  const groupKey = `${databaseKey}:${group.key}`;
                                  const isGroupExpanded = Boolean(expandedObjectGroupKeys[groupKey]);
                                  const groupIcon = group.key === "view"
                                    ? <Eye className="h-3.5 w-3.5 text-amber-400" />
                                    : group.key === "table"
                                      ? <Table2 className="h-3.5 w-3.5 text-blue-400" />
                                      : group.key === "procedure"
                                        ? <Settings2 className="h-3.5 w-3.5 text-cyan-400" />
                                        : <GitMerge className="h-3.5 w-3.5 text-emerald-400" />;
                                  return (
                                    <div key={group.key} className="mb-0.5 last:mb-0">
                                      <button
                                        type="button"
                                        onClick={() => toggleObjectGroup(databaseKey, group.key)}
                                        className="flex w-full items-center justify-between rounded px-1.5 py-1.5 text-left text-[10px] text-slate-300 transition hover:bg-surface-800/80 hover:text-white"
                                      >
                                        <span className="flex min-w-0 items-center gap-1.5">
                                          <ChevronRight className={`h-3 w-3 shrink-0 text-slate-500 transition-transform ${isGroupExpanded ? "rotate-90" : ""}`} />
                                          {groupIcon}
                                          <span>{group.label}</span>
                                        </span>
                                      </button>
                                      {isGroupExpanded && (
                                        <div className="ml-4 border-l border-slate-700/50 pl-1.5">
                                          {group.items.length === 0 && <div className="px-1.5 py-1 text-[10px] text-slate-600">暂无对象</div>}
                                          {group.items.map((item) => (
                                            <button
                                              key={`${group.key}-${item.name}`}
                                              type="button"
                                              className="flex w-full items-center justify-between rounded px-1.5 py-1 text-left text-[10px] text-slate-500 transition hover:bg-surface-800/80 hover:text-teal-300"
                                              onClick={() => void handleSelectTable(conn.id, databaseName, item)}
                                            >
                                              <span className="flex min-w-0 items-center gap-1.5 truncate">
                                                {group.key === "view" ? <Eye className="h-3 w-3 shrink-0 text-amber-400" /> : group.key === "procedure" ? <Settings2 className="h-3 w-3 shrink-0 text-cyan-400" /> : <Table2 className="h-3 w-3 shrink-0 text-blue-400" />}
                                                <span className="truncate">{item.name}</span>
                                              </span>
                                              <span className="ml-2 shrink-0 font-mono text-[9px] text-slate-600">{item.tableType}</span>
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {databaseLoading[conn.id] && <div className="py-1 text-slate-500">正在加载数据库…</div>}
                      {!databaseLoading[conn.id] && (databaseOptions[conn.id] ?? []).length === 0 && (
                        <button type="button" onClick={() => void handleLoadSqlDatabases(conn.id)} className="py-1 text-slate-500 hover:text-teal-300">加载数据库列表</button>
                      )}
                    </div>}
                  </div>
                );
                })}
              </div>
            )}
          </div>

          {/* 右栏：SQL 查询编辑器与 AI 辅助 */}
          <div className="md:col-span-3 glass-card rounded-xl border border-slate-800 bg-surface-950/60 flex flex-col h-full min-h-0 overflow-hidden">
            {/* 标签栏 */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-surface-900/90 border-b border-slate-800 text-xs">
              <div className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={handleAddNewSqlTab}
                  className="px-2.5 py-1 rounded text-slate-400 hover:text-white flex items-center space-x-1 transition cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>新 SQL</span>
                </button>
                {sqlTabs.map((tab) => (
                  <div
                    key={tab.id}
                    onClick={() => setActiveTabId(tab.id)}
                    className={`px-2.5 py-1 rounded flex items-center space-x-1.5 font-medium cursor-pointer transition ${
                      tab.id === activeTabId
                        ? "bg-surface-800 text-teal-300 border border-teal-500/30"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <span>{tab.title}</span>
                    <X
                      className="w-3 h-3 text-slate-400 hover:text-rose-400 cursor-pointer"
                      onClick={(e) => handleCloseSqlTab(tab.id, e)}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* AI 交互输入区 (截图 1) */}
            <div className="p-3 border-b border-slate-800/80 bg-surface-900/40 space-y-2">
              <div className="flex items-center space-x-2">
                <div className="relative flex-1 flex items-center bg-surface-950/80 border border-slate-700/80 rounded-lg px-2.5 py-1.5 focus-within:border-teal-500 transition">
                  <Sparkles className="w-4 h-4 text-teal-400 mr-2 shrink-0" />
                  <input
                    type="text"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAiGenerate()}
                    placeholder="用一句话描述要查什么，AI 帮你写 SQL（例：统计每个状态的用户数）"
                    className="w-full bg-transparent text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAiGenerate}
                  disabled={aiGenerating}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white font-semibold text-xs transition cursor-pointer shadow-sm shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI 生成</span>
                </button>
              </div>

              {/* 试词气泡与方言 */}
              <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400">
                <div className="flex items-center space-x-2">
                  <span>试试:</span>
                  <button
                    type="button"
                    onClick={() => handleSetSample("SELECT * FROM sys_logs ORDER BY id DESC LIMIT 100;")}
                    className="px-2 py-0.5 rounded bg-surface-800 hover:bg-surface-700 text-slate-300 transition cursor-pointer"
                  >
                    查最近 100 条
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetSample("SELECT DATE(created_at) as day, count(*) as count FROM orders GROUP BY day;")}
                    className="px-2 py-0.5 rounded bg-surface-800 hover:bg-surface-700 text-slate-300 transition cursor-pointer"
                  >
                    按天统计量
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetSample("SELECT u.name, r.role_name FROM sys_user u LEFT JOIN sys_role r ON u.role_id = r.id;")}
                    className="px-2 py-0.5 rounded bg-surface-800 hover:bg-surface-700 text-slate-300 transition cursor-pointer"
                  >
                    联表查询
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetSample("DESCRIBE sys_user;")}
                    className="px-2 py-0.5 rounded bg-surface-800 hover:bg-surface-700 text-slate-300 transition cursor-pointer"
                  >
                    看表结构
                  </button>
                </div>
                <span className="font-mono text-slate-500">方言: any</span>
              </div>
            </div>

            {/* 当前库选择与警告提示 (截图 1) */}
            <div className="px-3 py-2 bg-surface-950/60 border-b border-slate-800/60 flex items-center space-x-3 text-xs">
              <div className="flex items-center space-x-1.5 text-slate-300">
                <span className="text-slate-400">当前库:</span>
                <select
                  value={selectedDb}
                  onChange={(e) => setSelectedDb(e.target.value)}
                  className="bg-surface-900 border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                >
                  <option value="">选择要执行的库</option>
                  {(selectedConnection && "database" in selectedConnection
                    ? (databaseOptions[selectedConnection.id] ?? [])
                    : []
                  ).map((databaseName) => (
                    <option key={databaseName} value={databaseName}>{databaseName}</option>
                  ))}
                </select>
              </div>
              {!selectedDb && (
                <span className="text-amber-400 text-[11px] flex items-center space-x-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>未选库，SQL 可能执行失败</span>
                </span>
              )}
            </div>

            {/* SQL 编辑器与结果集独立滚动，右侧卡片本身保持原型高度 */}
            {!selectedTable && selectedDb && selectedConnection && selectedConnection.type !== "Redis" && selectedConnection.type !== "MongoDB" && (
              <div className="shrink-0 border-b border-slate-800 bg-surface-900/60 px-3 py-2">
                <div className="flex items-center gap-2 mb-2 text-xs text-slate-300">
                  <Table2 className="w-3.5 h-3.5 text-blue-400" />
                  <span>数据库表</span>
                  <span className="text-[10px] text-slate-500">{selectedDb}</span>
                  <span className="ml-auto text-[10px] text-slate-500">{selectedDatabaseTables.length} 张表</span>
                </div>
                {selectedDatabaseTables.length === 0 ? (
                  <div className="py-5 text-center text-xs text-slate-500">展开左侧“表”并选择一张表查看字段</div>
                ) : (
                  <div className="max-h-36 overflow-y-auto custom-scrollbar grid grid-cols-2 gap-1">
                    {selectedDatabaseTables.map((table) => (
                      <button key={table.name} type="button" onClick={() => void handleSelectTable(selectedConnectionId!, selectedDb, table)} className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-slate-300 hover:bg-surface-800 hover:text-teal-200">
                        <Table2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="truncate">{table.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {selectedTable && selectedConnection && selectedConnection.type !== "Redis" && selectedConnection.type !== "MongoDB" && (
              <div className="shrink-0 border-b border-slate-800 bg-surface-900/60">
                <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-800/80">
                  <div className="min-w-0 mr-auto">
                    <div className="flex items-center gap-2 text-xs text-slate-200">
                      <Table2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span className="font-medium truncate">{selectedTable.name}</span>
                      <span className="text-[10px] text-slate-500">{selectedDb}</span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-500">{tableColumns.length} 个字段 · {displayEngineName(selectedConnection.type)}</div>
                  </div>
                  <Button size="small" onClick={() => { setSelectedTable(null); setTableColumns([]); }}>返回表列表</Button>
                  <Button size="small" icon={<Table2 className="w-3 h-3" />} onClick={() => void refreshSelectedTable()}>查看结构</Button>
                  <Button size="small" icon={<RefreshCw className="w-3 h-3" />} loading={tableColumnsLoading} onClick={() => void refreshSelectedTable()}>刷新</Button>
                  <Button size="small" icon={<Plus className="w-3 h-3" />} onClick={() => { columnForm.resetFields(); setColumnModalOpen(true); }}>新建字段</Button>
                  <Button size="small" icon={<Download className="w-3 h-3" />} onClick={() => void handleExportTableCsv()}>导出 CSV</Button>
                  <Button size="small" icon={<Download className="w-3 h-3" />} onClick={() => void handleExportTableSql()}>导出 SQL</Button>
                </div>
                <div className="max-h-52 overflow-auto custom-scrollbar px-3 py-2">
                  {tableColumnsLoading ? <div className="py-7 text-center text-xs text-slate-500">正在读取表结构...</div> : tableColumns.length === 0 ? <div className="py-7 text-center text-xs text-slate-500">暂无字段信息</div> : (
                    <Table<DatabaseColumnItem>
                      rowKey="name"
                      size="small"
                      pagination={false}
                      dataSource={tableColumns}
                      className="ops-table text-xs"
                      columns={[
                        { title: "字段", dataIndex: "name", key: "name", render: (value: string, column) => <span className="font-mono text-slate-200">{value}{column.primaryKey && <span className="ml-1 text-amber-400">PK</span>}</span> },
                        { title: "类型", dataIndex: "dataType", key: "dataType", render: (value: string) => <span className="font-mono text-slate-300">{value}</span> },
                        { title: "可空", dataIndex: "nullable", key: "nullable", render: (value: boolean) => <span className={value ? "text-emerald-400" : "text-rose-300"}>{value ? "是" : "否"}</span> },
                        { title: "默认值", dataIndex: "defaultValue", key: "defaultValue", render: (value: string | null) => <span className="font-mono text-slate-400">{value || "-"}</span> },
                        { title: "操作", key: "action", width: 72, render: (_: unknown, column) => <Button type="link" danger size="small" disabled={column.primaryKey} onClick={() => handleDropColumn(column)}>删除</Button> },
                      ]}
                    />
                  )}
                </div>
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col">
            {/* SQL 编辑器模拟区域 */}
            <div className="bg-[#090d16] p-3 font-mono text-xs text-slate-200 min-h-[140px] flex space-x-3 shrink-0 relative">
              <div className="text-slate-600 select-none text-right w-5 pt-0.5">1</div>
              <div className="relative flex-1 min-w-0">
                <textarea
                  ref={sqlEditorRef}
                  value={currentTab.sql}
                  onChange={(event) => {
                    updateCurrentTabSql(event.target.value);
                    refreshSqlSuggestions(event.target.value, event.target.selectionStart);
                  }}
                  onClick={(event) => refreshSqlSuggestions(event.currentTarget.value, event.currentTarget.selectionStart)}
                  onKeyUp={(event) => {
                    if (!["ArrowUp", "ArrowDown", "Enter", "Tab", "Escape"].includes(event.key)) {
                      refreshSqlSuggestions(event.currentTarget.value, event.currentTarget.selectionStart);
                    }
                  }}
                  onKeyDown={handleSqlEditorKeyDown}
                  onBlur={() => window.setTimeout(() => setSqlSuggestions([]), 120)}
                  placeholder="选库后再写 SQL"
                  className="w-full min-h-[114px] resize-y bg-transparent border-0 focus:outline-none text-slate-200 placeholder:text-slate-600 font-mono text-xs leading-relaxed"
                  spellCheck={false}
                />
                {sqlSuggestions.length > 0 && (
                  <div className="absolute left-0 top-6 z-20 min-w-48 max-w-full overflow-hidden rounded-md border border-slate-700 bg-slate-900 shadow-xl">
                    <div className="px-2.5 py-1 border-b border-slate-800 text-[10px] text-slate-500">
                      {suggestingTable ? "表名建议" : "SQL 关键字"} · ↑↓ 选择 · Enter 补全
                    </div>
                    {sqlSuggestions.map((suggestion, index) => (
                      <button
                        key={suggestion}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => applySqlSuggestion(suggestion)}
                        className={`block w-full px-2.5 py-1 text-left font-mono text-[11px] ${index === activeSqlSuggestion ? "bg-teal-500/20 text-teal-200" : "text-slate-300 hover:bg-slate-800"}`}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="px-3 py-1.5 bg-surface-950/70 border-b border-slate-800/70 text-[10px] text-slate-500">
              输入 SQL 关键字可查看补全；在 FROM / JOIN / UPDATE 后输入表名前，请先点击“看表结构”加载表名。
            </div>

            {/* 底部操作条 */}
            <div className="p-2.5 bg-surface-900/90 border-t border-b border-slate-800 flex items-center justify-between text-xs sticky top-0 z-10">
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleExecuteSql}
                  disabled={executing}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white font-semibold transition cursor-pointer shadow-sm"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>执行</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleExplainSql()}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-slate-300 border border-slate-700 transition cursor-pointer"
                >
                  <GitMerge className="w-3.5 h-3.5" />
                  <span>解释</span>
                </button>
              </div>
              <button
                type="button"
                onClick={handleClearSql}
                className="px-2.5 py-1 rounded hover:bg-surface-800 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <span>清空</span>
              </button>
            </div>

            {/* 执行结果展示区域 */}
            {resultRows && (
              <div className="border-t border-slate-800 bg-surface-950 flex flex-col">
                <div className="px-3 py-2 bg-surface-900/80 border-b border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                  <div className="flex items-center space-x-2">
                    <span className="text-emerald-400 font-medium flex items-center space-x-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>执行成功</span>
                    </span>
                    <span className="text-slate-600">|</span>
                    <span>
                      受影响行数: <strong className="text-slate-300 font-mono">{execStats?.affected ?? 24}</strong>
                    </span>
                    <span className="text-slate-600">|</span>
                    <span>
                      耗时: <strong className="text-slate-300 font-mono">{execStats?.timeMs ?? 12}ms</strong>
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => void handleExportCsv()}
                      className="hover:text-white transition cursor-pointer"
                    >
                      导出 CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCopyJson()}
                      className="hover:text-white transition cursor-pointer"
                    >
                      复制 JSON
                    </button>
                  </div>
                </div>
                <div className="max-h-56 overflow-auto">
                  <Table
                    rowKey={(_, index) => `${index}`}
                    size="small"
                    columns={resultColumns}
                    dataSource={resultRows}
                    pagination={false}
                    className="ops-table text-xs"
                  />
                </div>
              </div>
            )}
            {!resultRows && (
              <div className="flex-1 min-h-[160px] bg-[#090d16]/30 flex flex-col items-center justify-center text-slate-600 text-xs select-none py-10">
                <Terminal className="w-7 h-7 text-slate-700/60 mb-2" />
                <span className="text-slate-500">点击「执行」后在此查看 SQL 返回数据</span>
              </div>
            )}
            </div>
          </div>
        </div>
      )}

      {/* 视图 2: Redis (截图 4: media_1790640343145.png) */}
      {subTab === "redis" && (
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-4 gap-3 overflow-hidden">
          <div className="md:col-span-1 glass-card p-3 rounded-xl border border-slate-800 bg-surface-950/60 flex flex-col min-h-0 overflow-hidden space-y-2.5">
            <button type="button" onClick={handleOpenRedisModal} className="w-full shrink-0 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-surface-900 hover:bg-surface-800 text-slate-200 text-xs border border-slate-700/80 transition">
              <Plus className="w-3.5 h-3.5" /><span>新建连接</span>
            </button>
            <div className="relative shrink-0">
              <input value={filterText} onChange={(event) => setFilterText(event.target.value)} placeholder="过滤 Redis 实例" className="w-full bg-surface-900 border border-slate-800 rounded-lg pl-7 pr-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-teal-500" />
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-2 pointer-events-none" />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
              {filteredConnections.length === 0 ? <div className="h-full flex flex-col items-center justify-center gap-2 text-center text-xs text-slate-500"><Inbox className="w-7 h-7" /><span>还没有 Redis 连接</span></div> : filteredConnections.map((connection) => (
                <div key={connection.id} role="button" tabIndex={0} onClick={() => selectConnection(connection)} onKeyDown={(event) => { if (event.key === "Enter") selectConnection(connection); }} className={`w-full p-2 rounded-lg border text-left flex items-center justify-between gap-2 transition cursor-pointer ${selectedConnectionId === connection.id ? "border-teal-500/50 bg-teal-500/10" : "border-slate-800 bg-surface-900/40 hover:bg-surface-800/60"}`}>
                  <span className="flex items-center gap-1.5 min-w-0"><Key className="w-3.5 h-3.5 text-rose-400 shrink-0" /><span className="truncate text-xs text-slate-200">{connection.name}</span></span>
                  <span className="font-mono text-[10px] text-slate-500 shrink-0">:{connection.port}</span>
                  <button type="button" onClick={(event) => { event.stopPropagation(); setDetailConnection(connection); }} className="px-1 text-slate-500 hover:text-teal-300" aria-label="查看连接详情"><Eye className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={(event) => { event.stopPropagation(); handleEditDbConnection(connection); }} className="px-1 text-slate-500 hover:text-blue-300" aria-label="编辑连接"><Pencil className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={(event) => { event.stopPropagation(); handleDeleteConnection(connection); }} className="px-1 text-slate-500 hover:text-rose-400" aria-label="删除连接">×</button>
                </div>
              ))}
            </div>
          </div>
          <div className="md:col-span-3 glass-card rounded-xl border border-slate-800 bg-surface-950/60 flex flex-col min-h-0 overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-800 bg-surface-900/80 flex items-center gap-2 text-xs">
              <span className="text-slate-300 mr-auto">Redis 浏览器</span>
              <Input size="small" value={redisPattern} onChange={(event) => setRedisPattern(event.target.value)} placeholder="键匹配，如 user:*" className="w-40 bg-surface-950" />
              <Button size="small" loading={executing} disabled={!selectedConnection} onClick={() => void handleProbeSelectedConnection()}>测试连接</Button>
              <Button size="small" loading={executing} disabled={!selectedConnection} onClick={() => void handleLoadRedisKeys()}>刷新键</Button>
            </div>
            {!selectedConnection ? (
              <div className="flex-1 flex items-center justify-center text-center text-xs text-slate-500"><Inbox className="w-8 h-8 mr-2" />请先选择 Redis 连接</div>
            ) : (
              <div className="flex-1 min-h-0 grid grid-cols-2 divide-x divide-slate-800">
                <div className="overflow-y-auto custom-scrollbar p-2 space-y-1">
                  {redisKeys.length === 0 ? <div className="p-6 text-center text-xs text-slate-500">暂无键，点击“刷新键”加载</div> : redisKeys.map((item) => (
                    <button key={item.key} type="button" onClick={() => void handleReadRedisValue(item.key)} className="w-full text-left px-2 py-1.5 rounded hover:bg-surface-800 text-xs text-slate-300 font-mono truncate">{item.key}</button>
                  ))}
                </div>
                <pre className="m-0 p-3 overflow-auto whitespace-pre-wrap text-xs text-slate-300">{redisValue ?? "选择一个键查看值"}</pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 视图 3: MongoDB */}
      {subTab === "mongodb" && (
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-4 gap-3 overflow-hidden">
          <div className="md:col-span-1 glass-card p-3 rounded-xl border border-slate-800 bg-surface-950/60 flex flex-col min-h-0 overflow-hidden space-y-2.5">
            <button type="button" onClick={() => handleOpenDbModal("MongoDB")} className="w-full shrink-0 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-surface-900 hover:bg-surface-800 text-slate-200 text-xs border border-slate-700/80 transition"><Plus className="w-3.5 h-3.5" /><span>新建连接</span></button>
            <div className="relative shrink-0"><input value={filterText} onChange={(event) => setFilterText(event.target.value)} placeholder="过滤 MongoDB 实例" className="w-full bg-surface-900 border border-slate-800 rounded-lg pl-7 pr-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-teal-500" /><Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-2 pointer-events-none" /></div>
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
              {filteredConnections.length === 0 ? <div className="h-full flex flex-col items-center justify-center gap-2 text-center text-xs text-slate-500"><Inbox className="w-7 h-7" /><span>还没有 MongoDB 连接</span></div> : filteredConnections.map((connection) => (
                <div key={connection.id} role="button" tabIndex={0} onClick={() => selectConnection(connection)} onKeyDown={(event) => { if (event.key === "Enter") selectConnection(connection); }} className={`w-full p-2 rounded-lg border text-left flex items-center justify-between gap-2 transition cursor-pointer ${selectedConnectionId === connection.id ? "border-teal-500/50 bg-teal-500/10" : "border-slate-800 bg-surface-900/40 hover:bg-surface-800/60"}`}><span className="flex items-center gap-1.5 min-w-0"><Leaf className="w-3.5 h-3.5 text-emerald-400 shrink-0" /><span className="truncate text-xs text-slate-200">{connection.name}</span></span><span className="font-mono text-[10px] text-slate-500 shrink-0">:{connection.port}</span><button type="button" onClick={(event) => { event.stopPropagation(); handleDeleteConnection(connection); }} className="px-1 text-slate-500 hover:text-rose-400" aria-label="删除连接">×</button></div>
              ))}
            </div>
          </div>
          <div className="md:col-span-3 glass-card rounded-xl border border-slate-800 bg-surface-950/60 flex flex-col min-h-0 overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-800 bg-surface-900/80 flex items-center gap-2 text-xs">
              <span className="text-slate-300 mr-auto">MongoDB 浏览器</span>
              <Button size="small" loading={executing} disabled={!selectedConnection} onClick={() => void handleProbeSelectedConnection()}>测试连接</Button>
              <Button size="small" loading={executing} disabled={!selectedConnection} onClick={() => void handleLoadMongoCollections()}>刷新集合</Button>
            </div>
            {!selectedConnection ? (
              <div className="flex-1 flex items-center justify-center text-center text-xs text-slate-500"><Inbox className="w-8 h-8 mr-2" />请先选择 MongoDB 连接</div>
            ) : (
              <div className="flex-1 min-h-0 grid grid-cols-3 divide-x divide-slate-800">
                <div className="overflow-y-auto custom-scrollbar p-2 space-y-1">
                  {mongoCollections.length === 0 ? <div className="p-4 text-center text-xs text-slate-500">暂无集合，点击“刷新集合”加载</div> : mongoCollections.map((item) => (
                    <button key={item.name} type="button" onClick={() => void handleReadMongoCollection(item.name)} className="w-full text-left px-2 py-1.5 rounded hover:bg-surface-800 text-xs text-slate-300 font-mono truncate">{item.name}</button>
                  ))}
                </div>
                <div className="col-span-2 overflow-auto p-2">
                  <Table rowKey={(_, index) => `${index}`} size="small" pagination={false} dataSource={mongoDocuments} columns={Object.keys(mongoDocuments[0] ?? {}).map((column) => ({ title: column, dataIndex: column, key: column }))} className="ops-table text-xs" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 底部全局状态栏固定在工作台底部 */}
      <div className="px-3 py-1.5 rounded-lg bg-surface-950/80 border border-slate-800 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
        <div className="flex items-center space-x-3 font-mono min-w-0">
          <span className="flex items-center space-x-1.5 text-slate-300 truncate">
            <span className={`w-1.5 h-1.5 rounded-full ${selectedConnection ? "bg-emerald-400" : "bg-slate-600"}`} />
            <span className="truncate">{selectedConnection ? `${selectedConnection.type} @ ${selectedConnection.server}` : "未选择数据库连接"}</span>
          </span>
          {selectedConnection && <>
            <span>·</span>
            <span className="text-slate-400">{selectedConnection.type.toLowerCase()}</span>
            <span className="text-teal-400 bg-teal-500/10 px-1.5 py-0.5 rounded border border-teal-500/20 font-sans">支持 写操作记审计</span>
            {selectedConnection.sshTunnel && <span className="text-slate-500 font-sans">SSH 隧道</span>}
          </>}
        </div>
        <div className="flex items-center space-x-2 text-slate-400 font-sans shrink-0">
          <span>自动提交</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        </div>
      </div>

      {contextMenu && (
        <div
          className="fixed z-[120] min-w-[190px] rounded-xl border border-slate-700/90 bg-[#0f172a] py-1 text-xs text-slate-200 shadow-2xl"
          style={{
            left: Math.min(contextMenu.x, Math.max(8, window.innerWidth - 220)),
            top: Math.min(contextMenu.y, Math.max(8, window.innerHeight - (contextMenu.kind === "connection" ? 250 : 330))),
          }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          {contextMenu.kind === "connection" ? (
            <>
              <button type="button" onClick={() => void handleDbContextAction("reconnect")} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-800"><RotateCw className="h-3.5 w-3.5 text-teal-400" />重新连接 / 刷新</button>
              <button type="button" onClick={() => void handleDbContextAction("test")} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-800"><Zap className="h-3.5 w-3.5 text-amber-400" />测试连接</button>
              <button type="button" onClick={() => void handleDbContextAction("edit")} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-800"><Pencil className="h-3.5 w-3.5 text-blue-400" />编辑连接</button>
              <div className="my-1 border-t border-slate-800/80" />
              <button type="button" onClick={() => void handleDbContextAction("copy")} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-800"><Copy className="h-3.5 w-3.5 text-slate-400" />复制连接名</button>
              <div className="my-1 border-t border-slate-800/80" />
              <button type="button" onClick={() => void handleDbContextAction("delete")} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-rose-400 hover:bg-rose-500/10"><Trash2 className="h-3.5 w-3.5" />删除连接</button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => void handleDbContextAction("search")} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-800"><Search className="h-3.5 w-3.5 text-slate-400" />在此库中查询...</button>
              <div className="my-1 border-t border-slate-800/80" />
              <button type="button" onClick={() => void handleDbContextAction("createTable")} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-800"><Plus className="h-3.5 w-3.5 text-blue-400" />新建表</button>
              <button type="button" onClick={() => void handleDbContextAction("runSql")} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-800"><FileCode className="h-3.5 w-3.5 text-emerald-400" />运行 SQL 文件...</button>
              <button type="button" onClick={() => void handleDbContextAction("dumpSql")} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-800"><Download className="h-3.5 w-3.5 text-amber-400" />导出 SQL 文件...</button>
              <button type="button" onClick={() => void handleDbContextAction("tableList")} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-800"><List className="h-3.5 w-3.5 text-purple-400" />打开表清单</button>
              <div className="my-1 border-t border-slate-800/80" />
              <button type="button" onClick={() => void handleDbContextAction("copy")} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-800"><Copy className="h-3.5 w-3.5 text-slate-400" />复制数据库名</button>
              <button type="button" onClick={() => void handleDbContextAction("refresh")} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-800"><RefreshCw className="h-3.5 w-3.5 text-teal-400" />刷新</button>
              <div className="my-1 border-t border-slate-800/80" />
              <button type="button" onClick={() => void handleDbContextAction("delete")} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-rose-400 hover:bg-rose-500/10"><Trash2 className="h-3.5 w-3.5" />删除数据库</button>
            </>
          )}
        </div>
      )}

      <Modal
        open={Boolean(detailConnection)}
        title="数据库连接详情"
        footer={null}
        onCancel={() => setDetailConnection(null)}
        width={480}
      >
        {detailConnection && <div className="space-y-3 py-2 text-xs">
          {[
            ["连接名称", detailConnection.name],
            ["数据库类型", displayEngineName(detailConnection.type)],
            ["归属服务器", detailConnection.server],
            [detailConnection.type === "SQLite" ? "数据库文件" : "主机地址", detailConnection.type === "SQLite" ? detailConnection.host : `${detailConnection.host}:${detailConnection.port}`],
            ["SSH 隧道", detailConnection.sshTunnel ? "已启用" : "未启用"],
            ["生产库保护", detailConnection.isProdProtect ? "已启用" : "未启用"],
            ["AI 策略", detailConnection.aiTier],
          ].map(([label, value]) => <div key={label} className="grid grid-cols-[96px_1fr] gap-3 border-b border-slate-800 pb-2">
            <span className="text-slate-500">{label}</span><span className="text-slate-200 break-all">{value}</span>
          </div>)}
          <div className="flex justify-end pt-1">
            <Button size="small" onClick={() => {
              if (detailConnection) handleEditDbConnection(detailConnection);
              setDetailConnection(null);
            }}>编辑连接</Button>
          </div>
        </div>}
      </Modal>

      <Modal
        open={structureOpen}
        title={`数据库结构${selectedDb ? ` · ${selectedDb}` : ""}`}
        footer={null}
        onCancel={() => setStructureOpen(false)}
        width={620}
      >
        {structureLoading ? (
          <div className="py-12 text-center text-xs text-slate-500">正在读取远端数据库结构…</div>
        ) : structureTables.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500">当前数据库没有可展示的表或视图</div>
        ) : (
          <div className="max-h-[460px] overflow-y-auto space-y-1">
            {structureTables.map((table) => (
              <button
                key={`${table.tableType}-${table.name}`}
                type="button"
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-slate-800 bg-surface-950 hover:border-teal-500/40 text-left"
                onClick={() => {
                  updateCurrentTabSql(`SELECT * FROM ${table.name} LIMIT 100;`);
                  setStructureOpen(false);
                }}
              >
                <span className="flex items-center gap-2 text-xs text-slate-200"><Database className="w-3.5 h-3.5 text-teal-400" />{table.name}</span>
                <span className="text-[11px] text-slate-500">{table.tableType}</span>
              </button>
            ))}
          </div>
        )}
      </Modal>

      {/* 查询历史 */}
      <Modal
        open={createTableOpen}
        title={`新建表${selectedDb ? ` · ${selectedDb}` : ""}`}
        okText="创建表"
        cancelText="取消"
        onCancel={() => setCreateTableOpen(false)}
        onOk={() => void handleCreateTable()}
        maskClosable={false}
        width={520}
      >
        <Form form={createTableForm} layout="vertical" initialValues={{ columns: "id INTEGER PRIMARY KEY" }} className="pt-2">
          <Form.Item name="name" label="表名" rules={[{ required: true, message: "请输入表名" }, { pattern: /^[A-Za-z_][A-Za-z0-9_$]*$/, message: "表名只能包含字母、数字、下划线或 $" }]}>
            <Input placeholder="例如 audit_logs" />
          </Form.Item>
          <Form.Item name="columns" label="字段定义" rules={[{ required: true, message: "请输入字段定义" }]}>
            <Input.TextArea rows={5} placeholder="例如 id INTEGER PRIMARY KEY, created_at TIMESTAMP NOT NULL, message TEXT" />
          </Form.Item>
          <div className="text-[11px] leading-relaxed text-slate-500">字段定义会按当前数据库方言执行 CREATE TABLE，请使用逗号分隔字段和约束。</div>
        </Form>
      </Modal>

      <Modal
        open={columnModalOpen}
        title={`新建字段${selectedTable ? ` · ${selectedTable.name}` : ""}`}
        okText="创建字段"
        cancelText="取消"
        onCancel={() => setColumnModalOpen(false)}
        onOk={() => void handleAddColumn()}
        maskClosable={false}
        width={460}
      >
        <Form form={columnForm} layout="vertical" initialValues={{ nullable: true }} className="pt-2">
          <Form.Item name="name" label="字段名" rules={[{ required: true, message: "请输入字段名" }, { pattern: /^[A-Za-z_][A-Za-z0-9_$]*$/, message: "字段名只能包含字母、数字、下划线或 $" }]}>
            <Input placeholder="例如 created_at" />
          </Form.Item>
          <Form.Item name="dataType" label="字段类型" rules={[{ required: true, message: "请输入字段类型" }]}>
            <Input placeholder="例如 VARCHAR(255)、INTEGER、TIMESTAMP" />
          </Form.Item>
          <Form.Item name="nullable" label="允许 NULL" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="defaultValue" label="默认值">
            <Input placeholder="可选，例如 0 或 CURRENT_TIMESTAMP" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={historyOpen}
        title="SQL 执行历史"
        footer={null}
        onCancel={() => setHistoryOpen(false)}
        width={680}
      >
        <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
          {queryHistory.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">暂无执行记录</div>
          ) : queryHistory.map((item, index) => (
            <button
              key={`${item.createdAt}-${index}`}
              type="button"
              onClick={() => { updateCurrentTabSql(item.sql); setHistoryOpen(false); }}
              className="w-full text-left p-2.5 rounded-lg border border-slate-800 bg-surface-950 hover:border-teal-500/40 transition"
            >
              <div className="text-[11px] text-slate-500 mb-1">{item.createdAt}</div>
              <code className="block whitespace-pre-wrap text-xs text-slate-300 font-mono">{item.sql}</code>
            </button>
          ))}
        </div>
      </Modal>

      {/* 常用 SQL 片段 */}
      <Modal
        open={snippetsOpen}
        title="SQL 常用片段"
        footer={null}
        onCancel={() => setSnippetsOpen(false)}
        width={560}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            ["最近 100 条", "SELECT * FROM sys_user ORDER BY user_id DESC LIMIT 100;"],
            ["按天统计", "SELECT DATE(create_time) AS day, COUNT(*) AS count FROM sys_oper_log GROUP BY day;"],
            ["联表查询", "SELECT u.user_id, u.user_name, r.role_name FROM sys_user u LEFT JOIN sys_role r ON u.role_id = r.role_id;"],
            ["看表结构", "DESCRIBE sys_user;"],
          ].map(([label, sql]) => (
            <button
              key={label}
              type="button"
              onClick={() => { updateCurrentTabSql(sql); setSnippetsOpen(false); }}
              className="p-2.5 rounded-lg border border-slate-800 bg-surface-950 hover:border-teal-500/40 text-left transition"
            >
              <div className="text-xs text-slate-200 mb-1">{label}</div>
              <code className="text-[11px] text-slate-500 font-mono line-clamp-2">{sql}</code>
            </button>
          ))}
        </div>
      </Modal>

      {/* 模态框 1: 新建 DB 凭据 (截图 2 & 3: media_1790640307974.png / media_1790640317116.png) */}
      <Modal
        open={dbModalOpen}
        onCancel={() => { setDbModalOpen(false); setEditingConnection(null); }}
        footer={null}
        width={500}
        centered
        styles={{
          body: { height: "calc(82vh - 56px)", maxHeight: "calc(82vh - 56px)", overflow: "hidden", padding: 0 },
        }}
        maskClosable={false}
        className="glass-card-modal"
        title={
          <div className="flex items-center space-x-2 text-white">
            <Database className="w-4 h-4 text-teal-400" />
            <span>{editingConnection ? "编辑数据库连接" : "新建数据库连接"}</span>
          </div>
        }
      >
        <Form
          key={dbFormKey}
          form={dbForm}
          initialValues={dbFormInitialValues}
          layout="vertical"
          className="flex flex-col text-xs"
          style={{ display: "flex", flexDirection: "column", height: "100%" }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 space-y-3.5">
          {/* 名称 */}
          <Form.Item
            label={<span className="text-slate-300 font-medium"><span className="text-rose-400 mr-1">*</span>名称</span>}
            name="name"
            className="mb-2"
            rules={[{ required: true, message: "请输入连接名称" }]}
          >
            <Input
              placeholder="如 阿里云 RDS - 主库 / 测试 SQLite"
              allowClear
              className="bg-surface-950 border-slate-700 text-slate-200 text-xs"
            />
          </Form.Item>

          {/* 归属 */}
          <Form.Item
            label={<span className="text-slate-300 font-medium">归属{isSqliteForm && <span className="text-slate-500 font-normal text-[11px]">（SQLite 仅支持本机文件）</span>}</span>}
            name="server"
            className="mb-2"
          >
            <Select
              className="w-full text-xs"
              disabled={isSqliteForm || Boolean(editingConnection)}
              onChange={(value) => {
                if (!editingConnection) setDbSshTunnel(value !== "local");
              }}
              options={isSqliteForm
                ? [{ label: "本机 / 本地文件", value: "local" }]
                : [
                  ...availableServers.map((item) => ({ label: `💻 ${item.alias} · ${item.hostname}:${item.port}`, value: `server-${item.id}` })),
                  ...(server && !availableServers.some((item) => item.id === server.id) ? [{ label: `💻 ${server.alias} · ${server.hostname}:${server.port}`, value: `server-${server.id}` }] : []),
                ]}
            />
          </Form.Item>

          {/* 数据库类型 */}
          <Form.Item
            label={<span className="text-slate-300 font-medium">数据库类型</span>}
            name="type"
            initialValue="MySQL"
            className="mb-2"
          >
            <Select
              className="w-full text-xs"
              onChange={(val) => {
                if (val === "MySQL" || val === "MariaDB") dbForm.setFieldValue("port", "3306");
                else if (val === "PostgreSQL") dbForm.setFieldValue("port", "5432");
                else if (val === "Oracle") dbForm.setFieldValue("port", "1521");
                else if (val === "Microsoft SQL Server") dbForm.setFieldValue("port", "1433");
                else if (val === "ClickHouse") dbForm.setFieldValue("port", "8123");
                else if (val === "MongoDB") dbForm.setFieldValue("port", "27017");
                else if (val === "SQLite") {
                  dbForm.setFieldsValue({ server: "local", port: "", host: "", user: "", password: "" });
                  setDbSshTunnel(false);
                } else if (dbForm.getFieldValue("server") === "local") {
                  const defaultServerId = server?.id ?? availableServers[0]?.id;
                  dbForm.setFieldValue("server", defaultServerId ? `server-${defaultServerId}` : undefined);
                  setDbSshTunnel(Boolean(defaultServerId));
                }
              }}
              options={[
                { label: "MySQL", value: "MySQL" },
                { label: "PostgreSQL", value: "PostgreSQL" },
                { label: "SQLite", value: "SQLite" },
                { label: "Oracle", value: "Oracle" },
                { label: "Microsoft SQL Server", value: "Microsoft SQL Server" },
                { label: "MariaDB", value: "MariaDB" },
                { label: "ClickHouse", value: "ClickHouse" },
                { label: "MongoDB", value: "MongoDB" },
              ]}
            />
          </Form.Item>

          {/* AI 策略档位 */}
          <Form.Item
            label={
              <span className="text-slate-300 font-medium">
                AI 策略档位 <span className="text-slate-500 font-normal text-[11px]">(独立于服务器档位；不选跟随服务器)</span>
              </span>
            }
            name="aiTier"
            initialValue="default"
            className="mb-2"
          >
            <Select
              className="w-full text-xs"
              options={[
                { label: "跟随服务器档位（默认）", value: "default" },
                { label: "只读分析（仅允许 SELECT / EXPLAIN）", value: "readonly" },
                { label: "受限写入（禁止 DROP / TRUNCATE）", value: "restricted" },
                { label: "完全信任（允许所有 DDL / DML）", value: "full" },
              ]}
            />
          </Form.Item>

          {/* 生产库保护 */}
          {!isSqliteForm && <div className="space-y-1.5 pt-1">
            <span className="block text-slate-300 font-medium">
              生产库保护 <span className="text-slate-500 font-normal text-[11px]">(AI 永久只读 + 人工写操作强制确认)</span>
            </span>
            <div className="flex items-center space-x-3">
              <Switch
                checked={dbProdProtect}
                onChange={setDbProdProtect}
                size="small"
              />
              <span className={`text-[11px] ${dbProdProtect ? "text-rose-300" : "text-slate-500"}`}>
                {dbProdProtect ? "生产环境" : "非生产"}
              </span>
            </div>
            <Form.Item name="prodDatabases" className="mb-1">
              <Input
                placeholder="例如: prod_app, order_prod（留空 = 不启用逐库保护）"
                allowClear
                className="bg-surface-950 border-slate-700 text-slate-200 text-xs"
              />
            </Form.Item>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              整条连接不是生产库时，可在此列出该实例上属于生产的库名（逗号分隔），只有目标指向这些库的语句才受保护 —— 适合「一台实例既有 prod 也有 staging」。
            </p>
          </div>}

          {/* 经服务器 SSH 隧道访问 */}
          {!isSqliteForm && <section className="space-y-2.5 rounded-lg border border-slate-700/80 bg-surface-950/70 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-slate-300">
                <Wifi className="h-3.5 w-3.5 text-indigo-400" />
                <span className="font-medium">经服务器 SSH 隧道访问</span>
              </div>
              <Switch
                checked={dbSshTunnel}
                onChange={(checked) => setDbSshTunnel(checked)}
                size="small"
              />
            </div>
            {dbSshTunnel && <p className="text-[11px] leading-relaxed text-slate-500">
              使用上方归属服务器建立 SSH 转发。数据库位于该服务器本机时，主机填写 127.0.0.1；关闭后将从本机直接连接数据库。
            </p>}
          </section>}

          {isSqliteForm ? <Form.Item
            label={<span className="text-slate-300 font-medium"><span className="text-rose-400 mr-1">*</span>数据库文件路径</span>}
            name="sqlitePath"
            className="mb-2"
            rules={[{ required: true, message: "请输入 SQLite 数据库文件路径" }]}
          >
            <Input
              placeholder="如 C:\\data\\app.db 或 /var/lib/app/data.db"
              allowClear
              className="bg-surface-950 border-slate-700 text-slate-200 text-xs font-mono"
            />
          </Form.Item> : <>
          {/* 主机 */}
          <Form.Item
            label={<span className="text-slate-300 font-medium"><span className="text-rose-400 mr-1">*</span>主机</span>}
            name="host"
            className="mb-2"
            rules={[{ required: true, message: "请输入数据库主机地址" }]}
          >
            <Input
              placeholder="如 127.0.0.1 或 rm-xxxx.mysql.aliyuncs.com"
              allowClear
              className="bg-surface-950 border-slate-700 text-slate-200 text-xs font-mono"
            />
          </Form.Item>

          {/* 端口 */}
          <Form.Item
            label={<span className="text-slate-300 font-medium">端口 <span className="text-slate-500 font-normal text-[11px]">(可选)</span></span>}
            name="port"
            initialValue="3306"
            className="mb-2"
          >
            <Input
              placeholder="3306"
              allowClear
              className="bg-surface-950 border-slate-700 text-slate-200 text-xs font-mono"
            />
          </Form.Item>

          {/* 用户名 */}
          <Form.Item
            label={<span className="text-slate-300 font-medium"><span className="text-rose-400 mr-1">*</span>用户名</span>}
            name="user"
            className="mb-2"
          >
            <Input
              placeholder="如 root / app"
              allowClear
              className="bg-surface-950 border-slate-700 text-slate-200 text-xs"
            />
          </Form.Item>

          {/* 密码 */}
          <Form.Item
            label={
              <span className="flex items-center space-x-1.5 text-slate-300 font-medium">
                <span>密码</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] bg-rose-500/20 text-rose-400 font-mono font-medium">
                  加密
                </span>
                <span className="text-slate-500 font-normal text-[11px]">(可选)</span>
              </span>
            }
            name="password"
            className="mb-2"
          >
            <Input
              type={dbPasswordVisible ? "text" : "password"}
              placeholder="数据库密码（保存到系统凭据管理器）"
              suffix={
                <button
                  type="button"
                  onClick={() => setDbPasswordVisible(!dbPasswordVisible)}
                  className="text-slate-400 hover:text-white"
                >
                  {dbPasswordVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
              }
              className="bg-surface-950 border-slate-700 text-slate-200 text-xs font-mono"
            />
          </Form.Item>
          </>}

          {/* 数据库名：SQLite 固定使用 main，不显示网络数据库名字段 */}
          {!isSqliteForm && <Form.Item
            label={<span className="text-slate-300 font-medium">{selectedDbType === "Oracle" ? "服务名" : "数据库名"} <span className="text-slate-500 font-normal text-[11px]">{selectedDbType === "Oracle" ? "(必填)" : "(可选)"}</span></span>}
            name="database"
            className="mb-2"
            rules={selectedDbType === "Oracle" ? [{ required: true, message: "请输入 Oracle 服务名" }] : []}
          >
            <Input
              placeholder={selectedDbType === "Oracle" ? "如 ORCLPDB1" : "如 appdb（可连接后从左侧浏览数据库）"}
              allowClear
              className="bg-surface-950 border-slate-700 text-slate-200 text-xs"
            />
          </Form.Item>}

          {/* 校验错误提示 (截图 3) */}
          {dbValidationFailed && (
            <div className="text-amber-400 text-xs font-medium flex items-center space-x-1.5 pt-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>⚠️ 请填名称</span>
            </div>
          )}

          </div>
          {/* 固定底部操作区，避免表单内容过长时按钮被滚出弹窗 */}
          <div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-slate-800 bg-surface-900/95 px-4 py-3 sm:px-5">
            <Button size="small" onClick={() => { setDbModalOpen(false); setEditingConnection(null); }}>
              取消
            </Button>
            <Button
              size="small"
              loading={testDbLoading}
              icon={<Wifi className="w-3.5 h-3.5" />}
              onClick={handleTestDbConn}
            >
              测试连接
            </Button>
            <Button type="primary" size="small" onClick={handleSaveDbCredential}>
              {editingConnection ? "保存修改" : "保存"}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* 模态框 2: 新建 Redis 连接 (截图 5: media_1790640361934.png) */}
      <Modal
        open={redisModalOpen}
        onCancel={() => { setRedisModalOpen(false); setEditingRedisConnection(null); }}
        footer={null}
        width={560}
        centered
        styles={{ body: { maxHeight: "calc(100vh - 176px)", overflowY: "auto", paddingRight: 8 } }}
        maskClosable={false}
        className="glass-card-modal"
        title={
          <div className="flex items-center space-x-2 text-white">
            <Key className="w-4 h-4 text-teal-400" />
            <span>{editingRedisConnection ? "编辑 Redis 连接" : "新建 Redis 连接"}</span>
          </div>
        }
      >
        <Form
          key={redisFormKey}
          form={redisForm}
          initialValues={redisFormInitialValues}
          layout="vertical"
          className="space-y-3.5 text-xs pt-2"
        >
          {/* 名称 */}
          <Form.Item
            label={<span className="text-slate-300 font-medium"><span className="text-rose-400 mr-1">*</span>名称</span>}
            name="name"
            className="mb-2"
          >
            <Input
              placeholder="如 阿里云 RDS - 主库 / 测试 SQLite"
              className="bg-surface-950 border-slate-700 text-slate-200 text-xs"
            />
          </Form.Item>

          {/* 归属 */}
          <Form.Item
            label={<span className="text-slate-300 font-medium">归属（本机 / 或选一台服务器做分类，AI 不会自动通过 SSH 连）</span>}
            name="server"
            initialValue="server-1"
            className="mb-2"
          >
            <Select
              className="w-full text-xs"
              options={[
                ...availableServers.map((item) => ({ label: `💻 ${item.alias} · ${item.hostname}:${item.port}`, value: `server-${item.id}` })),
                ...(server && !availableServers.some((item) => item.id === server.id) ? [{ label: `💻 ${server.alias} · ${server.hostname}:${server.port}`, value: `server-${server.id}` }] : []),
              ]}
            />
          </Form.Item>

          {/* 数据库类型 */}
          <Form.Item
            label={<span className="text-slate-300 font-medium">数据库类型</span>}
            name="type"
            initialValue="Redis"
            className="mb-2"
          >
            <Select className="w-full text-xs" disabled options={[{ label: "Redis", value: "Redis" }]} />
          </Form.Item>

          {/* AI 策略档位 */}
          <Form.Item
            label={
              <span className="text-slate-300 font-medium">
                AI 策略档位 <span className="text-slate-500 font-normal text-[11px]">(独立于服务器档位；不选跟随服务器)</span>
              </span>
            }
            name="aiTier"
            initialValue="default"
            className="mb-2"
          >
            <Select
              className="w-full text-xs"
              options={[
                { label: "跟随服务器档位（默认）", value: "default" },
                { label: "只读分析（仅允许 KEYS / GET / SCAN）", value: "readonly" },
                { label: "受限写入（禁止 FLUSHDB / FLUSHALL）", value: "restricted" },
                { label: "完全信任（允许所有命令）", value: "full" },
              ]}
            />
          </Form.Item>

          {/* 生产库保护 */}
          <div className="space-y-1.5 pt-1">
            <span className="block text-slate-300 font-medium">
              生产库保护 <span className="text-slate-500 font-normal text-[11px]">(AI 永久只读 + 人工写操作强制确认)</span>
            </span>
            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={() => setRedisProdProtect(!redisProdProtect)}
                className={`px-3 py-1 rounded-full text-[11px] font-medium border transition cursor-pointer ${
                  redisProdProtect
                    ? "bg-rose-500/20 border-rose-500/40 text-rose-300"
                    : "bg-surface-950 border-slate-700 text-slate-400"
                }`}
              >
                {redisProdProtect ? "生产环境" : "非生产"}
              </button>
            </div>
            <Form.Item name="prodDbList" className="mb-1">
              <Input
                placeholder="例如: 0, 1（留空 = 不启用逐库保护）"
                className="bg-surface-950 border-slate-700 text-slate-200 text-xs"
              />
            </Form.Item>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              整条连接不是生产库时，可在此列出该实例上属于生产的库名（逗号分隔），只有目标指向这些库的语句才受保护 —— 适合「一台实例既有 prod 也有 staging」。
            </p>
          </div>

          {/* 经服务器 SSH 隧道访问 */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-800">
            <span className="text-xs text-teal-400 font-medium">经服务器 SSH 隧道访问 ?</span>
            <Switch
              checked={redisSshTunnel}
              onChange={(checked) => setRedisSshTunnel(checked)}
              size="small"
            />
          </div>

          {/* 主机 */}
          <Form.Item
            label={<span className="text-slate-300 font-medium"><span className="text-rose-400 mr-1">*</span>主机</span>}
            name="host"
            className="mb-2"
          >
            <Input
              placeholder="如 127.0.0.1 或 r-xxxx.redis.aliyuncs.com"
              className="bg-surface-950 border-slate-700 text-slate-200 text-xs font-mono"
            />
          </Form.Item>

          {/* 端口 */}
          <Form.Item
            label={<span className="text-slate-300 font-medium">端口 <span className="text-slate-500 font-normal text-[11px]">(可选)</span></span>}
            name="port"
            initialValue="6379"
            className="mb-2"
          >
            <Input
              placeholder="6379"
              className="bg-surface-950 border-slate-700 text-slate-200 text-xs font-mono"
            />
          </Form.Item>

          {/* DB 编号 */}
          <Form.Item
            label={<span className="text-slate-300 font-medium">DB 编号 <span className="text-slate-500 font-normal text-[11px]">(可选)</span></span>}
            name="dbIndex"
            initialValue="0"
            className="mb-2"
          >
            <Input
              placeholder="0"
              className="bg-surface-950 border-slate-700 text-slate-200 text-xs font-mono"
            />
          </Form.Item>

          {/* 密码 */}
          <Form.Item
            label={
              <span className="flex items-center space-x-1.5 text-slate-300 font-medium">
                <span>密码</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] bg-rose-500/20 text-rose-400 font-mono font-medium">
                  加密
                </span>
                <span className="text-slate-500 font-normal text-[11px]">(可选)</span>
              </span>
            }
            name="password"
            className="mb-2"
          >
            <Input
              type={redisPasswordVisible ? "text" : "password"}
              placeholder="Redis 密码（落库前 AES-256-GCM 加密）"
              suffix={
                <button
                  type="button"
                  onClick={() => setRedisPasswordVisible(!redisPasswordVisible)}
                  className="text-slate-400 hover:text-white"
                >
                  {redisPasswordVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
              }
              className="bg-surface-950 border-slate-700 text-slate-200 text-xs font-mono"
            />
          </Form.Item>

          {/* 校验错误提示 */}
          {redisValidationFailed && (
            <div className="text-amber-400 text-xs font-medium flex items-center space-x-1.5 pt-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>⚠️ 请填名称</span>
            </div>
          )}

          {/* 弹窗底部操作按钮 */}
          <div className="sticky bottom-0 flex items-center justify-end space-x-2.5 pt-3 pb-1 border-t border-slate-800 bg-[#141c2d]">
            <Button size="small" onClick={() => { setRedisModalOpen(false); setEditingRedisConnection(null); }}>
              取消
            </Button>
            <Button
              size="small"
              loading={testRedisLoading}
              icon={<Wifi className="w-3.5 h-3.5" />}
              onClick={handleTestRedisConn}
            >
              测试连接
            </Button>
            <Button type="primary" size="small" onClick={handleSaveRedisConn}>
              {editingRedisConnection ? "保存修改" : "保存"}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
