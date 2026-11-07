import type { ReactElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { AppErrorBoundary } from './AppErrorBoundary';
import { recordCrash } from '../services/telemetry';

jest.mock('../services/telemetry', () => ({ recordCrash: jest.fn() }));

const recordCrashMock = recordCrash as jest.Mock;

function Boom(): ReactElement {
  throw new Error('render failed');
}

describe('AppErrorBoundary', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    recordCrashMock.mockClear();
    // React logs caught render errors; keep the test output quiet.
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('renders its children and reports nothing when nothing throws', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <AppErrorBoundary>
          <Text>hello</Text>
        </AppErrorBoundary>,
      );
    });

    expect(JSON.stringify(renderer.toJSON())).toContain('hello');
    expect(recordCrashMock).not.toHaveBeenCalled();
  });

  it('shows the plain fallback and reports the error once when a child throws', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <AppErrorBoundary>
          <Boom />
        </AppErrorBoundary>,
      );
    });

    expect(JSON.stringify(renderer.toJSON())).toContain('Something went wrong.');
    expect(recordCrashMock).toHaveBeenCalledTimes(1);
    const reported = recordCrashMock.mock.calls[0][0] as Error;
    expect(reported).toBeInstanceOf(Error);
    expect(reported.message).toBe('render failed');
  });
});
