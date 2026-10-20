export type AppMode = 'send' | 'receive' | 'vault' | 'showreel';

export interface VaultItem {
  id: string;
  type: 'image' | 'audio' | 'text';
  data: string; // Data URL or text string
  timestamp: number;
  title: string;
  sizeBytes: number;
}
