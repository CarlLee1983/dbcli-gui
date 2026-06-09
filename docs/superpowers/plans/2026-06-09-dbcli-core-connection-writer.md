# dbcli core 連線寫入 API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **執行所在 repo:** `/Users/carl/Dev/CMG/Dbcli`(**不是** dbcli-gui)。所有路徑相對此 repo。

**Goal:** 在 `@carllee1983/dbcli/core` 公開 barrel 新增「連線寫入」API——純函式 mutation(`upsertConnection`/`removeConnection`/`setDefaultConnection`/`migrateV1ToV2`/`envVarNameFor`)加兩個寫檔函式(沿用既有 `writeV2Config` + 新 `writeConnectionSecret`),供 dbcli-gui 連線管理 UI 使用,並發新版。

**Architecture:** mutation helper 為純函式(吃 `DbcliConfigV2` 回新 config,符合 immutability),只有 `writeConnectionSecret` 碰 env 檔。所有設定格式知識(v2 schema、`$env` per-connection 命名、env 檔位置、v1→v2 轉換)留在 core。新檔 `src/core/config-v2-mutations.ts` 收純函式 + secret 寫入;`src/core/public.ts` 補匯出。

**Tech Stack:** Bun(`bun test`、`Bun.write`、`Bun.$`)、TypeScript、zod v3、既有 `config-v2.ts` / `config-binding.ts` / `validation.ts`。

---

## 既成事實(已驗證,計畫據此而建)

- **`DbcliConfigV2`**(`src/utils/validation.ts:236-254`):`{ version: 2, default: string, connections: Record<string, NamedConnection>, schema, schemas, metadata, blacklist, audit, redis? }`。`refine`:① `connections` 至少一條;② `default` 必須存在於 `connections`。
- **`NamedConnection`(SQL)**:`SqlConnectionConfigSchema`(`system: 'postgresql'|'mysql'|'mariadb'`、`host`、`port`、`user`、`password`、`database`)`.extend({ permission, envFile? })`。`password` 可為 `string | { $env: string }`。
- **`writeV2Config(path, config)`**(`src/core/config-v2.ts:114-122`):`DbcliConfigV2Schema.parse(config)` → `resolveConfigStoragePath(path)` → 寫 `storagePath/config.json`。**收的是專案 `.dbcli` 路徑**,內部自行解析 storage。
- **`readV2Config(path)`**(`config-v2.ts:96-109`):同樣收專案路徑。
- **`resolveConfigStoragePath(path)`**(`config-binding.ts:64-67`):有 binding 回 `storagePath`,否則回原 path。
- **secret 機制**:連線 `envFile`(如 `.env.staging`)內 `KEY=VALUE`;`loadEnvFile`(`env-loader.ts:34-50`)載入 `process.env`,**且不覆寫既有 key**。故多連線在常駐程序共用 `process.env`——**`$env` 變數名必須 per-connection 命名空間化**以免撞名。
- **v1 `DbcliConfig`**(`validation.ts:186-194`):`{ connection: {system,host,port,user,password,database}, permission, schema, metadata, blacklist, audit, redis? }`。v1 密碼慣例存在專案 `.env.local` 的 `DB_PASSWORD`。
- **schema 預設**:`metadata`/`blacklist`/`audit`/`schema`/`schemas` 皆 `.optional().default(...)`;`redis` 為 `.optional()`(無 default,可省略)。
- **測試慣例**:`bun test`;測試放 `tests/unit/core/*.test.ts`;`import { describe, test, expect, beforeEach, afterEach } from 'bun:test'`;`import { x } from '@/core/...'`;temp dir 用 `/tmp/dbcli-*-test`,`beforeEach`/`afterEach` 以 `Bun.$\`rm -rf ...\`` 清理。
- **build**:`bun run scripts/build.ts` 從 `src/core/public.ts` 產 `dist/core.mjs` + `dist/core.d.ts`(`dts-bundle-generator`)。`package.json` version 目前 `1.29.0`。

---

## File Structure

- `src/core/config-v2-mutations.ts` — **建立**。純函式 `envVarNameFor` / `upsertConnection` / `removeConnection` / `setDefaultConnection` / `migrateV1ToV2` + 寫檔 `writeConnectionSecret`。`ConnectionInput` / `SqlSystem` 型別。
- `src/core/public.ts` — **修改**。補匯出 `writeV2Config`(從 config-v2)與上列 mutations + 型別。
- `tests/unit/core/config-v2-mutations.test.ts` — **建立**。純函式單元測 + secret 寫入 + 整段 round-trip(寫→讀回→resolve)整合測。
- `tests/unit/core/migrate-v1-to-v2.test.ts` — **建立**。v1→v2 migration 的 characterization 測(含密碼 round-trip)。
- `package.json` — **修改**。version bump → `1.30.0`。

**任務順序理由:** Task 1 先以 round-trip 測釘死「寫的位置=讀的位置」(spec 最高風險),其餘純函式有了安全網才接。Task 2–4 各純函式 TDD;Task 5 migration(最 fiddly,有 Task 1 round-trip 基礎)。Task 6 補 public.ts 匯出。Task 7 把 `writeV2Config` 改原子寫(spec 風險 #1)。Task 8 build 實證 `core.d.ts` 含新型別。Task 9 bump 版本 + 全測綠 + 發版。

---

## Task 1: `writeConnectionSecret` + round-trip(釘死寫/讀位置)

**Files:**
- Create: `src/core/config-v2-mutations.ts`
- Test: `tests/unit/core/config-v2-mutations.test.ts`

- [ ] **Step 1: 寫失敗測試(round-trip)**

`tests/unit/core/config-v2-mutations.test.ts`:

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { join } from 'path'
import { writeV2Config, readV2Config, resolveConnection, loadConnectionEnv } from '@/core/config-v2'
import { writeProjectBinding, getProjectStoragePath } from '@/core/config-binding'
import { envVarNameFor, writeConnectionSecret } from '@/core/config-v2-mutations'
import type { DbcliConfigV2 } from '@/utils/validation'

const TMP_DIR = '/tmp/dbcli-mutations-test'
const PROJECT = join(TMP_DIR, '.dbcli')

function baseConfig(): DbcliConfigV2 {
  return {
    version: 2,
    default: 'primary',
    connections: {
      primary: {
        system: 'mysql', host: 'localhost', port: 3306,
        user: 'root', password: { $env: 'DBCLI_PRIMARY_PASSWORD' },
        database: 'app', permission: 'query-only', envFile: '.env.primary',
      },
    },
    schema: {}, schemas: {},
    metadata: { version: '2.0' },
    blacklist: { tables: [], columns: {} },
    audit: { enabled: true, rotation: { max_bytes: 10485760, max_entries: 1000 } },
  } as DbcliConfigV2
}

describe('envVarNameFor', () => {
  test('namespaces by connection name, upper snake', () => {
    expect(envVarNameFor('primary', 'password')).toBe('DBCLI_PRIMARY_PASSWORD')
    expect(envVarNameFor('my-staging.db', 'password')).toBe('DBCLI_MY_STAGING_DB_PASSWORD')
  })
})

describe('writeConnectionSecret round-trip', () => {
  beforeEach(async () => {
    await Bun.$`rm -rf ${TMP_DIR}`
    await Bun.$`mkdir -p ${PROJECT}`
    await writeProjectBinding(PROJECT, getProjectStoragePath(PROJECT))
    await writeV2Config(PROJECT, baseConfig())
  })
  afterEach(async () => {
    await Bun.$`rm -rf ${TMP_DIR}`
    delete process.env.DBCLI_PRIMARY_PASSWORD
  })

  test('secret written under connection envFile resolves back through reader', async () => {
    await writeConnectionSecret(PROJECT, 'primary', 'password', 's3cret!')

    // reader path: read config → resolve connection → load its env file → expand {$env}
    const cfg = await readV2Config(PROJECT)
    const resolved = resolveConnection(cfg, 'primary')
    const storagePath = getProjectStoragePath(PROJECT)
    await loadConnectionEnv(resolved, storagePath)

    expect(process.env.DBCLI_PRIMARY_PASSWORD).toBe('s3cret!')
  })

  test('rewrites existing var in place (no duplicate lines)', async () => {
    await writeConnectionSecret(PROJECT, 'primary', 'password', 'first')
    await writeConnectionSecret(PROJECT, 'primary', 'password', 'second')
    const envPath = join(getProjectStoragePath(PROJECT), '.env.primary')
    const text = await Bun.file(envPath).text()
    const lines = text.split('\n').filter((l) => l.startsWith('DBCLI_PRIMARY_PASSWORD='))
    expect(lines).toEqual(['DBCLI_PRIMARY_PASSWORD=second'])
  })

  test('throws on unknown connection', () => {
    expect(writeConnectionSecret(PROJECT, 'nope', 'password', 'x')).rejects.toThrow("連線 'nope' 不存在")
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/unit/core/config-v2-mutations.test.ts`
Expected: FAIL — `Cannot find module '@/core/config-v2-mutations'`

- [ ] **Step 3: 寫最小實作**

`src/core/config-v2-mutations.ts`:

```typescript
import { join } from 'path'
import { resolveConfigStoragePath } from '@/core/config-binding'
import { readV2Config } from '@/core/config-v2'

export type SqlSystem = 'postgresql' | 'mysql' | 'mariadb'

/**
 * `$env` 變數名。per-connection 命名空間化:常駐 sidecar 共用 process.env,
 * 且 loadEnvFile 不覆寫既有 key——若兩連線都用 DB_PASSWORD 會撞名取到對方的值。
 */
export function envVarNameFor(connName: string, field: 'password'): string {
  const slug = connName.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return `DBCLI_${slug}_${field.toUpperCase()}`
}

/** 把 secret 寫進該連線的 envFile(KEY=VALUE);既有同名 key 就地覆寫,否則追加。 */
export async function writeConnectionSecret(
  projectPath: string,
  connName: string,
  field: 'password',
  value: string,
): Promise<void> {
  const config = await readV2Config(projectPath)
  const conn = config.connections[connName]
  if (!conn) throw new Error(`連線 '${connName}' 不存在`)

  const storagePath = await resolveConfigStoragePath(projectPath)
  const envFile = conn.envFile ?? `.env.${connName}`
  const envPath = join(storagePath, envFile)
  const varName = envVarNameFor(connName, field)

  let content = ''
  const file = Bun.file(envPath)
  if (await file.exists()) content = await file.text()

  const line = `${varName}=${value}`
  const re = new RegExp(`^${varName}=.*$`, 'm')
  if (re.test(content)) {
    content = content.replace(re, line)
  } else {
    content = content.length && !content.endsWith('\n') ? `${content}\n${line}\n` : `${content}${line}\n`
  }
  await Bun.write(envPath, content)
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/unit/core/config-v2-mutations.test.ts`
Expected: PASS(envVarNameFor + 3 個 round-trip 測全綠)

- [ ] **Step 5: Commit**

```bash
git add src/core/config-v2-mutations.ts tests/unit/core/config-v2-mutations.test.ts
git commit -m "feat: [core] writeConnectionSecret + envVarNameFor (per-connection env namespacing)"
```

---

## Task 2: `upsertConnection`(純函式)

**Files:**
- Modify: `src/core/config-v2-mutations.ts`
- Test: `tests/unit/core/config-v2-mutations.test.ts`(同檔加 describe)

- [ ] **Step 1: 寫失敗測試**

在 `config-v2-mutations.test.ts` 末端、`baseConfig` 之後加:

```typescript
import { upsertConnection } from '@/core/config-v2-mutations'

describe('upsertConnection', () => {
  test('adds a new connection with literal non-secrets + {$env} password + envFile', () => {
    const next = upsertConnection(baseConfig(), {
      name: 'staging', system: 'postgresql', host: 'db.stg', port: 5432, user: 'app', database: 'app',
    })
    expect(next.connections.staging).toEqual({
      system: 'postgresql', host: 'db.stg', port: 5432, user: 'app', database: 'app',
      password: { $env: 'DBCLI_STAGING_PASSWORD' },
      permission: 'query-only',
      envFile: '.env.staging',
    })
    // 不改既有連線、不改 default
    expect(next.connections.primary).toEqual(baseConfig().connections.primary)
    expect(next.default).toBe('primary')
  })

  test('does not mutate the input config (immutability)', () => {
    const input = baseConfig()
    upsertConnection(input, { name: 'staging', system: 'mysql', host: 'h', port: 3306, user: 'u', database: 'd' })
    expect(input.connections.staging).toBeUndefined()
  })

  test('edit preserves existing permission and overwrites fields', () => {
    const withRW = baseConfig()
    ;(withRW.connections.primary as { permission: string }).permission = 'read-write'
    const next = upsertConnection(withRW, {
      name: 'primary', system: 'mysql', host: 'newhost', port: 3307, user: 'root', database: 'app2',
    })
    expect(next.connections.primary.permission).toBe('read-write')
    expect(next.connections.primary.host).toBe('newhost')
    expect(next.connections.primary.port).toBe(3307)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/unit/core/config-v2-mutations.test.ts`
Expected: FAIL — `upsertConnection is not a function`(或 import 失敗)

- [ ] **Step 3: 寫最小實作**

在 `src/core/config-v2-mutations.ts` 加(並更新 import):

```typescript
import type { DbcliConfigV2 } from '@/utils/validation'

export interface ConnectionInput {
  name: string
  system: SqlSystem
  host: string
  port: number
  user: string
  database: string
}

/** 新增或就地覆寫同名連線(immutable)。非機密欄存字面值,password 存 {$env} 參照 +
 *  per-connection envFile。編輯時保留既有 permission;新建預設 'query-only'。 */
export function upsertConnection(config: DbcliConfigV2, input: ConnectionInput): DbcliConfigV2 {
  const existing = config.connections[input.name] as { permission?: string } | undefined
  const connection = {
    system: input.system,
    host: input.host,
    port: input.port,
    user: input.user,
    database: input.database,
    password: { $env: envVarNameFor(input.name, 'password') },
    permission: existing?.permission ?? 'query-only',
    envFile: `.env.${input.name}`,
  }
  return {
    ...config,
    connections: { ...config.connections, [input.name]: connection },
  } as DbcliConfigV2
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/unit/core/config-v2-mutations.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/config-v2-mutations.ts tests/unit/core/config-v2-mutations.test.ts
git commit -m "feat: [core] upsertConnection pure mutation"
```

---

## Task 3: `removeConnection`(純函式,含刪預設改派 + 擋最後一條)

**Files:**
- Modify: `src/core/config-v2-mutations.ts`
- Test: `tests/unit/core/config-v2-mutations.test.ts`

- [ ] **Step 1: 寫失敗測試**

```typescript
import { removeConnection } from '@/core/config-v2-mutations'

describe('removeConnection', () => {
  function twoConns(): DbcliConfigV2 {
    const c = baseConfig()
    return upsertConnection(c, { name: 'staging', system: 'mysql', host: 'h', port: 3306, user: 'u', database: 'd' })
  }

  test('removes a non-default connection, keeps default', () => {
    const next = removeConnection(twoConns(), 'staging')
    expect(next.connections.staging).toBeUndefined()
    expect(next.default).toBe('primary')
  })

  test('removing the default reassigns default to a remaining connection', () => {
    const next = removeConnection(twoConns(), 'primary')
    expect(next.connections.primary).toBeUndefined()
    expect(next.default).toBe('staging')
  })

  test('throws when removing the last remaining connection', () => {
    expect(() => removeConnection(baseConfig(), 'primary')).toThrow('無法刪除最後一條連線')
  })

  test('throws on unknown connection', () => {
    expect(() => removeConnection(baseConfig(), 'nope')).toThrow("連線 'nope' 不存在")
  })

  test('does not mutate input', () => {
    const input = twoConns()
    removeConnection(input, 'staging')
    expect(input.connections.staging).toBeDefined()
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/unit/core/config-v2-mutations.test.ts`
Expected: FAIL — `removeConnection is not a function`

- [ ] **Step 3: 寫最小實作**

```typescript
/** 刪除連線(immutable)。刪預設則改派為剩餘第一條;刪最後一條則擋下(v2 需至少一條)。 */
export function removeConnection(config: DbcliConfigV2, name: string): DbcliConfigV2 {
  if (!(name in config.connections)) throw new Error(`連線 '${name}' 不存在`)
  const rest = { ...config.connections }
  delete rest[name]
  const remaining = Object.keys(rest)
  if (remaining.length === 0) throw new Error('無法刪除最後一條連線')
  const nextDefault = config.default === name ? remaining[0] : config.default
  return { ...config, connections: rest, default: nextDefault } as DbcliConfigV2
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/unit/core/config-v2-mutations.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/config-v2-mutations.ts tests/unit/core/config-v2-mutations.test.ts
git commit -m "feat: [core] removeConnection with default reassignment + last-connection guard"
```

---

## Task 4: `setDefaultConnection`(純函式)

**Files:**
- Modify: `src/core/config-v2-mutations.ts`
- Test: `tests/unit/core/config-v2-mutations.test.ts`

- [ ] **Step 1: 寫失敗測試**

```typescript
import { setDefaultConnection } from '@/core/config-v2-mutations'

describe('setDefaultConnection', () => {
  function twoConns(): DbcliConfigV2 {
    return upsertConnection(baseConfig(), { name: 'staging', system: 'mysql', host: 'h', port: 3306, user: 'u', database: 'd' })
  }
  test('sets an existing connection as default', () => {
    expect(setDefaultConnection(twoConns(), 'staging').default).toBe('staging')
  })
  test('throws on unknown connection', () => {
    expect(() => setDefaultConnection(baseConfig(), 'nope')).toThrow("連線 'nope' 不存在")
  })
  test('does not mutate input', () => {
    const input = twoConns()
    setDefaultConnection(input, 'staging')
    expect(input.default).toBe('primary')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/unit/core/config-v2-mutations.test.ts`
Expected: FAIL — `setDefaultConnection is not a function`

- [ ] **Step 3: 寫最小實作**

```typescript
/** 設定預設連線(immutable)。 */
export function setDefaultConnection(config: DbcliConfigV2, name: string): DbcliConfigV2 {
  if (!(name in config.connections)) throw new Error(`連線 '${name}' 不存在`)
  return { ...config, default: name } as DbcliConfigV2
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/unit/core/config-v2-mutations.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/config-v2-mutations.ts tests/unit/core/config-v2-mutations.test.ts
git commit -m "feat: [core] setDefaultConnection pure mutation"
```

---

## Task 5: `migrateV1ToV2`(純函式,保留既有密碼慣例)

**Files:**
- Modify: `src/core/config-v2-mutations.ts`
- Test: `tests/unit/core/migrate-v1-to-v2.test.ts`

- [ ] **Step 1: 寫失敗測試**

`tests/unit/core/migrate-v1-to-v2.test.ts`:

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { join } from 'path'
import { migrateV1ToV2 } from '@/core/config-v2-mutations'
import { writeV2Config, readV2Config, resolveConnection, loadConnectionEnv } from '@/core/config-v2'
import { writeProjectBinding, getProjectStoragePath } from '@/core/config-binding'
import type { DbcliConfig } from '@/utils/validation'

const TMP_DIR = '/tmp/dbcli-migrate-test'
const PROJECT = join(TMP_DIR, '.dbcli')

function v1(): DbcliConfig {
  return {
    connection: { system: 'mariadb', host: 'localhost', port: 3306, user: 'root', password: '', database: 'app' },
    permission: 'query-only',
    schema: {},
    metadata: { version: '1.0' },
    blacklist: { tables: ['secrets'], columns: { users: ['ssn'] } },
    audit: { enabled: true, rotation: { max_bytes: 10485760, max_entries: 1000 } },
  } as DbcliConfig
}

describe('migrateV1ToV2', () => {
  test('produces a valid v2 with a single "default" connection', () => {
    const out = migrateV1ToV2(v1())
    expect(out.version).toBe(2)
    expect(out.default).toBe('default')
    expect(Object.keys(out.connections)).toEqual(['default'])
    expect(out.connections.default.system).toBe('mariadb')
    expect(out.connections.default.host).toBe('localhost')
    // 既有密碼慣例:legacy .env.local 的 DB_PASSWORD
    expect(out.connections.default.password).toEqual({ $env: 'DB_PASSWORD' })
    expect(out.connections.default.envFile).toBe('.env.local')
    expect(out.connections.default.permission).toBe('query-only')
  })

  test('carries over blacklist / audit / metadata', () => {
    const out = migrateV1ToV2(v1())
    expect(out.blacklist).toEqual({ tables: ['secrets'], columns: { users: ['ssn'] } })
    expect(out.audit.enabled).toBe(true)
  })

  test('migrated config + legacy .env.local round-trips the password', async () => {
    await Bun.$`rm -rf ${TMP_DIR}`
    await Bun.$`mkdir -p ${PROJECT}`
    const storagePath = getProjectStoragePath(PROJECT)
    await writeProjectBinding(PROJECT, storagePath)
    // 模擬 v1 的 legacy secret 檔(已在 storage 內)
    await Bun.write(join(storagePath, '.env.local'), 'DB_PASSWORD=legacy-pw\n')

    await writeV2Config(PROJECT, migrateV1ToV2(v1()))   // parse 通過 = schema 合法

    const cfg = await readV2Config(PROJECT)
    const resolved = resolveConnection(cfg, 'default')
    await loadConnectionEnv(resolved, storagePath)
    expect(process.env.DB_PASSWORD).toBe('legacy-pw')
  })

  afterEach(async () => {
    await Bun.$`rm -rf ${TMP_DIR}`
    delete process.env.DB_PASSWORD
  })
  beforeEach(async () => { delete process.env.DB_PASSWORD })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/unit/core/migrate-v1-to-v2.test.ts`
Expected: FAIL — `migrateV1ToV2 is not a function`

- [ ] **Step 3: 寫最小實作**

在 `src/core/config-v2-mutations.ts` 加(更新 `DbcliConfig` import):

```typescript
import type { DbcliConfig } from '@/utils/validation'

/**
 * v1 單連線 → v2,產生唯一 'default' 連線。沿用 v1 既有密碼慣例:legacy
 * `.env.local` 的 `DB_PASSWORD`,故 default 連線 envFile 指向 '.env.local'、
 * password 設 {$env:'DB_PASSWORD'},不搬動既有 secret。blacklist/audit/metadata 原樣帶過。
 */
export function migrateV1ToV2(v1: DbcliConfig): DbcliConfigV2 {
  const c = v1.connection as {
    system: SqlSystem; host: string; port: number; user: string; database: string
  }
  return {
    version: 2,
    default: 'default',
    connections: {
      default: {
        system: c.system, host: c.host, port: c.port, user: c.user, database: c.database,
        password: { $env: 'DB_PASSWORD' },
        permission: v1.permission ?? 'query-only',
        envFile: '.env.local',
      },
    },
    schema: {},
    schemas: {},
    metadata: v1.metadata ?? { version: '2.0' },
    blacklist: v1.blacklist ?? { tables: [], columns: {} },
    audit: v1.audit ?? { enabled: true, rotation: { max_bytes: 10485760, max_entries: 1000 } },
  } as DbcliConfigV2
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/unit/core/migrate-v1-to-v2.test.ts`
Expected: PASS(含 round-trip)

> 若 round-trip 測 fail 於 `writeV2Config` 的 `DbcliConfigV2Schema.parse`,代表帶過的欄位形狀與 schema 不符——讀 `src/utils/validation.ts:236-254` 對齊 `metadata`/`blacklist`/`audit` 的確切預設形狀後修正物件(這是本任務的核心驗證點)。

- [ ] **Step 5: Commit**

```bash
git add src/core/config-v2-mutations.ts tests/unit/core/migrate-v1-to-v2.test.ts
git commit -m "feat: [core] migrateV1ToV2 preserving legacy .env.local password"
```

---

## Task 6: 補 `public.ts` 公開匯出

**Files:**
- Modify: `src/core/public.ts`
- Test: `tests/unit/core/public-exports.test.ts`(建立)

- [ ] **Step 1: 寫失敗測試**

`tests/unit/core/public-exports.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test'
import * as core from '@/core/public'

describe('public core barrel exposes the connection writer surface', () => {
  test('exports writer + mutations', () => {
    for (const name of [
      'writeV2Config', 'writeConnectionSecret', 'envVarNameFor',
      'upsertConnection', 'removeConnection', 'setDefaultConnection', 'migrateV1ToV2',
    ]) {
      expect(typeof (core as Record<string, unknown>)[name]).toBe('function')
    }
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/unit/core/public-exports.test.ts`
Expected: FAIL — `writeV2Config` 等為 `undefined`(尚未匯出)

- [ ] **Step 3: 寫最小實作**

在 `src/core/public.ts` 的 config 區塊加匯出。把既有

```typescript
export {
  resolveConnection,
  listConnections,
  readV2Config,
  loadConnectionEnv,
  detectConfigVersion,
} from '@/core/config-v2'
```

改為(補 `writeV2Config`):

```typescript
export {
  resolveConnection,
  listConnections,
  readV2Config,
  writeV2Config,
  loadConnectionEnv,
  detectConfigVersion,
} from '@/core/config-v2'
```

並在其後新增:

```typescript
// ── Config write (連線管理:GUI/CLI 共用) ──
export {
  envVarNameFor,
  writeConnectionSecret,
  upsertConnection,
  removeConnection,
  setDefaultConnection,
  migrateV1ToV2,
} from '@/core/config-v2-mutations'
export type { ConnectionInput, SqlSystem } from '@/core/config-v2-mutations'
```

並擴充既有的 config-binding 匯出(GUI sidecar 的整合測需要 `writeProjectBinding` 建 temp 專案綁定、`getProjectStoragePath` 算 storage 路徑)。把

```typescript
export { resolveConfigStoragePath } from '@/core/config-binding'
```

改為:

```typescript
export { resolveConfigStoragePath, writeProjectBinding, getProjectStoragePath } from '@/core/config-binding'
```

並在 Step 1 的 `public-exports.test.ts` 斷言陣列加入 `'writeProjectBinding'`、`'getProjectStoragePath'`。

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/unit/core/public-exports.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/public.ts tests/unit/core/public-exports.test.ts
git commit -m "feat: [core] export connection writer API from public barrel"
```

---

## Task 7: `writeV2Config` 改原子寫(temp + rename)

> spec 風險 #1:寫設定中途崩潰不可毀掉使用者真實設定庫。改 `writeV2Config` 以暫存檔寫入再 rename 覆蓋(同檔系 rename 為原子操作)。GUI 與 CLI 同時受惠。

**Files:**
- Modify: `src/core/config-v2.ts:114-122`
- Test: `tests/unit/core/config-v2-atomic-write.test.ts`(建立)

- [ ] **Step 1: 寫失敗測試**

`tests/unit/core/config-v2-atomic-write.test.ts`:

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { join } from 'path'
import { writeV2Config, readV2Config } from '@/core/config-v2'
import { writeProjectBinding, getProjectStoragePath } from '@/core/config-binding'
import type { DbcliConfigV2 } from '@/utils/validation'

const TMP = '/tmp/dbcli-atomic-test'
const PROJECT = join(TMP, '.dbcli')

function cfg(defaultName: string): DbcliConfigV2 {
  return {
    version: 2, default: defaultName,
    connections: { [defaultName]: { system: 'mysql', host: 'h', port: 3306, user: 'u', password: '', database: 'd', permission: 'query-only' } },
    schema: {}, schemas: {}, metadata: { version: '2.0' },
    blacklist: { tables: [], columns: {} },
    audit: { enabled: true, rotation: { max_bytes: 10485760, max_entries: 1000 } },
  } as DbcliConfigV2
}

describe('writeV2Config atomic write', () => {
  beforeEach(async () => {
    await Bun.$`rm -rf ${TMP}`; await Bun.$`mkdir -p ${PROJECT}`
    await writeProjectBinding(PROJECT, getProjectStoragePath(PROJECT))
  })
  afterEach(async () => { await Bun.$`rm -rf ${TMP}` })

  test('writes config readable back; leaves no .tmp behind', async () => {
    await writeV2Config(PROJECT, cfg('primary'))
    expect((await readV2Config(PROJECT)).default).toBe('primary')
    const storage = getProjectStoragePath(PROJECT)
    expect(await Bun.file(join(storage, 'config.json.tmp')).exists()).toBe(false)
  })

  test('overwriting keeps the file valid (no partial state)', async () => {
    await writeV2Config(PROJECT, cfg('primary'))
    await writeV2Config(PROJECT, cfg('secondary'))
    expect((await readV2Config(PROJECT)).default).toBe('secondary')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `bun test tests/unit/core/config-v2-atomic-write.test.ts`
Expected: 第一個案例可能已過(若舊實作剛好無 .tmp);關鍵是建立測試基線。若全過,仍續 Step 3 強化實作以保證原子性。

- [ ] **Step 3: 改實作為 temp + rename**

`src/core/config-v2.ts` 的 `writeV2Config`(原 114-122)改為:

```typescript
export async function writeV2Config(path: string, config: DbcliConfigV2): Promise<void> {
  DbcliConfigV2Schema.parse(config)
  const storagePath = await resolveConfigStoragePath(path)
  const configPath = join(storagePath, 'config.json')
  const tmpPath = `${configPath}.tmp`
  await Bun.$`mkdir -p ${storagePath}`
  const json = JSON.stringify(config, null, 2)
  await Bun.write(tmpPath, json)
  await Bun.$`mv -f ${tmpPath} ${configPath}` // 同檔系 rename:原子覆寫
}
```

(若檔案頂部尚未 import `join`,沿用既有 import。)

- [ ] **Step 4: 跑測試確認通過**

Run: `bun test tests/unit/core/config-v2-atomic-write.test.ts && bun test`
Expected: 新測 + 全測綠(既有 config 測仍過,因對外行為不變)。

- [ ] **Step 5: Commit**

```bash
git add src/core/config-v2.ts tests/unit/core/config-v2-atomic-write.test.ts
git commit -m "fix: [core] writeV2Config atomic temp+rename to protect the config store"
```

---

## Task 8: build 驗證(`core.d.ts` 含新型別)

**Files:**
- (無新檔;驗證 build 產物)

- [ ] **Step 1: 全測 + build**

Run:
```bash
bun test
bun run build
```
Expected: 全測綠;build 無誤產出 `dist/core.mjs` + `dist/core.d.ts`。

- [ ] **Step 2: 驗證型別宣告含新匯出**

Run:
```bash
grep -E "writeV2Config|writeConnectionSecret|upsertConnection|removeConnection|setDefaultConnection|migrateV1ToV2|ConnectionInput" dist/core.d.ts
```
Expected: 每個名稱皆出現(代表 dts-bundle-generator 有收進公開型別)。

> 若某名稱缺漏:確認它在 `public.ts` 確實 `export`(值)或 `export type`(型別),re-run `bun run build`。

- [ ] **Step 3: Commit(若 build 產物進版控)**

```bash
git add -A
git commit -m "build: [core] regenerate core bundle with connection writer API" || echo "no build artifacts tracked — skip"
```

> 註:若此 repo 的 `dist/` 在 `.gitignore`(發版時才 build),此步可只跑不 commit。

---

## Task 9: bump 版本 + 發版前驗收

**Files:**
- Modify: `package.json`

- [ ] **Step 1: bump version**

把 `package.json` 的 `"version": "1.29.0"` 改為 `"version": "1.30.0"`。

- [ ] **Step 2: 全測 + typecheck 綠**

Run:
```bash
bun test
bunx tsc --noEmit
```
Expected: 全綠。

- [ ] **Step 3: Commit + tag**

```bash
git add package.json
git commit -m "chore: [core] release 1.30.0 — connection writer API"
git tag v1.30.0
```

- [ ] **Step 4: 發版(依專案既有流程)**

Run(確認登入 npm 後):
```bash
npm publish --access public
```
Expected: `@carllee1983/dbcli@1.30.0` 發佈成功(`prepublishOnly` 會自動 `bun run build`)。

> dbcli-gui 計畫 2 階段 B 會 `bun add @carllee1983/dbcli@^1.30.0` 取用。

---

## Self-Review 註記

- **Spec 覆蓋**:core API 五函式 + 兩寫檔函式 + public 匯出 + 發版 → Task 1–8 全覆蓋。
- **型別一致**:`ConnectionInput`/`SqlSystem` 於 Task 2 定義,Task 6 匯出;`envVarNameFor(name,'password')` 簽章跨 Task 1/2 一致;`writeConnectionSecret(projectPath, …)` 收專案路徑與 `writeV2Config` 一致。
- **最高風險(env 寫/讀位置)**:Task 1 與 Task 5 各有真實 round-trip 測(寫→讀回→`loadConnectionEnv`→斷言 `process.env`)作安全網。
- **與 v2 schema 衝突點**:刪最後一條連線在 Task 3 擋下(對齊 schema `connections` 至少一條)。
