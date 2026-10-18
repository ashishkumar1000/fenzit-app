/**
 * Tests for useUnsavedChangesGuard (UX finding 16): leaving with unsaved
 * edits is held and asked about; Discard replays the held action; Save and
 * Archive pass through via allowLeave(); a clean form is never intercepted.
 */
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard';

type Listener = (e: { preventDefault: jest.Mock; data: { action: unknown } }) => void;

function makeNavigation() {
  let listener: Listener | null = null;
  const unsubscribe = jest.fn();
  const navigation = {
    addListener: jest.fn((_event: string, cb: Listener) => {
      listener = cb;
      return unsubscribe;
    }),
    dispatch: jest.fn(),
  };
  const leave = (action: unknown = { type: 'GO_BACK' }) => {
    const e = { preventDefault: jest.fn(), data: { action } };
    listener?.(e);
    return e;
  };
  return { navigation, leave, unsubscribe };
}

type Guard = ReturnType<typeof useUnsavedChangesGuard>;

/** Minimal renderHook on react-test-renderer (the project has no RNTL). */
function renderHook(render: (props: { dirty: boolean }) => Guard, initialProps = { dirty: false }) {
  const result = { current: undefined as unknown as Guard };
  function Probe(props: { dirty: boolean }) {
    result.current = render(props);
    return null;
  }
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(createElement(Probe, initialProps));
  });
  return {
    result,
    rerender: (props: { dirty: boolean }) =>
      act(() => {
        tree.update(createElement(Probe, props));
      }),
    unmount: () =>
      act(() => {
        tree.unmount();
      }),
  };
}

describe('useUnsavedChangesGuard', () => {
  it('does not block leaving when nothing changed', () => {
    const { navigation, leave } = makeNavigation();
    const { result } = renderHook(() => useUnsavedChangesGuard(navigation as never, false), { dirty: false });
    const e = leave();
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(result.current.askOpen).toBe(false);
  });

  it('holds the leave and opens the prompt when dirty', () => {
    const { navigation, leave } = makeNavigation();
    const { result } = renderHook(() => useUnsavedChangesGuard(navigation as never, true), { dirty: true });
    let e!: ReturnType<typeof leave>;
    act(() => {
      e = leave();
    });
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(result.current.askOpen).toBe(true);
    expect(navigation.dispatch).not.toHaveBeenCalled();
  });

  it('Keep editing closes the prompt and drops the held action', () => {
    const { navigation, leave } = makeNavigation();
    const { result } = renderHook(() => useUnsavedChangesGuard(navigation as never, true), { dirty: true });
    act(() => {
      leave();
    });
    act(() => result.current.keepEditing());
    expect(result.current.askOpen).toBe(false);
    act(() => result.current.discard());
    expect(navigation.dispatch).not.toHaveBeenCalled();
  });

  it('Discard replays the exact held action once', () => {
    const { navigation, leave } = makeNavigation();
    const action = { type: 'POP', payload: { count: 1 } };
    const { result } = renderHook(() => useUnsavedChangesGuard(navigation as never, true), { dirty: true });
    act(() => {
      leave(action);
    });
    act(() => result.current.discard());
    expect(navigation.dispatch).toHaveBeenCalledTimes(1);
    expect(navigation.dispatch).toHaveBeenCalledWith(action);
    expect(result.current.askOpen).toBe(false);
  });

  it('the replayed leave is not intercepted a second time', () => {
    const { navigation, leave } = makeNavigation();
    const { result } = renderHook(() => useUnsavedChangesGuard(navigation as never, true), { dirty: true });
    act(() => {
      leave();
    });
    act(() => result.current.discard());
    const e = leave();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('allowLeave lets a Save or Archive go back without a prompt', () => {
    const { navigation, leave } = makeNavigation();
    const { result } = renderHook(() => useUnsavedChangesGuard(navigation as never, true), { dirty: true });
    act(() => result.current.allowLeave());
    const e = leave();
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(result.current.askOpen).toBe(false);
  });

  it('re-subscribes when dirty flips, so a reverted form is not blocked', () => {
    const { navigation, leave } = makeNavigation();
    const { rerender } = renderHook(
      ({ dirty }) => useUnsavedChangesGuard(navigation as never, dirty),
      { dirty: true },
    );
    rerender({ dirty: false });
    const e = leave();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('unsubscribes on unmount', () => {
    const { navigation, unsubscribe } = makeNavigation();
    const { unmount } = renderHook(() => useUnsavedChangesGuard(navigation as never, true), { dirty: true });
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
