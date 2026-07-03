/**
 * Application entry point (ES modules)
 */
import {
  handleSimulationScoreChange,
  openPlayerDetails
} from './bundle.js?v=20260704-soccer-ball2';

window.handleSimulationScoreChange = handleSimulationScoreChange;
window.openPlayerDetails = openPlayerDetails;