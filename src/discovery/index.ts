export { detectDiscoveryCandidates } from "./engine";
export { finalizeSelectedCandidates, finalizeSelection, DiscoverySelection } from "./selection";
export {
  DiscoveryStrategyError,
  loadDiscoveryStrategies,
  parseDiscoveryStrategiesToml,
} from "./strategy-loader";
export type {
  DetectResult,
  DetectedCandidate,
  DiscoveryStrategy,
  FinalizeSelectionResult,
  LoadedStrategies,
  SelectionItem,
  StrategyCapture,
  StrategyWhen,
} from "./types";
