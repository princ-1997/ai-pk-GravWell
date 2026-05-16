import { App } from './ui/app';
import { SimulatorTab } from './ui/tabs/simulator-tab';
import { LlmMaterialsTab } from './ui/tabs/llm-materials-tab';
import { DatabaseTab } from './ui/tabs/database-tab';
import { FullRunsTab } from './ui/tabs/full-runs-tab';
import { LeaderboardTab } from './ui/tabs/leaderboard-tab';

const app = new App(document.getElementById('app')!);
const state = app.getState();

app.registerTab('simulator', 'SIMULATOR', new SimulatorTab(state));
app.registerTab('llm-materials', 'LLM MATERIALS', new LlmMaterialsTab(state));
app.registerTab('database', 'DATABASE', new DatabaseTab(state));
app.registerTab('full-runs', 'FULL RUNS', new FullRunsTab(state));
app.registerTab('leaderboard', 'LEADERBOARD', new LeaderboardTab(state));
app.registerPlaceholder('pvp', 'PVP', 'PVP tab — coming in Phase 7');
