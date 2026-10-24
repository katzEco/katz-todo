export type WhitelistType = 'discord' | 'telegram' | 'ip' | 'key';

export interface WhitelistEntry {
  id: number;
  type: WhitelistType;
  value: string;
  label: string;
  enabled: boolean;
  created_at: string;
}

export interface CreateWhitelistDto {
  type: WhitelistType;
  value: string;
  label?: string;
}

export interface UpdateWhitelistDto {
  enabled?: boolean;
  label?: string;
}
