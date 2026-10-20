/**
 * Tests for WizardBanners' per-surface STALE-banner mapping (15-8): on each
 * step only the banner of a surface that step actually reads may render
 * (`error && hasLoaded` per the useOffices tri-state contract), and the
 * marker-PATCH retry + completion banners render regardless of step.
 *
 * Pure render tests — no services, no navigation.
 */
import type ReactTestRenderer from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import type { ComponentProps } from 'react';
import { Text } from 'react-native';
import { WizardBanners, type WizardSurfaceState } from './WizardBanners';

type BannersProps = ComponentProps<typeof WizardBanners>;

function surface(
  overrides: Partial<WizardSurfaceState> = {},
): WizardSurfaceState {
  return { hasError: false, hasLoaded: true, message: '', ...overrides };
}

function surfaceMessage(root: ReactTestRenderer.ReactTestInstance): string[] {
  return root
    .findAll((n) => n.type === Text)
    .map((n) => String(n.props.children))
    .filter((value) =>
      [
        "Couldn't refresh offices. Showing the last loaded list.",
        "Couldn't refresh your weekly off. Showing the last loaded selection.",
        "Couldn't refresh holidays. Showing the last loaded list.",
        "Couldn't refresh your team. Showing the last loaded list.",
        "Couldn't save your progress. Check your connection and try again.",
      ].includes(value),
    );
}

/** The completion line only: the header, then the server's reason or the plain retry line. */
function completionTexts(root: ReactTestRenderer.ReactTestInstance): string[] {
  return root
    .findAll((n) => n.type === Text)
    .map((n) => String(n.props.children))
    .filter((value) => value.startsWith("Attendance couldn't be enabled yet."));
}

const ALL_OK: BannersProps['surfaces'] = {
  offices: surface(),
  weeklyOff: surface(),
  holidays: surface(),
  roster: surface(),
};

const ALL_STALE: BannersProps['surfaces'] = {
  offices: surface({ hasError: true, message: "Couldn't refresh offices. Showing the last loaded list." }),
  weeklyOff: surface({
    hasError: true,
    message: "Couldn't refresh your weekly off. Showing the last loaded selection.",
  }),
  holidays: surface({ hasError: true, message: "Couldn't refresh holidays. Showing the last loaded list." }),
  roster: surface({ hasError: true, message: "Couldn't refresh your team. Showing the last loaded list." }),
};

function renderBanners(props: {
  step: BannersProps['step'];
  advanceError?: BannersProps['advanceError'];
  completionError?: BannersProps['completionError'];
  surfaces?: BannersProps['surfaces'];
}) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = create(
      <WizardBanners
        step={props.step}
        advanceError={props.advanceError ?? null}
        onRetryAdvance={() => {}}
        isAdvancing={false}
        completionError={props.completionError ?? null}
        surfaces={props.surfaces ?? ALL_STALE}
      />,
    );
  });
  return renderer.root;
}

describe('WizardBanners per-surface mapping', () => {
  it('each step announces ONLY the surfaces it reads', () => {
    expect(surfaceMessage(renderBanners({ step: 'offices' }))).toEqual([
      "Couldn't refresh offices. Showing the last loaded list.",
    ]);
    expect(surfaceMessage(renderBanners({ step: 'timings' }))).toEqual([
      "Couldn't refresh offices. Showing the last loaded list.",
    ]);
    expect(surfaceMessage(renderBanners({ step: 'weekly_off' }))).toEqual([
      "Couldn't refresh your weekly off. Showing the last loaded selection.",
    ]);
    expect(surfaceMessage(renderBanners({ step: 'holidays' }))).toEqual([
      "Couldn't refresh holidays. Showing the last loaded list.",
    ]);
    // Employees reads offices AND roster — in that order.
    expect(surfaceMessage(renderBanners({ step: 'employees' }))).toEqual([
      "Couldn't refresh offices. Showing the last loaded list.",
      "Couldn't refresh your team. Showing the last loaded list.",
    ]);
  });

  it('a surface with a first-load failure (error && !hasLoaded) renders NO stale banner', () => {
    const surfaces: BannersProps['surfaces'] = {
      ...ALL_STALE,
      offices: surface({
        hasError: true,
        hasLoaded: false,
        message: "Couldn't refresh offices. Showing the last loaded list.",
      }),
    };
    expect(
      surfaceMessage(renderBanners({ step: 'offices', surfaces })),
    ).toEqual([]);
  });

  it('the advance retry banner renders on any step, ahead of the stale banners', () => {
    const messages = surfaceMessage(
      renderBanners({
        step: 'offices',
        advanceError: {
          status: 500,
          code: 'INTERNAL_ERROR',
          message: 'boom',
          details: null,
        },
      }),
    );
    expect(messages).toEqual([
      "Couldn't save your progress. Check your connection and try again.",
      "Couldn't refresh offices. Showing the last loaded list.",
    ]);
  });

  it('the completion banner renders on the final step', () => {
    expect(
      completionTexts(
        renderBanners({
          step: 'employees',
          completionError: {
            status: 422,
            code: 'ATTENDANCE_SETUP_INCOMPLETE',
            message: 'Suresh has not signed in to the app yet. Tracking can start after their first sign-in.',
            details: null,
          },
        }),
      ),
    ).toEqual(["Attendance couldn't be enabled yet. Suresh has not signed in to the app yet. Tracking can start after their first sign-in."]);
  });

  it('shows the server reason, exactly as sent, after the header when Enable is refused as incomplete', () => {
    const reason =
      'Suresh has not signed in to the app yet. Tracking can start after their first sign-in.';
    expect(
      completionTexts(
        renderBanners({
          step: 'employees',
          surfaces: ALL_OK,
          completionError: {
            status: 422,
            code: 'ATTENDANCE_SETUP_INCOMPLETE',
            message: reason,
            details: null,
          },
        }),
      ),
    ).toEqual([`Attendance couldn't be enabled yet. ${reason}`]);
  });

  it('does not invent a reason for other failures: the plain retry line only', () => {
    expect(
      completionTexts(
        renderBanners({
          step: 'employees',
          surfaces: ALL_OK,
          completionError: {
            status: 500,
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to complete attendance setup',
            details: null,
          },
        }),
      ),
    ).toEqual(["Attendance couldn't be enabled yet. Try again."]);
  });

  it('an incomplete refusal with no server text falls back to the plain retry line', () => {
    expect(
      completionTexts(
        renderBanners({
          step: 'employees',
          surfaces: ALL_OK,
          completionError: {
            status: 422,
            code: 'ATTENDANCE_SETUP_INCOMPLETE',
            message: '',
            details: null,
          },
        }),
      ),
    ).toEqual(["Attendance couldn't be enabled yet. Try again."]);
  });
});
