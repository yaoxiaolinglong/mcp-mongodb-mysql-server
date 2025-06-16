[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/yaoxiaolinglong-mcp-mongodb-mysql-server-badge.png)](https://mseep.ai/app/yaoxiaolinglong-mcp-mongodb-mysql-server)

# MCP-MongoDB-MySQL-Server

[![GitHub stars](https://img.shields.io/github/stars/yaoxiaolinglong/mcp-mongodb-mysql-server?style=social)](https://github.com/yaoxiaolinglong/mcp-mongodb-mysql-server/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/yaoxiaolinglong/mcp-mongodb-mysql-server?style=social)](https://github.com/yaoxiaolinglong/mcp-mongodb-mysql-server/network/members)
[![GitHub license](https://img.shields.io/github/license/yaoxiaolinglong/mcp-mongodb-mysql-server)](https://github.com/yaoxiaolinglong/mcp-mongodb-mysql-server/blob/main/LICENSE)
[![Smithery](https://smithery.ai/badge/@yaoxiaolinglong/mcp-mongodb-mysql-server)](https://smithery.ai/server/@yaoxiaolinglong/mcp-mongodb-mysql-server)

> 这是一个基于 [enemyrr/mcp-mysql-server](https://github.com/enemyrr/mcp-mysql-server) 项目的二次开发版本，添加了MongoDB支持。
> 
> This is a fork of [enemyrr/mcp-mysql-server](https://github.com/enemyrr/mcp-mysql-server) with added MongoDB support.

## 项目简介 | Introduction

这是一个Model Context Protocol服务器，提供MySQL和MongoDB数据库操作功能。该服务器使AI模型能够通过标准化接口与MySQL和MongoDB数据库交互。

A Model Context Protocol server that provides MySQL and MongoDB database operations. This server enables AI models to interact with MySQL and MongoDB databases through a standardized interface.

## 二次开发说明 | About This Fork

**作者 | Author**: yaoxiaolinglong

**二次开发原因 | Reason for Fork**: 原项目只支持MySQL数据库，但在实际应用中经常需要使用MongoDB。由于找不到现成的MongoDB MCP工具，因此在原项目基础上添加了MongoDB支持，使其成为一个同时支持MySQL和MongoDB的数据库服务器。

The original project only supports MySQL database, but MongoDB is often needed in practical applications. Due to the lack of ready-made MongoDB MCP tools, MongoDB support was added to the original project, making it a database server that supports both MySQL and MongoDB.

## 安装与设置 | Installation & Setup for Cursor IDE

### 通过Smithery安装 | Installing via Smithery

通过[Smithery](https://smithery.ai/server/@yaoxiaolinglong/mcp-mongodb-mysql-server)为Claude Desktop自动安装MySQL/MongoDB数据库服务器：

To install MySQL/MongoDB Database Server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@yaoxiaolinglong/mcp-mongodb-mysql-server):

```bash
npx -y @smithery/cli install @yaoxiaolinglong/mcp-mongodb-mysql-server --client claude
```

### 手动安装 | Installing Manually

1. 克隆并构建项目 | Clone and build the project:
```bash
git clone https://github.com/yaoxiaolinglong/mcp-mongodb-mysql-server.git
cd mcp-mongodb-mysql-server
npm install
npm run build
```

2. 在Cursor IDE设置中添加服务器 | Add the server in Cursor IDE settings:
   - 打开命令面板(Cmd/Ctrl + Shift + P) | Open Command Palette (Cmd/Ctrl + Shift + P)
   - 搜索"MCP: Add Server" | Search for "MCP: Add Server"
   - 填写以下字段 | Fill in the fields:
     - 名称 | Name: `mysql-mongodb`
     - 类型 | Type: `command`
     - 命令 | Command: `node /absolute/path/to/mcp-mongodb-mysql-server/build/index.js`

> **注意 | Note**: 将`/absolute/path/to/`替换为您克隆并构建项目的实际路径。
> 
> Replace `/absolute/path/to/` with the actual path where you cloned and built the project.

## 数据库配置 | Database Configuration

### MySQL配置 | MySQL Configuration

您可以通过以下三种方式配置MySQL数据库连接：

You can configure the MySQL database connection in three ways:

1. **.env文件中的数据库URL（推荐）| Database URL in .env (Recommended)**:
```env
DATABASE_URL=mysql://user:password@host:3306/database
```

2. **.env文件中的单独参数 | Individual Parameters in .env**:
```env
DB_HOST=localhost
DB_USER=your_user
DB_PASSWORD=your_password
DB_DATABASE=your_database
```

3. **通过工具直接连接 | Direct Connection via Tool**:
```typescript
use_mcp_tool({
  server_name: "mysql-mongodb",
  tool_name: "connect_db",
  arguments: {
    url: "mysql://user:password@host:3306/database"
    // 或者 | OR
    workspace: "/path/to/your/project" // 将使用项目的.env文件 | Will use project's .env
    // 或者 | OR
    host: "localhost",
    user: "your_user",
    password: "your_password",
    database: "your_database"
  }
});
```

### MongoDB配置 | MongoDB Configuration

您可以通过以下三种方式配置MongoDB数据库连接：

You can configure the MongoDB database connection in three ways:

1. **.env文件中的MongoDB URL（推荐）| MongoDB URL in .env (Recommended)**:
```env
MONGODB_URI=mongodb://user:password@host:27017/database
MONGODB_DATABASE=your_database
```

2. **通过工具直接连接 | Direct Connection via Tool**:
```typescript
use_mcp_tool({
  server_name: "mysql-mongodb",
  tool_name: "connect_mongodb",
  arguments: {
    url: "mongodb://user:password@host:27017/database"
    // 或者 | OR
    workspace: "/path/to/your/project" // 将使用项目的.env文件 | Will use project's .env
    // 或者 | OR
    database: "your_database" // 将使用默认连接URI | Will use default connection URI
  }
});
```

## 可用工具 | Available Tools

### MySQL工具 | MySQL Tools

#### 1. connect_db
连接到MySQL数据库，使用URL、工作区路径或直接凭据。

Connect to MySQL database using URL, workspace path, or direct credentials.

#### 2. query
执行SELECT查询，支持可选的预处理语句参数。

Execute SELECT queries with optional prepared statement parameters.

```typescript
use_mcp_tool({
  server_name: "mysql-mongodb",
  tool_name: "query",
  arguments: {
    sql: "SELECT * FROM users WHERE id = ?",
    params: [1]
  }
});
```

#### 3. execute
执行INSERT、UPDATE或DELETE查询，支持可选的预处理语句参数。

Execute INSERT, UPDATE, or DELETE queries with optional prepared statement parameters.

```typescript
use_mcp_tool({
  server_name: "mysql-mongodb",
  tool_name: "execute",
  arguments: {
    sql: "INSERT INTO users (name, email) VALUES (?, ?)",
    params: ["John Doe", "john@example.com"]
  }
});
```

#### 4. list_tables
列出连接的数据库中的所有表。

List all tables in the connected database.

```typescript
use_mcp_tool({
  server_name: "mysql-mongodb",
  tool_name: "list_tables"
});
```

#### 5. describe_table
获取特定表的结构。

Get the structure of a specific table.

```typescript
use_mcp_tool({
  server_name: "mysql-mongodb",
  tool_name: "describe_table",
  arguments: {
    table: "users"
  }
});
```

#### 6. create_table
创建一个新表，指定字段和索引。

Create a new table with specified fields and indexes.

```typescript
use_mcp_tool({
  server_name: "mysql-mongodb",
  tool_name: "create_table",
  arguments: {
    table: "users",
    fields: [
      {
        name: "id",
        type: "int",
        autoIncrement: true,
        primary: true
      },
      {
        name: "email",
        type: "varchar",
        length: 255,
        nullable: false
      }
    ],
    indexes: [
      {
        name: "email_idx",
        columns: ["email"],
        unique: true
      }
    ]
  }
});
```

#### 7. add_column
向现有表添加新列。

Add a new column to an existing table.

```typescript
use_mcp_tool({
  server_name: "mysql-mongodb",
  tool_name: "add_column",
  arguments: {
    table: "users",
    field: {
      name: "phone",
      type: "varchar",
      length: 20,
      nullable: true
    }
  }
});
```

### MongoDB工具 | MongoDB Tools

#### 1. connect_mongodb
连接到MongoDB数据库，使用URL、工作区路径或数据库名称。

Connect to MongoDB database using URL, workspace path, or database name.

```typescript
use_mcp_tool({
  server_name: "mysql-mongodb",
  tool_name: "connect_mongodb",
  arguments: {
    url: "mongodb://user:password@host:27017/database"
  }
});
```

#### 2. mongodb_list_collections
列出连接的MongoDB数据库中的所有集合。

List all collections in the connected MongoDB database.

```typescript
use_mcp_tool({
  server_name: "mysql-mongodb",
  tool_name: "mongodb_list_collections"
});
```

#### 3. mongodb_find
在MongoDB集合中查找文档，支持可选的过滤器、限制、跳过和排序。

Find documents in a MongoDB collection with optional filter, limit, skip, and sort.

```typescript
use_mcp_tool({
  server_name: "mysql-mongodb",
  tool_name: "mongodb_find",
  arguments: {
    collection: "users",
    filter: { age: { $gt: 18 } },
    limit: 10,
    skip: 0,
    sort: { name: 1 }
  }
});
```

#### 4. mongodb_insert
向MongoDB集合中插入文档。

Insert documents into a MongoDB collection.

```typescript
use_mcp_tool({
  server_name: "mysql-mongodb",
  tool_name: "mongodb_insert",
  arguments: {
    collection: "users",
    documents: [
      { name: "John Doe", email: "john@example.com", age: 30 },
      { name: "Jane Smith", email: "jane@example.com", age: 25 }
    ]
  }
});
```

#### 5. mongodb_update
更新MongoDB集合中的文档。

Update documents in a MongoDB collection.

```typescript
use_mcp_tool({
  server_name: "mysql-mongodb",
  tool_name: "mongodb_update",
  arguments: {
    collection: "users",
    filter: { name: "John Doe" },
    update: { $set: { age: 31 } },
    many: false // 只更新一个文档（默认）| Update only one document (default)
  }
});
```

#### 6. mongodb_delete
从MongoDB集合中删除文档。

Delete documents from a MongoDB collection.

```typescript
use_mcp_tool({
  server_name: "mysql-mongodb",
  tool_name: "mongodb_delete",
  arguments: {
    collection: "users",
    filter: { name: "John Doe" },
    many: false // 只删除一个文档（默认）| Delete only one document (default)
  }
});
```

#### 7. mongodb_create_collection
在MongoDB中创建新集合。

Create a new collection in MongoDB.

```typescript
use_mcp_tool({
  server_name: "mysql-mongodb",
  tool_name: "mongodb_create_collection",
  arguments: {
    collection: "new_collection",
    options: { capped: true, size: 1000000 }
  }
});
```

## 功能特点 | Features

- 多种连接方法（URL、工作区、直接参数）| Multiple connection methods (URL, workspace, direct)
- 同时支持MySQL和MongoDB数据库 | Support for both MySQL and MongoDB databases
- 安全的连接处理和自动清理 | Secure connection handling with automatic cleanup
- MySQL查询参数的预处理语句支持 | Prepared statement support for MySQL query parameters
- 两种数据库的架构管理工具 | Schema management tools for both databases
- 全面的错误处理和验证 | Comprehensive error handling and validation
- TypeScript支持 | TypeScript support
- 自动工作区检测 | Automatic workspace detection

## 安全性 | Security

- 在MySQL中使用预处理语句防止SQL注入 | Uses prepared statements to prevent SQL injection in MySQL
- 通过环境变量支持安全密码处理 | Supports secure password handling through environment variables
- 执行前验证查询和操作 | Validates queries and operations before execution
- 自动关闭连接 | Automatically closes connections when done

## 错误处理 | Error Handling

服务器提供以下详细错误消息：| The server provides detailed error messages for:
- 连接失败 | Connection failures
- 无效的查询或参数 | Invalid queries or parameters
- 缺少配置 | Missing configuration
- 数据库错误 | Database errors
- 架构验证错误 | Schema validation errors

## 贡献 | Contributing

欢迎贡献！请随时提交Pull Request到 https://github.com/yaoxiaolinglong/mcp-mongodb-mysql-server

Contributions are welcome! Please feel free to submit a Pull Request to https://github.com/yaoxiaolinglong/mcp-mongodb-mysql-server

## 致谢 | Acknowledgements

本项目基于 [enemyrr/mcp-mysql-server](https://github.com/enemyrr/mcp-mysql-server) 开发，感谢原作者的贡献。

This project is based on [enemyrr/mcp-mysql-server](https://github.com/enemyrr/mcp-mysql-server). Thanks to the original author for their contribution.

## 许可证 | License

MIT
