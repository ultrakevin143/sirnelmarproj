require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const { Pool } = require('pg');
const { seedDefaultPlan } = require('./plans');

// node-postgres returns COUNT(*) as a string (int8); the API historically exposed numbers.
require('pg').types.setTypeParser(20, Number);

const migrationsDirectory = path.join(__dirname, '..', 'migrations');
const memoryDatabases = new Map();

function quoteIdentifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error('Database schema name is invalid.');
  return `"${value.replaceAll('"', '""')}"`;
}

function prepareSql(sql) {
  let index = 0;
  return sql
    .replace(/\?/g, () => `$${++index}`)
    .replace(/\bAS\s+([a-z_][a-z0-9_]*)/gi, (match, alias) =>
      /[A-Z]/.test(alias) ? `AS "${alias}"` : match,
    )
    .replace(/^\s*INSERT\s+OR\s+IGNORE\s+INTO/i, 'INSERT INTO ON CONFLICT DO NOTHING');
}

class PostgresDatabase {
  constructor(pool, { schema = 'public', memory = false } = {}) {
    this.pool = pool;
    this.schema = schema;
    this.memory = memory;
    this.transactionContext = new AsyncLocalStorage();
  }

  async query(sql, params = []) {
    const transactionClient = this.transactionContext.getStore();
    if (transactionClient) return transactionClient.query(sql, params);
    if (this.memory) return this.pool.query(sql, params);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO ${quoteIdentifier(this.schema)}`);
      const result = await client.query(sql, params);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  prepare(sql) {
    const statement = prepareSql(sql.trim());
    return {
      get: async (...params) => (await this.query(statement, params)).rows[0],
      all: async (...params) => (await this.query(statement, params)).rows,
      run: async (...params) => {
        const insert = /^INSERT\b/i.test(statement) && !/\bRETURNING\b/i.test(statement);
        if (insert && /\bINSERT\s+INTO\s+schema_migrations\b/i.test(statement)) {
          const result = await this.query(statement, params);
          return { changes: result.rowCount };
        }
        if (insert && this.memory) {
          const table = statement.match(/^INSERT\s+INTO\s+([\w"]+)/i)?.[1]?.replaceAll('"', '');
          const result = await this.query(`${statement} RETURNING id`, params);
          const id = result.rows[0]?.id;
          return { changes: result.rowCount, lastInsertRowid: id };
        }
        const result = await this.query(insert ? `${statement} RETURNING id` : statement, params);
        return { changes: result.rowCount, lastInsertRowid: result.rows[0]?.id };
      },
    };
  }

  async exec(sql) {
    return this.query(sql);
  }

  async transaction(callback) {
    const currentClient = this.transactionContext.getStore();
    if (currentClient) return callback();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (!this.memory) await client.query(`SET LOCAL search_path TO ${quoteIdentifier(this.schema)}`);
      const result = await this.transactionContext.run(client, callback);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback failure if connection was already severed
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async close({ dropSchema } = {}) {
    if (dropSchema && (dropSchema !== this.schema || !/^gymtracker_test_\d+_[a-f0-9]{32}$/.test(dropSchema))) {
      throw new Error('Only this connection’s generated test schema can be dropped.');
    }
    await this.pool.end();
    if (dropSchema && !this.memory) {
      const admin = new Pool({ connectionString: process.env.DATABASE_URL });
      try {
        await admin.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(dropSchema)} CASCADE`);
      } finally {
        await admin.end();
      }
    }
    if (this.memory && !this.preserveMemory) memoryDatabases.delete(this.memoryKey);
  }
}

async function runMigrations(database) {
  if (database.memory) {
    await database.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT, applied_at TEXT)');
  } else {
    await database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      )
    `);
  }
  const appliedMigrations = new Set(
    (await database.prepare('SELECT version FROM schema_migrations').all()).map((row) => row.version),
  );
  const migrations = fs.readdirSync(migrationsDirectory)
    .filter((fileName) => /^\d+_[a-z0-9_-]+\.sql$/i.test(fileName))
    .sort();

  for (const fileName of migrations) {
    if (appliedMigrations.has(fileName)) continue;
    const sql = fs.readFileSync(path.join(migrationsDirectory, fileName), 'utf8');
    await database.transaction(async () => {
      await database.exec(sql);
      await database.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
        .run(fileName, new Date().toISOString());
    });
  }
}

async function openDatabase({ schema = process.env.DATABASE_SCHEMA || 'public', testSchema = false, memory = false } = {}) {
  const connectionString = process.env.DATABASE_URL;
  quoteIdentifier(schema);

  if (memory) {
    const { newDb, DataType } = require('pg-mem');
    const memoryKey = `${schema}_${randomUUID()}`;
    let mem = memoryDatabases.get(memoryKey);
    if (!mem) {
      mem = newDb({ autoCreateForeignKeyIndices: true });
      mem.public.registerFunction({ name: 'current_database', returns: DataType.text, implementation: () => 'gymtracker_test' });
      mem.public.registerFunction({ name: 'current_schema', returns: DataType.text, implementation: () => schema });
      memoryDatabases.set(memoryKey, mem);
    }
    const adapter = mem.adapters.createPg();
    const clientPool = new adapter.Pool();
    const database = new PostgresDatabase({
      query: (...args) => clientPool.query(...args),
      connect: () => clientPool.connect(),
      end: () => clientPool.end(),
    }, { schema, memory: true });
    database.schema = schema;
    database.testSchema = true;
    database.memory = true;
    database.memoryKey = memoryKey;
    try {
      await runMigrations(database);
      await seedDefaultPlan(database);
      return database;
    } catch (error) {
      await database.close();
      throw error;
    }
  }

  if (!connectionString) throw new Error('DATABASE_URL is required. Set it in backend-express/.env; database credentials are server-only.');
  if (testSchema) {
    if (!/^gymtracker_test_\d+_[a-f0-9]{32}$/.test(schema)) throw new Error('A generated test schema is required.');
    const admin = new Pool({ connectionString });
    try {
      await admin.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`);
    } finally {
      await admin.end();
    }
  }

  const pool = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 10000,
  });
  pool.on('error', (err) => {
    console.error('Unexpected database pool error:', err.message);
  });
  const database = new PostgresDatabase(pool, { schema });
  database.schema = schema;
  database.testSchema = testSchema;
  try {
    await runMigrations(database);
    await seedDefaultPlan(database);
    return database;
  } catch (error) {
    await database.close({ dropSchema: testSchema ? schema : undefined });
    throw error;
  }
}

function newTestSchema() {
  return `gymtracker_test_${process.pid}_${randomUUID().replaceAll('-', '')}`;
}

module.exports = { openDatabase, runMigrations, newTestSchema, PostgresDatabase };
