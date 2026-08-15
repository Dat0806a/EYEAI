import type { LabStatus } from '../types';

export function statusColor(status: LabStatus): string {
  switch (status) {
    case 'LOW':
      return 'bg-orange-100 text-orange-700 border-orange-200';
    case 'HIGH':
      return 'bg-red-100 text-red-700 border-red-200';
    case 'NORMAL':
      return 'bg-green-100 text-green-700 border-green-200';
    default:
      return 'bg-gray-100 text-gray-600 border-gray-200';
  }
}

export function statusLabel(status: LabStatus): string {
  switch (status) {
    case 'LOW':
      return 'Thấp';
    case 'HIGH':
      return 'Cao';
    case 'NORMAL':
      return 'Bình thường';
    default:
      return 'Không xác định';
  }
}

export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}
