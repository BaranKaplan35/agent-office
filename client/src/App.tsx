import { useEffect } from 'react';
import { useTaskStream } from './api/useTaskStream';
import { ErrorToast } from './components/ErrorToast';
import { Header } from './components/Header';
import { OfficeStage } from './office/OfficeStage';
import { SidePanel } from './panels/SidePanel';
import { TaskInput } from './panels/TaskInput';
import { useApp } from './state/store';

export function App() {
  const loadTeams = useApp((s) => s.loadTeams);
  useEffect(() => {
    void loadTeams();
  }, [loadTeams]);
  useTaskStream();

  return (
    <div className="app">
      <Header />
      <main className="workspace">
        <OfficeStage />
        <SidePanel />
      </main>
      <TaskInput />
      <ErrorToast />
    </div>
  );
}
