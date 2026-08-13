export type GridItemType = 'phrase' | 'letter' | 'action';

export interface GridItem {
  id: string;
  type: GridItemType;
  label: string;
  value: string;
  colorClass?: string;
}

export interface VirtualKeyboardProps {
  isOpen: boolean;
  onClose?: () => void;
  onKeyPress: (item: GridItem) => void;
  onSend?: () => void;
  activeRow?: number;
  activeCol?: number;
}
