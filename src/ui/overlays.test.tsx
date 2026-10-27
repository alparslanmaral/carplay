import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupI18n } from '../core/i18n';
import { confirmDialog } from '../core/dialogs';
import { usePwaStore } from '../core/pwa';
import { useDriving, resetDrivingForTests } from '../core/driving';
import { useSettings } from '../core/settings';
import { DialogHost, PassengerPrompt, UpdateBanner } from './components/Overlays';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

async function render(node: React.ReactNode) {
  await act(async () => root.render(node));
}

beforeEach(() => {
  setupI18n();
  useSettings.getState().reset();
  resetDrivingForTests();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  usePwaStore.setState({ updateReady: false, applyUpdate: null });
});

describe('update prompt', () => {
  it('is hidden until the service worker reports a new version, then reloads on request', async () => {
    const apply = vi.fn(async () => undefined);
    usePwaStore.setState({ applyUpdate: apply });
    await render(<UpdateBanner />);
    expect(host.textContent).toBe('');
    await act(async () => usePwaStore.setState({ updateReady: true }));
    expect(host.textContent).toContain('A new version of DriveDeck is ready');
    const reload = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Reload')!;
    await act(async () => reload.click());
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('can be dismissed', async () => {
    usePwaStore.setState({ updateReady: true });
    await render(<UpdateBanner />);
    const close = host.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!;
    await act(async () => close.click());
    expect(host.textContent).toBe('');
  });
});

describe('passenger prompt', () => {
  it('asks for confirmation, and only a confirmed passenger unlocks', async () => {
    await render(<PassengerPrompt />);
    expect(host.textContent).toBe('');
    await act(async () => useDriving.getState().openPrompt());
    expect(host.textContent).toContain('Parked? Passenger mode');
    const stay = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Stay locked')!;
    await act(async () => stay.click());
    expect(useDriving.getState().passenger).toBe(false);
    await act(async () => useDriving.getState().openPrompt());
    const confirm = [...host.querySelectorAll('button')].find((b) => b.textContent === "I'm a passenger")!;
    await act(async () => confirm.click());
    expect(useDriving.getState().passenger).toBe(true);
    expect(host.textContent).toBe('');
  });

  it('offers no override at all when the passenger override setting is off', async () => {
    useSettings.getState().set('passengerOverride', false);
    await render(<PassengerPrompt />);
    await act(async () => useDriving.getState().openPrompt());
    expect(host.textContent).not.toContain("I'm a passenger");
    expect(host.textContent).toContain('Park the car');
  });
});

describe('confirm dialog', () => {
  it('resolves true on confirm and false on cancel', async () => {
    await render(<DialogHost />);
    let result: Promise<boolean> = Promise.resolve(false);
    await act(async () => {
      result = confirmDialog({ title: 'Delete it?', confirmLabel: 'Delete' });
    });
    expect(host.textContent).toContain('Delete it?');
    await act(async () =>
      [...host.querySelectorAll('button')].find((b) => b.textContent === 'Delete')!.click(),
    );
    expect(await result).toBe(true);
    await act(async () => {
      result = confirmDialog({ title: 'Again?' });
    });
    await act(async () =>
      [...host.querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!.click(),
    );
    expect(await result).toBe(false);
  });
});
