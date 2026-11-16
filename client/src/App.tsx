import { useEffect } from 'react';
import { useTaskStream } from './api/useTaskStream';
import { ErrorToast } from './components/ErrorToast';
import { Header } from './components/Header';
import { CAPTURE, installCaptureApi } from './office/capture';
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
  useEffect(() => {
    if (!CAPTURE) return;
    installCaptureApi((task) =>
      useApp.setState((s) => ({
        task,
        taskId: task?.id ?? null,
        teamId: task?.teamId ?? s.teamId,
      })),
    );
  }, []);

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
