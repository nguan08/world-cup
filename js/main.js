/**
 * Application entry point (ES modules)
 */
import {
  handleSimulationScoreChange,
  openPlayerDetails
} from './bundle.js?v=20260704-players-pill';

window.handleSimulationScoreChange = handleSimulationScoreChange;
window.openPlayerDetails = openPlayerDetails;