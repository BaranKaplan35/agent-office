import type { PublicTeam } from '@agent-office/shared';
import { RotateCcw } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/context';
import { useApp, useCurrentTeam } from '../state/store';
import { useReducedMotion } from './motion';
import { OfficeErrorBoundary } from './OfficeErrorBoundary';
import type { CameraHandle } from './scene/CameraRig';
import type { SceneActivity } from './scene/DeskTag';
import type { OfficeSceneProps } from './scene/OfficeScene';
import { TaskHeader } from './TaskHeader';
import { TeamBoard } from './TeamBoard';
import { isWebGLAvailable } from './webgl';

// The 3D engine is large: load it on demand so the panels render immediately.
const OfficeScene = lazy(() => import('./scene/OfficeScene'));

const TILE_W = 64;
const TILE_H = 32;
const GRID = 7;

/** Decorative floor shown before a team is chosen. */
function EmptyFloor() {
  const tiles = [];
  for (let x = 0; x < GRID; x++) {
    for (let y = 0; y < GRID; y++) {
      const cx = (x - y) * (TILE_W / 2);
      const cy = (x + y) * (TILE_H / 2);
      tiles.push(
        <path
          key={`${x}-${y}`}
          d={`M${cx} ${cy} l${TILE_W / 2} ${TILE_H / 2} l${-TILE_W / 2} ${TILE_H / 2} l${-TILE_W / 2} ${-TILE_H / 2}Z`}
          fill={(x + y) % 2 === 0 ? 'var(--floor-a)' : 'var(--floor-b)'}
        />,
      );
    }
  }
  const half = (GRID * TILE_W) / 2;
  return (
    <svg
      className="office-floor"
      viewBox={`${-half} 0 ${GRID * TILE_W} ${GRID * TILE_H}`}
      aria-hidden="true"
    >
      {tiles}
    </svg>
  );
}

/** The flat board, with a short notice about why it is shown. */
function FlatOffice({ team, notice }: { team: PublicTeam; notice: string }) {
  return (
    <section className="office card has-team">
      <p className="office-notice">{notice}</p>
      <TeamBoard team={team} />
    </section>
  );
}

/** Esc shouldn't steal a keystroke meant for a text field or an open menu. */
function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

function Office3D({ team }: { team: PublicTeam }) {
  const { t, lang } = useI18n();
  const task = useApp((s) => s.task);
  const selection = useApp((s) => s.selection);
  const select = useApp((s) => s.select);
  const reduced = useReducedMotion();
  const camera = useRef<CameraHandle>(null);
  const [viewMoved, setViewMoved] = useState(false);

  // Esc returns the camera to the overview.
  useEffect(() => {
    if (!viewMoved) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || isTyping(e.target)) return;
      camera.current?.reset();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewMoved]);

  const texts = useMemo<OfficeSceneProps['texts']>(
    () => ({
      canvas: t('office.canvasLabel'),
      status: (activity: SceneActivity) => t(`activity.${activity}`),
      open: (name: string) => t('office.openReport', { name }),
    }),
    [t],
  );

  return (
    <section className="office card is-3d" aria-label={t('office.title')}>
      <Suspense fallback={<div className="office-loading">{t('office.loading')}</div>}>
        <OfficeScene
          team={team}
          task={task}
          lang={lang}
          selection={selection}
          onSelect={select}
          reduced={reduced}
          cameraRef={camera}
          onViewMoved={setViewMoved}
          texts={texts}
        />
      </Suspense>

      <div className="office-overlay">
        {task ? <TaskHeader /> : <p className="office-hint">{t('office.idleHint')}</p>}
        {viewMoved && (
          <div>
            <button
              type="button"
              className="office-view-reset"
              onClick={() => camera.current?.reset()}
            >
              <RotateCcw size={14} aria-hidden="true" />
              {t('office.resetView')}
              <kbd aria-hidden="true">Esc</kbd>
            </button>
          </div>
        )}
      </div>
      {task?.planSummary && (
        <p className="plan-bubble office-plan">
          <strong>
            {t('office.planTitle', {
              name: team.agents.find((a) => a.type === 'coordinator')?.name[lang] ?? '',
            })}
          </strong>{' '}
          {task.planSummary}
        </p>
      )}
    </section>
  );
}

export function OfficeStage() {
  const { t } = useI18n();
  const team = useCurrentTeam();
  const teamsState = useApp((s) => s.teamsState);
  const webgl = useMemo(isWebGLAvailable, []);
  const noTeams = teamsState === 'ready' && !team;

  if (!team) {
    return (
      <section className="office card" aria-label={t('office.title')}>
        <EmptyFloor />
        <div className="empty-state office-empty">
          <h2>{noTeams ? t('office.noTeamsTitle') : t('office.emptyTitle')}</h2>
          <p>{noTeams ? t('office.noTeamsBody') : t('office.emptyBody')}</p>
        </div>
      </section>
    );
  }

  if (!webgl) return <FlatOffice team={team} notice={t('office.noWebgl')} />;

  return (
    <OfficeErrorBoundary fallback={<FlatOffice team={team} notice={t('office.sceneError')} />}>
      <Office3D team={team} />
    </OfficeErrorBoundary>
  );
}
