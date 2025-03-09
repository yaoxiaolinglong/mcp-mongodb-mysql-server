#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import * as mysql from 'mysql2/promise';
import { MongoClient, Db, Collection, Document } from 'mongodb';
import { config } from 'dotenv';
import { parse as parseUrl } from 'url';
import path from 'path';

// Load environment variables
config();

interface DatabaseConfig {
  host: string;
  user: string;
  password: string;
  database: string;
}

// MongoDB配置接口
interface MongoDBConfig {
  uri: string;
  database: string;
  options?: any;
}

// New type definitions
interface SSLConfig {
  ca?: string;
  cert?: string;
  key?: string;
  rejectUnauthorized?: boolean;
}

interface ConnectionConfig extends DatabaseConfig {
  ssl?: SSLConfig;
  connectionTimeout?: number;
  connectRetry?: {
    maxAttempts: number;
    delay: number;
  };
}

interface SchemaField {
  name: string;
  type: string;
  length?: number;
  nullable?: boolean;
  default?: string | number | null;
  autoIncrement?: boolean;
  primary?: boolean;
}

interface IndexDefinition {
  name: string;
  columns: string[];
  unique?: boolean;
}

// Type guard for error objects
function isErrorWithMessage(error: unknown): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as Record<string, unknown>).message === 'string'
  );
}

// Helper to get error message
function getErrorMessage(error: unknown): string {
  if (isErrorWithMessage(error)) {
    return error.message;
  }
  return String(error);
}

class MySQLServer {
  private server: Server;
  private connection: mysql.Connection | null = null;
  private config: DatabaseConfig | null = null;
  private currentWorkspace: string | null = null;
  
  // MongoDB相关属性
  private mongoClient: MongoClient | null = null;
  private mongoDB: Db | null = null;
  private mongoConfig: MongoDBConfig | null = null;

  constructor() {
    this.server = new Server(
      {
        name: 'mysql-mongodb-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();

    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });
  }

  private async cleanup() {
    if (this.connection) {
      await this.connection.end();
    }
    
    // 关闭MongoDB连接
    if (this.mongoClient) {
      await this.mongoClient.close();
    }
    
    await this.server.close();
  }

  private async ensureConnection() {
    if (!this.config) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Database configuration not set. Use connect_db tool first.'
      );
    }

    if (!this.connection) {
      try {
        this.connection = await mysql.createConnection(this.config);
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to connect to database: ${getErrorMessage(error)}`
        );
      }
    }
  }

  // 确保MongoDB连接
  private async ensureMongoConnection() {
    if (!this.mongoConfig) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'MongoDB configuration not set. Use connect_mongodb tool first.'
      );
    }

    if (!this.mongoClient) {
      try {
        this.mongoClient = new MongoClient(this.mongoConfig.uri, this.mongoConfig.options);
        await this.mongoClient.connect();
        this.mongoDB = this.mongoClient.db(this.mongoConfig.database);
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to connect to MongoDB: ${getErrorMessage(error)}`
        );
      }
    }
  }

  // 解析MongoDB连接URL
  private parseMongoConnectionUrl(url: string): MongoDBConfig {
    try {
      const parsed = parseUrl(url);
      if (!parsed.hostname) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Invalid MongoDB connection URL'
        );
      }

      const database = parsed.pathname?.slice(1);
      if (!database) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Database name must be specified in MongoDB URL'
        );
      }

      return {
        uri: url,
        database: database
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid MongoDB connection URL: ${getErrorMessage(error)}`
      );
    }
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'connect_db',
          description: 'Connect to MySQL database using URL or config',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'Database URL (mysql://user:pass@host:port/db)',
                optional: true
              },
              workspace: {
                type: 'string',
                description: 'Project workspace path',
                optional: true
              },
              // Keep existing connection params as fallback
              host: { type: 'string', optional: true },
              user: { type: 'string', optional: true },
              password: { type: 'string', optional: true },
              database: { type: 'string', optional: true }
            },
            // No required fields - will try different connection methods
          },
        },
        // MongoDB连接工具
        {
          name: 'connect_mongodb',
          description: 'Connect to MongoDB database using URL or config',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'MongoDB URL (mongodb://user:pass@host:port/db)',
                optional: true
              },
              workspace: {
                type: 'string',
                description: 'Project workspace path',
                optional: true
              },
              database: { 
                type: 'string', 
                description: 'MongoDB database name',
                optional: true 
              }
            },
            // No required fields - will try different connection methods
          },
        },
        {
          name: 'query',
          description: 'Execute a SELECT query',
          inputSchema: {
            type: 'object',
            properties: {
              sql: {
                type: 'string',
                description: 'SQL SELECT query',
              },
              params: {
                type: 'array',
                items: {
                  type: ['string', 'number', 'boolean', 'null'],
                },
                description: 'Query parameters (optional)',
              },
            },
            required: ['sql'],
          },
        },
        {
          name: 'execute',
          description: 'Execute an INSERT, UPDATE, or DELETE query',
          inputSchema: {
            type: 'object',
            properties: {
              sql: {
                type: 'string',
                description: 'SQL query (INSERT, UPDATE, DELETE)',
              },
              params: {
                type: 'array',
                items: {
                  type: ['string', 'number', 'boolean', 'null'],
                },
                description: 'Query parameters (optional)',
              },
            },
            required: ['sql'],
          },
        },
        {
          name: 'list_tables',
          description: 'List all tables in the database',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'describe_table',
          description: 'Get table structure',
          inputSchema: {
            type: 'object',
            properties: {
              table: {
                type: 'string',
                description: 'Table name',
              },
            },
            required: ['table'],
          },
        },
        {
          name: 'create_table',
          description: 'Create a new table in the database',
          inputSchema: {
            type: 'object',
            properties: {
              table: {
                type: 'string',
                description: 'Table name',
              },
              fields: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    type: { type: 'string' },
                    length: { type: 'number', optional: true },
                    nullable: { type: 'boolean', optional: true },
                    default: {
                      type: ['string', 'number', 'null'],
                      optional: true
                    },
                    autoIncrement: { type: 'boolean', optional: true },
                    primary: { type: 'boolean', optional: true }
                  },
                  required: ['name', 'type']
                }
              },
              indexes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    columns: {
                      type: 'array',
                      items: { type: 'string' }
                    },
                    unique: { type: 'boolean', optional: true }
                  },
                  required: ['name', 'columns']
                },
                optional: true
              }
            },
            required: ['table', 'fields']
          }
        },
        {
          name: 'add_column',
          description: 'Add a new column to existing table',
          inputSchema: {
            type: 'object',
            properties: {
              table: { type: 'string' },
              field: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: { type: 'string' },
                  length: { type: 'number', optional: true },
                  nullable: { type: 'boolean', optional: true },
                  default: {
                    type: ['string', 'number', 'null'],
                    optional: true
                  }
                },
                required: ['name', 'type']
              }
            },
            required: ['table', 'field']
          }
        },
        // MongoDB相关工具
        {
          name: 'mongodb_list_collections',
          description: 'List all collections in the MongoDB database',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'mongodb_find',
          description: 'Find documents in a MongoDB collection',
          inputSchema: {
            type: 'object',
            properties: {
              collection: {
                type: 'string',
                description: 'Collection name',
              },
              filter: {
                type: 'object',
                description: 'MongoDB query filter',
                optional: true
              },
              limit: {
                type: 'number',
                description: 'Maximum number of documents to return',
                optional: true
              },
              skip: {
                type: 'number',
                description: 'Number of documents to skip',
                optional: true
              },
              sort: {
                type: 'object',
                description: 'Sort criteria',
                optional: true
              }
            },
            required: ['collection'],
          },
        },
        {
          name: 'mongodb_insert',
          description: 'Insert documents into a MongoDB collection',
          inputSchema: {
            type: 'object',
            properties: {
              collection: {
                type: 'string',
                description: 'Collection name',
              },
              documents: {
                type: 'array',
                items: {
                  type: 'object',
                },
                description: 'Documents to insert',
              },
            },
            required: ['collection', 'documents'],
          },
        },
        {
          name: 'mongodb_update',
          description: 'Update documents in a MongoDB collection',
          inputSchema: {
            type: 'object',
            properties: {
              collection: {
                type: 'string',
                description: 'Collection name',
              },
              filter: {
                type: 'object',
                description: 'MongoDB query filter',
              },
              update: {
                type: 'object',
                description: 'MongoDB update operations',
              },
              many: {
                type: 'boolean',
                description: 'Update multiple documents if true',
                optional: true
              }
            },
            required: ['collection', 'filter', 'update'],
          },
        },
        {
          name: 'mongodb_delete',
          description: 'Delete documents from a MongoDB collection',
          inputSchema: {
            type: 'object',
            properties: {
              collection: {
                type: 'string',
                description: 'Collection name',
              },
              filter: {
                type: 'object',
                description: 'MongoDB query filter',
              },
              many: {
                type: 'boolean',
                description: 'Delete multiple documents if true',
                optional: true
              }
            },
            required: ['collection', 'filter'],
          },
        },
        {
          name: 'mongodb_create_collection',
          description: 'Create a new collection in MongoDB',
          inputSchema: {
            type: 'object',
            properties: {
              collection: {
                type: 'string',
                description: 'Collection name',
              },
              options: {
                type: 'object',
                description: 'Collection options',
                optional: true
              }
            },
            required: ['collection'],
          },
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'connect_db':
          return await this.handleConnectDb(request.params.arguments);
        case 'query':
          return await this.handleQuery(request.params.arguments);
        case 'execute':
          return await this.handleExecute(request.params.arguments);
        case 'list_tables':
          return await this.handleListTables();
        case 'describe_table':
          return await this.handleDescribeTable(request.params.arguments);
        case 'create_table':
          return await this.handleCreateTable(request.params.arguments);
        case 'add_column':
          return await this.handleAddColumn(request.params.arguments);
        // MongoDB工具处理
        case 'connect_mongodb':
          return await this.handleConnectMongoDB(request.params.arguments);
        case 'mongodb_list_collections':
          return await this.handleMongoDBListCollections();
        case 'mongodb_find':
          return await this.handleMongoDBFind(request.params.arguments);
        case 'mongodb_insert':
          return await this.handleMongoDBInsert(request.params.arguments);
        case 'mongodb_update':
          return await this.handleMongoDBUpdate(request.params.arguments);
        case 'mongodb_delete':
          return await this.handleMongoDBDelete(request.params.arguments);
        case 'mongodb_create_collection':
          return await this.handleMongoDBCreateCollection(request.params.arguments);
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  private async loadWorkspaceConfig(workspace: string): Promise<ConnectionConfig | null> {
    try {
      // Try loading .env from the workspace
      const envPath = path.join(workspace, '.env');
      const workspaceEnv = require('dotenv').config({ path: envPath });

      if (workspaceEnv.error) {
        return null;
      }

      const { DATABASE_URL, DB_HOST, DB_USER, DB_PASSWORD, DB_DATABASE } = workspaceEnv.parsed;

      if (DATABASE_URL) {
        return this.parseConnectionUrl(DATABASE_URL);
      }

      if (DB_HOST && DB_USER && DB_PASSWORD && DB_DATABASE) {
        return {
          host: DB_HOST,
          user: DB_USER,
          password: DB_PASSWORD,
          database: DB_DATABASE
        };
      }

      return null;
    } catch (error) {
      console.error('Error loading workspace config:', error);
      return null;
    }
  }

  private async handleConnectDb(args: any) {
    let config: ConnectionConfig | null = null;

    // Priority 1: Direct URL
    if (args.url) {
      config = this.parseConnectionUrl(args.url);
    }
    // Priority 2: Workspace config
    else if (args.workspace) {
      this.currentWorkspace = args.workspace;
      config = await this.loadWorkspaceConfig(args.workspace);
    }
    // Priority 3: Individual connection params
    else if (args.host && args.user && args.password && args.database) {
      config = {
        host: args.host,
        user: args.user,
        password: args.password,
        database: args.database
      };
    }

    if (!config) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'No valid database configuration provided. Please provide either a URL, workspace path, or connection parameters.'
      );
    }

    // Close existing connection if any
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
    }

    this.config = config;

    try {
      await this.ensureConnection();
      return {
        content: [
          {
            type: 'text',
            text: `Successfully connected to database ${config.database} at ${config.host}`
          }
        ]
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to connect to database: ${getErrorMessage(error)}`
      );
    }
  }

  private parseConnectionUrl(url: string): ConnectionConfig {
    const parsed = parseUrl(url);
    if (!parsed.host || !parsed.auth) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid connection URL'
      );
    }

    const [user, password] = parsed.auth.split(':');
    const database = parsed.pathname?.slice(1);

    if (!database) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Database name must be specified in URL'
      );
    }

    return {
      host: parsed.hostname!,
      user,
      password: password || '',
      database,
      ssl: parsed.protocol === 'mysqls:' ? { rejectUnauthorized: true } : undefined
    };
  }

  private async handleQuery(args: any) {
    await this.ensureConnection();

    if (!args.sql) {
      throw new McpError(ErrorCode.InvalidParams, 'SQL query is required');
    }

    if (!args.sql.trim().toUpperCase().startsWith('SELECT')) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Only SELECT queries are allowed with query tool'
      );
    }

    try {
      const [rows] = await this.connection!.query(args.sql, args.params || []);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(rows, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Query execution failed: ${getErrorMessage(error)}`
      );
    }
  }

  private async handleExecute(args: any) {
    await this.ensureConnection();

    if (!args.sql) {
      throw new McpError(ErrorCode.InvalidParams, 'SQL query is required');
    }

    const sql = args.sql.trim().toUpperCase();
    if (sql.startsWith('SELECT')) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Use query tool for SELECT statements'
      );
    }

    try {
      const [result] = await this.connection!.query(args.sql, args.params || []);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Query execution failed: ${getErrorMessage(error)}`
      );
    }
  }

  private async handleListTables() {
    await this.ensureConnection();

    try {
      const [rows] = await this.connection!.query('SHOW TABLES');
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(rows, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list tables: ${getErrorMessage(error)}`
      );
    }
  }

  private async handleDescribeTable(args: any) {
    await this.ensureConnection();

    if (!args.table) {
      throw new McpError(ErrorCode.InvalidParams, 'Table name is required');
    }

    try {
      const [rows] = await this.connection!.query('DESCRIBE ??', [args.table]);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(rows, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to describe table: ${getErrorMessage(error)}`
      );
    }
  }

  private async handleCreateTable(args: any) {
    await this.ensureConnection();

    const fields = args.fields.map((field: SchemaField) => {
      let def = `\`${field.name}\` ${field.type.toUpperCase()}`;
      if (field.length) def += `(${field.length})`;
      if (field.nullable === false) def += ' NOT NULL';
      if (field.default !== undefined) {
        def += ` DEFAULT ${field.default === null ? 'NULL' : `'${field.default}'`}`;
      }
      if (field.autoIncrement) def += ' AUTO_INCREMENT';
      if (field.primary) def += ' PRIMARY KEY';
      return def;
    });

    const indexes = args.indexes?.map((idx: IndexDefinition) => {
      const type = idx.unique ? 'UNIQUE INDEX' : 'INDEX';
      return `${type} \`${idx.name}\` (\`${idx.columns.join('`, `')}\`)`;
    }) || [];

    const sql = `CREATE TABLE \`${args.table}\` (
      ${[...fields, ...indexes].join(',\n      ')}
    )`;

    try {
      await this.connection!.query(sql);
      return {
        content: [
          {
            type: 'text',
            text: `Table ${args.table} created successfully`
          }
        ]
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to create table: ${getErrorMessage(error)}`
      );
    }
  }

  private async handleAddColumn(args: any) {
    await this.ensureConnection();

    if (!args.table || !args.field) {
      throw new McpError(ErrorCode.InvalidParams, 'Table name and field are required');
    }

    let sql = `ALTER TABLE \`${args.table}\` ADD COLUMN \`${args.field.name}\` ${args.field.type.toUpperCase()}`;
    if (args.field.length) sql += `(${args.field.length})`;
    if (args.field.nullable === false) sql += ' NOT NULL';
    if (args.field.default !== undefined) {
      sql += ` DEFAULT ${args.field.default === null ? 'NULL' : `'${args.field.default}'`}`;
    }

    try {
      await this.connection!.query(sql);
      return {
        content: [
          {
            type: 'text',
            text: `Column ${args.field.name} added to table ${args.table}`
          }
        ]
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to add column: ${getErrorMessage(error)}`
      );
    }
  }

  // MongoDB工具处理方法
  private async handleConnectMongoDB(args: any) {
    let config: MongoDBConfig | null = null;

    // 优先使用URL
    if (args.url) {
      config = this.parseMongoConnectionUrl(args.url);
    }
    // 其次使用工作区配置
    else if (args.workspace) {
      this.currentWorkspace = args.workspace;
      config = await this.loadMongoWorkspaceConfig(args.workspace);
    }
    // 最后使用单独的参数
    else if (args.database) {
      config = {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
        database: args.database
      };
    }

    if (!config) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'No valid MongoDB configuration provided. Please provide either a URL, workspace path, or database name.'
      );
    }

    // 关闭现有连接
    if (this.mongoClient) {
      await this.mongoClient.close();
      this.mongoClient = null;
      this.mongoDB = null;
    }

    this.mongoConfig = config;

    try {
      await this.ensureMongoConnection();
      return {
        content: [
          {
            type: 'text',
            text: `Successfully connected to MongoDB database ${config.database}`
          }
        ]
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to connect to MongoDB: ${getErrorMessage(error)}`
      );
    }
  }

  private async loadMongoWorkspaceConfig(workspace: string): Promise<MongoDBConfig | null> {
    try {
      // 尝试从工作区加载.env
      const envPath = path.join(workspace, '.env');
      const workspaceEnv = require('dotenv').config({ path: envPath });

      if (workspaceEnv.error) {
        return null;
      }

      const { MONGODB_URI, MONGODB_DATABASE } = workspaceEnv.parsed;

      if (MONGODB_URI && MONGODB_DATABASE) {
        return {
          uri: MONGODB_URI,
          database: MONGODB_DATABASE
        };
      }

      return null;
    } catch (error) {
      console.error('Error loading MongoDB workspace config:', error);
      return null;
    }
  }

  private async handleMongoDBListCollections() {
    await this.ensureMongoConnection();

    try {
      const collections = await this.mongoDB!.listCollections().toArray();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(collections, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to list collections: ${getErrorMessage(error)}`
      );
    }
  }

  private async handleMongoDBFind(args: any) {
    await this.ensureMongoConnection();

    if (!args.collection) {
      throw new McpError(ErrorCode.InvalidParams, 'Collection name is required');
    }

    try {
      const collection = this.mongoDB!.collection(args.collection);
      const filter = args.filter || {};
      const options: any = {};
      
      if (args.limit) options.limit = args.limit;
      if (args.skip) options.skip = args.skip;
      if (args.sort) options.sort = args.sort;

      const documents = await collection.find(filter, options).toArray();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(documents, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to find documents: ${getErrorMessage(error)}`
      );
    }
  }

  private async handleMongoDBInsert(args: any) {
    await this.ensureMongoConnection();

    if (!args.collection || !args.documents) {
      throw new McpError(ErrorCode.InvalidParams, 'Collection name and documents are required');
    }

    try {
      const collection = this.mongoDB!.collection(args.collection);
      const result = await collection.insertMany(args.documents);
      return {
        content: [
          {
            type: 'text',
            text: `Successfully inserted ${result.insertedCount} documents`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to insert documents: ${getErrorMessage(error)}`
      );
    }
  }

  private async handleMongoDBUpdate(args: any) {
    await this.ensureMongoConnection();

    if (!args.collection || !args.filter || !args.update) {
      throw new McpError(ErrorCode.InvalidParams, 'Collection name, filter, and update are required');
    }

    try {
      const collection = this.mongoDB!.collection(args.collection);
      let result;
      
      if (args.many) {
        result = await collection.updateMany(args.filter, args.update);
      } else {
        result = await collection.updateOne(args.filter, args.update);
      }
      
      return {
        content: [
          {
            type: 'text',
            text: `Successfully updated ${result.modifiedCount} documents`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to update documents: ${getErrorMessage(error)}`
      );
    }
  }

  private async handleMongoDBDelete(args: any) {
    await this.ensureMongoConnection();

    if (!args.collection || !args.filter) {
      throw new McpError(ErrorCode.InvalidParams, 'Collection name and filter are required');
    }

    try {
      const collection = this.mongoDB!.collection(args.collection);
      let result;
      
      if (args.many) {
        result = await collection.deleteMany(args.filter);
      } else {
        result = await collection.deleteOne(args.filter);
      }
      
      return {
        content: [
          {
            type: 'text',
            text: `Successfully deleted ${result.deletedCount} documents`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to delete documents: ${getErrorMessage(error)}`
      );
    }
  }

  private async handleMongoDBCreateCollection(args: any) {
    await this.ensureMongoConnection();

    if (!args.collection) {
      throw new McpError(ErrorCode.InvalidParams, 'Collection name is required');
    }

    try {
      await this.mongoDB!.createCollection(args.collection, args.options || {});
      return {
        content: [
          {
            type: 'text',
            text: `Collection ${args.collection} created successfully`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to create collection: ${getErrorMessage(error)}`
      );
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MySQL MCP server running on stdio');
  }
}

const server = new MySQLServer();
server.run().catch(console.error);
