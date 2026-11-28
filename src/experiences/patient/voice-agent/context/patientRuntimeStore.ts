import { PatientRuntimeSnapshot } from '../types/agentTypes';

type Listener = () => void;

const INITIAL_SNAPSHOT: PatientRuntimeSnapshot = {
  currentRoute: 'patient-home',
  selectedImageName: null,
  hasSelectedImage: false,
  cameraStatus: 'idle',
  uploadStatus: 'idle',
  ocrStatus: 'idle',
  reviewRequired: false,
  uncertainCount: 0,
  ocrResultCount: 0,
  analysisStatus: 'idle',
  activeReportId: null,
  currentResultTab: null,
  reportSummary: null,
  labHighlights: [],
  mealTitles: [],
  exerciseTitles: [],
  recommendationCounts: {
    results: 0,
    meals: 0,
    exercises: 0,
  },
  selectedItem: null,
  recentReportsCount: 0,
  lastPickerCancelledAt: null,
  errorStatus: null,
};

function cloneInitialSnapshot(): PatientRuntimeSnapshot {
  return {
    ...INITIAL_SNAPSHOT,
    labHighlights: [],
    mealTitles: [],
    exerciseTitles: [],
    recommendationCounts: { ...INITIAL_SNAPSHOT.recommendationCounts },
  };
}

let snapshot: PatientRuntimeSnapshot = cloneInitialSnapshot();
const listeners = new Set<Listener>();

export function getPatientRuntimeSnapshot(): PatientRuntimeSnapshot {
  return snapshot;
}

export function updatePatientRuntimeSnapshot(partial: Partial<PatientRuntimeSnapshot>) {
  snapshot = {
    ...snapshot,
    ...partial,
    recommendationCounts: partial.recommendationCounts
      ? { ...snapshot.recommendationCounts, ...partial.recommendationCounts }
      : snapshot.recommendationCounts,
  };
  listeners.forEach((l) => l());
}

export function resetPatientRuntimeSnapshot() {
  snapshot = cloneInitialSnapshot();
  listeners.forEach((l) => l());
}

export function subscribePatientRuntimeSnapshot(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
