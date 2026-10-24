// ponytail: native Bun.SQL and Bun.RedisClient - zero db-driver overhead
const PG_URL = process.env.DATABASE_URL || "postgres://dethz:dethz198@localhost:5431/app";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6380";

export const sql = new Bun.SQL(PG_URL);
export const redis = new Bun.RedisClient(REDIS_URL);

// Re-export todo & category service for backward compatibility
export {
  type TodoItem,
  initDb,
  listTodos,
  addTodo,
  updateTodoStatus,
  deleteTodo,
  getTodoStats,
} from './modules/todo';

export {
  type Category,
  listCategories,
  addCategory,
  deleteCategory,
} from './modules/category';

export {
  type WhitelistEntry,
  initWhitelistDb,
  listWhitelist,
  addWhitelist,
  deleteWhitelist,
  isWhitelisted,
  isUserWhitelisted,
} from './modules/whitelist';
