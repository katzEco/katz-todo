export interface Category {
  id: number;
  name: string;
  created_at: string;
}

export interface CreateCategoryDto {
  name: string;
}

export interface CategoryWithCount extends Category {
  todo_count: number;
}
