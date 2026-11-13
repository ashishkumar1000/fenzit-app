/**
 * `editChangeRows` — CAP-6's per-field owner-edit history parser.
 *
 * The requirement: a `job_edited` activity row's `metadata.changes`
 * ({ field: { before, after } }, migration 20261113000002) becomes
 * human-readable rows — plain-English labels, formatted values, ID-valued
 * fields shown as "changed" without values. Anything that isn't a usable
 * `job_edited` changes object (other event types, older saves with no
 * metadata, drift) yields NOTHING — the timeline falls back to its plain
 * label. These tests pin that fallback behaviour adversarially: a crash or
 * a fabricated row on malformed input fails here.
 *
 * The timestamp format is pinned on a fixed UTC anchor (2026-11-13 14:30Z,
 * 8:00 pm IST) — `13 Nov, 7:00 PM` — uppercased with Sally's casing
 * unification (the device-verified render was "7:00 pm" before that call).
 * No year: history rows are recent; a same-day-in-a-past-year row would
 * also render without its year, accepted at review.
 */
import { editChangeRows, type EditChangeRow } from '../src/features/jobDetail/editHistoryModel';
import type { ActivityLogEntry } from '../src/services/resources/jobs';

function entry(
  overrides: Partial<ActivityLogEntry> & { metadata?: Record<string, unknown> | null },
): ActivityLogEntry {
  return {
    id: 'row-1',
    eventType: 'job_edited',
    actorId: 'owner-uuid',
    metadata: {},
    createdAt: '2026-11-13T14:30:00Z',
    ...overrides,
  } as ActivityLogEntry;
}

const JOB = '00000000-0000-0000-0000-000000000001';

describe('editChangeRows — job_edited with changes', () => {
  it('parses a timestamp change into before → after in IST', () => {
    const rows = editChangeRows(
      entry({
        metadata: {
          changes: {
            scheduledStart: {
              before: '2026-11-13T13:30:00Z',
              after: '2026-11-13T15:00:00Z',
            },
          },
        },
      }),
    );
    expect(rows).toEqual([
      {
        field: 'Start time',
        before: '13 Nov, 7:00 PM',
        after: '13 Nov, 8:30 PM',
        isIdField: false,
      },
    ]);
  });

  it('maps the known field labels and keeps only non-empty text values', () => {
    const rows = editChangeRows(
      entry({
        metadata: {
          changes: {
            description: { before: 'Old note', after: 'New note' },
            notesForTechnician: { before: '  ', after: 'Gate code 4321' },
            serviceLocation: { before: 'Old address', after: 'New address' },
          },
        },
      }),
    );
    expect(rows.map(r => [r.field, r.before, r.after])).toEqual([
      ['Description', 'Old note', 'New note'],
      ['Notes', '—', 'Gate code 4321'],
      ['Location', 'Old address', 'New address'],
    ]);
    rows.forEach(r => expect(r.isIdField).toBe(false));
  });

  it('formats priority to its display word and unknown priorities verbatim', () => {
    const rows = editChangeRows(
      entry({
        metadata: {
          changes: {
            priority: { before: 'normal', after: 'urgent' },
          },
        },
      }),
    );
    expect(rows).toEqual([
      { field: 'Priority', before: 'Normal', after: 'Urgent', isIdField: false },
    ]);

    const odd = editChangeRows(
      entry({
        metadata: { changes: { priority: { before: 'high', after: 'low' } } },
      }),
    );
    expect(odd[0]).toMatchObject({ before: 'high', after: 'low' });
  });

  it('caps long text values at 60 characters with an ellipsis', () => {
    const long = 'x'.repeat(80);
    const rows = editChangeRows(
      entry({ metadata: { changes: { description: { before: long, after: 'ok' } } } }),
    );
    expect(rows[0].before).toBe(`${'x'.repeat(60)}…`);
    expect(rows[0].before).toHaveLength(61);
  });

  it('renders ID-valued fields as label-only rows with null values', () => {
    const rows = editChangeRows(
      entry({
        metadata: {
          changes: {
            skillId: { before: JOB, after: '00000000-0000-0000-0000-000000000002' },
            technicianId: { before: null, after: '00000000-0000-0000-0000-000000000003' },
          },
        },
      }),
    );
    expect(rows).toEqual([
      { field: 'Skill', before: null, after: null, isIdField: true },
      { field: 'Employee', before: null, after: null, isIdField: true },
    ]);
  });

  it('passes through unknown field names with the raw field key as label', () => {
    const rows = editChangeRows(
      entry({ metadata: { changes: { futureField: { before: 'a', after: 'b' } } } }),
    );
    expect(rows).toEqual([
      { field: 'futureField', before: 'a', after: 'b', isIdField: false },
    ]);
  });

  it('skips malformed change entries without failing the whole row', () => {
    const rows = editChangeRows(
      entry({
        metadata: {
          changes: {
            description: 'not-an-object',
            priority: null,
            scheduledEnd: { before: '2026-11-13T13:30:00Z', after: '2026-11-13T15:00:00Z' },
          },
        },
      }),
    );
    expect(rows).toEqual([
      {
        field: 'End time',
        before: '13 Nov, 7:00 PM',
        after: '13 Nov, 8:30 PM',
        isIdField: false,
      },
    ]);
  });

  it('formats a non-ISO timestamp as an em dash, never a NaN date', () => {
    const rows = editChangeRows(
      entry({
        metadata: { changes: { scheduledStart: { before: 'yesterday', after: 42 } } },
      }),
    );
    expect(rows[0]).toEqual({
      field: 'Start time',
      before: '—',
      after: '—',
      isIdField: false,
    });
  });

  it('renders the IST wall clock, never the device timezone (UTC midnight is 5:30 AM in Bengaluru)', () => {
    // The old toLocaleString('en-IN') rendered the DEVICE's zone: on a UTC
    // test machine 2026-11-14T00:00Z printed "14 Nov, 12:00 am" — wrong by
    // 5½ hours against every other IST label on these screens. The
    // formatter shifts +5:30 first, so a UTC midnight instant reads 5:30 AM
    // IST on the 14th — the proof that no locale machinery is involved.
    const rows = editChangeRows(
      entry({
        metadata: {
          changes: { scheduledStart: { before: '2026-11-14T00:00:00Z', after: '2026-11-14T00:00:00Z' } },
        },
      }),
    );
    expect(rows[0]).toEqual({
      field: 'Start time',
      before: '14 Nov, 5:30 AM',
      after: '14 Nov, 5:30 AM',
      isIdField: false,
    });
  });
});

describe('editChangeRows — the no-rows fallbacks', () => {
  it('returns nothing for event types other than job_edited', () => {
    for (const eventType of ['job_created', 'job_approved', 'job_rejected', 'job_submitted']) {
      expect(
        editChangeRows(
          entry({
            eventType,
            metadata: { changes: { description: { before: 'a', after: 'b' } } },
          }),
        ),
      ).toEqual([]);
    }
  });

  it('returns nothing when metadata is missing or carries no changes', () => {
    // Older saves: no metadata at all.
    expect(editChangeRows(entry({ metadata: null }))).toEqual([]);
    expect(editChangeRows(entry({ metadata: {} }))).toEqual([]);
    expect(editChangeRows(entry({ metadata: { other: 1 } }))).toEqual([]);
  });

  it('returns nothing for adversarial changes payloads, never a crash', () => {
    expect(editChangeRows(entry({ metadata: { changes: null } }))).toEqual([]);
    expect(editChangeRows(entry({ metadata: { changes: 'x' } }))).toEqual([]);
    expect(editChangeRows(entry({ metadata: { changes: 7 } }))).toEqual([]);
    // An array is not a field→change map, even though JS typeof says "object".
    expect(editChangeRows(entry({ metadata: { changes: [{ before: 'a' }] } }))).toEqual(
      [],
    );
  });

  it('returns an empty list for an empty changes object', () => {
    expect(editChangeRows(entry({ metadata: { changes: {} } }))).toEqual([]);
  });
});

describe('editChangeRows — type surface', () => {
  it('rows expose exactly the EditChangeRow contract', () => {
    const rows: EditChangeRow[] = editChangeRows(
      entry({
        metadata: { changes: { description: { before: 'a', after: 'b' } } },
      }),
    );
    expect(Object.keys(rows[0]).sort()).toEqual([
      'after',
      'before',
      'field',
      'isIdField',
    ]);
  });
});
