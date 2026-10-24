export interface TodoItem {
  id: number;
  title: string;
  category: string;
  completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateTodoDto {
  title: string;
  category?: string;
}

export interface UpdateTodoDto {
  completed?: boolean;
  category?: string;
  title?: string;
}

export interface TodoStats {
  total: number;
  completed: number;
  pending: number;
  completionRate: number;
  categoryCounts: Record<string, number>;
}
