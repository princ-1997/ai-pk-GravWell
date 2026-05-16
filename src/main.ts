import { App } from './ui/app';
import { SimulatorTab } from './ui/tabs/simulator-tab';
import { LlmMaterialsTab } from './ui/tabs/llm-materials-tab';
import { LeaderboardTab } from './ui/tabs/leaderboard-tab';
import { DatabaseTab } from './ui/tabs/database-tab';

const app = new App(document.getElementById('app')!);
const state = app.getState();

app.registerTab('simulator', 'SIMULATOR', new SimulatorTab(state));
app.registerTab('llm-materials', 'LLM MATERIALS', new LlmMaterialsTab(state));
app.registerTab('leaderboard', 'LEADERBOARD', new LeaderboardTab(state));
app.registerTab('database', 'HISTORY', new DatabaseTab(state));
