import { Header } from './components/Header';
import { OfficeStage } from './office/OfficeStage';
import { SidePanel } from './panels/SidePanel';
import { TaskInput } from './panels/TaskInput';

export function App() {
  return (
    <div className="app">
      <Header />
      <main className="workspace">
        <OfficeStage />
        <SidePanel />
      </main>
      <TaskInput />
    </div>
  );
}
