/** 一段參數化 SQL:`sql` 用對應方言的佔位符(MySQL `?` / PostgreSQL `$n`),`params` 依序對應。 */
export interface DialectQuery {
  sql: string
  params: Array<string | number | boolean | null>
}

export interface TableDialect {
  /** 該表的 trigger 清單(name / timing / event / statement)。 */
  triggers(table: string): DialectQuery
  /** 反向關聯:誰的外鍵參照本表(fromTable.fromColumn → 本表.toColumn)。 */
  reverseRelations(table: string): DialectQuery
  /** 單列表狀態:engine / rowCount / sizeBytes / collation / createdAt。 */
  info(table: string): DialectQuery
  /** CREATE 原文查詢;無法提供者(PostgreSQL 基底表)回 null。 */
  createTable(table: string): DialectQuery | null
}

/** 反引號跳脫識別字:MySQL/MariaDB `SHOW CREATE TABLE` 無法參數化識別字時使用。 */
function mysqlIdent(name: string): string {
  return '`' + name.replace(/`/g, '``') + '`'
}

const mysql: TableDialect = {
  triggers: (table) => ({
    sql:
      'SELECT TRIGGER_NAME AS name, ACTION_TIMING AS timing, ' +
      'EVENT_MANIPULATION AS event, ACTION_STATEMENT AS statement ' +
      'FROM information_schema.TRIGGERS ' +
      'WHERE TRIGGER_SCHEMA = DATABASE() AND EVENT_OBJECT_TABLE = ? ' +
      'ORDER BY TRIGGER_NAME',
    params: [table],
  }),
  reverseRelations: (table) => ({
    sql:
      'SELECT TABLE_NAME AS fromTable, COLUMN_NAME AS fromColumn, ' +
      'REFERENCED_COLUMN_NAME AS toColumn, CONSTRAINT_NAME AS constraintName ' +
      'FROM information_schema.KEY_COLUMN_USAGE ' +
      'WHERE REFERENCED_TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME = ? ' +
      'ORDER BY TABLE_NAME, COLUMN_NAME',
    params: [table],
  }),
  info: (table) => ({
    sql:
      'SELECT ENGINE AS engine, TABLE_ROWS AS rowCount, ' +
      '(DATA_LENGTH + INDEX_LENGTH) AS sizeBytes, ' +
      'TABLE_COLLATION AS collation, CREATE_TIME AS createdAt ' +
      'FROM information_schema.TABLES ' +
      'WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    params: [table],
  }),
  createTable: (table) => ({ sql: `SHOW CREATE TABLE ${mysqlIdent(table)}`, params: [] }),
}

const postgresql: TableDialect = {
  triggers: (table) => ({
    sql:
      'SELECT trigger_name AS name, action_timing AS timing, ' +
      'event_manipulation AS event, action_statement AS statement ' +
      'FROM information_schema.triggers ' +
      'WHERE event_object_schema = current_schema() AND event_object_table = $1 ' +
      'ORDER BY trigger_name',
    params: [table],
  }),
  reverseRelations: (table) => ({
    sql:
      'SELECT tc.table_name AS "fromTable", kcu.column_name AS "fromColumn", ' +
      'ccu.column_name AS "toColumn", tc.constraint_name AS "constraintName" ' +
      'FROM information_schema.table_constraints tc ' +
      'JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.constraint_schema = tc.constraint_schema ' +
      'JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.constraint_schema ' +
      "WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.constraint_schema = current_schema() AND ccu.table_name = $1 " +
      'ORDER BY tc.table_name, kcu.column_name',
    params: [table],
  }),
  info: (table) => ({
    sql:
      'SELECT NULL AS engine, c.reltuples::bigint AS "rowCount", ' +
      'pg_total_relation_size(c.oid) AS "sizeBytes", ' +
      'NULL AS collation, NULL AS "createdAt" ' +
      'FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace ' +
      'WHERE n.nspname = current_schema() AND c.relname = $1',
    params: [table],
  }),
  createTable: () => null,
}

/** 依連線系統取得對應方言;MySQL/MariaDB 共用一組,PostgreSQL 另一組。 */
export function tableDialectFor(system: string): TableDialect {
  if (system === 'mysql' || system === 'mariadb') return mysql
  if (system === 'postgresql') return postgresql
  throw new Error(`Unsupported system for table detail: ${system}`)
}
