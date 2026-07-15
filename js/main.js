/**
 * Application entry point (ES modules)
 */
import {
  handleSimulationScoreChange,
  openPlayerDetails
} from './bundle.js?v=20260715-rarecard-themes';

window.handleSimulationScoreChange = handleSimulationScoreChange;
window.openPlayerDetails = openPlayerDetails;