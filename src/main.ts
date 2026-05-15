import { App } from './ui/app';
import { SimulatorTab } from './ui/tabs/simulator-tab';
import { LlmMaterialsTab } from './ui/tabs/llm-materials-tab';
import { FullRunsTab } from './ui/tabs/full-runs-tab';

const app = new App(document.getElementById('app')!);
const state = app.getState();

app.registerTab('simulator', 'SIMULATOR', new SimulatorTab(state));
app.registerTab('llm-materials', 'LLM MATERIALS', new LlmMaterialsTab(state));
app.registerPlaceholder('database', 'DATABASE', 'Database tab — coming in Phase 5');
app.registerTab('full-runs', 'FULL RUNS', new FullRunsTab(state));
app.registerPlaceholder('leaderboard', 'LEADERBOARD', 'Leaderboard tab — coming in Phase 6');
app.registerPlaceholder('pvp', 'PVP', 'PVP tab — coming in Phase 7');
