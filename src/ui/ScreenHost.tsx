import { useEffect, useState, type ReactNode } from 'react';
import { useRouter, type Entry, type NavAction } from '../core/router';

interface Layer {
  entry: Entry;
  state: 'enter' | 'idle' | 'exit';
  dir: NavAction;
}

function transitionMs(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--dur');
  const ms = parseInt(raw, 10);
  const none = document.documentElement.dataset.transition === 'none';
  return none || !Number.isFinite(ms) ? 0 : ms;
}

/**
 * Renders the top router entry and keeps the previous one mounted for the length of the
 * transition so push/pop animations can cross-fade. Direction comes from the router action.
 */
export function ScreenHost({ render }: { render: (entry: Entry) => ReactNode }) {
  const top = useRouter((s) => s.stack[s.stack.length - 1]!);
  const action = useRouter((s) => s.action);
  const [layers, setLayers] = useState<Layer[]>(() => [{ entry: top, state: 'idle', dir: 'init' }]);

  useEffect(() => {
    const ms = transitionMs();
    setLayers((prev) => {
      if (prev.some((l) => l.state !== 'exit' && l.entry.key === top.key)) return prev;
      const leaving = prev.map((l): Layer => ({ ...l, state: 'exit', dir: action }));
      if (ms === 0) return [{ entry: top, state: 'idle', dir: action }];
      return [...leaving, { entry: top, state: 'enter', dir: action }];
    });
    if (ms === 0) return;
    const id = setTimeout(
      () =>
        setLayers((prev) =>
          prev.filter((l) => l.state !== 'exit').map((l): Layer => ({ ...l, state: 'idle' })),
        ),
      ms + 40,
    );
    return () => clearTimeout(id);
  }, [top, action]);

  return (
    <div className="layers">
      {layers.map((l) => (
        <div
          key={l.entry.key}
          className="layer"
          data-state={l.state}
          data-dir={l.dir}
          inert={l.state === 'exit'}
        >
          {render(l.entry)}
        </div>
      ))}
    </div>
  );
}
