import { App } from './ui/app';
import { SimulatorTab } from './ui/tabs/simulator-tab';

const app = new App(document.getElementById('app')!);
const state = app.getState();

app.registerTab('simulator', 'SIMULATOR', new SimulatorTab(state));
app.registerPlaceholder('llm-materials', 'LLM MATERIALS', 'LLM Materials tab — coming soon');
app.registerPlaceholder('database', 'DATABASE', 'Database tab — coming in Phase 5');
app.registerPlaceholder('full-runs', 'FULL RUNS', 'Full Runs tab — coming soon');
app.registerPlaceholder('leaderboard', 'LEADERBOARD', 'Leaderboard tab — coming in Phase 6');
app.registerPlaceholder('pvp', 'PVP', 'PVP tab — coming in Phase 7');
