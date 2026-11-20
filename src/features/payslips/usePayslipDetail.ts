/**
 * usePayslipDetail.ts — the payslip detail screen's data + PDF flow hook
 * (story 23-12). Owns:
 *
 * - the detail GET on mount + focus (the presigned URL regenerates per
 *   read, so every visit re-reads), seq-latched latest-wins;
 * - the THREE-state download tap (plan, review P1): `ready` → open (a
 *   blind re-POST would insert a fresh generation for a PDF that already
 *   exists — the BE only dedupes queued/generating); `queued|running` →
 *   resume polling; `none|failed` → POST then poll;
 * - the poll: a token loop, not setInterval (cancel + latest-wins), 5s
 *   ticks, hard stop at 12 (~60s) with an honest "still generating"
 *   notice — generation may be queue-paused, so spinning forever lies;
 * - the open flow: fresh GET → `openUrl` (the system viewer; openUrl
 *   rethrows, so a dead viewer surfaces as a retryable inline error).
 *
 * The PDF URL is never kept between calls: every open starts from a
 * fresh GET, which is what makes an expired (~10 min TTL) URL
 * unreachable from the UI.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { payslipsService } from '../../services';
import type { PayslipView } from '../../services';
import type { ApiError } from '../../services/api/apiError';
import { generateIdempotencyKey } from '../../utils/idempotency';
import { openUrl } from '../../utils/linking';
import { PAYSLIP_POLL_MAX_TICKS, PAYSLIP_POLL_MS } from './payslipModel';

export const PDF_OPEN_ERROR = "Couldn't open the PDF. Try again.";
export const PDF_LINK_ERROR = "Couldn't prepare the PDF link. Try again.";
export const PDF_REQUEST_ERROR =
  "Couldn't start the PDF. Check your connection and try again.";
export const PDF_STILL_GENERATING =
  'Still generating — try again in a bit.';

export type PayslipDetailState = {
  payslip: PayslipView | null;
  /** True while the first detail GET is in flight (nothing to show). */
  isLoading: boolean;
  /** The load failure — the BE's branched 404 copy renders verbatim. */
  error: string | null;
  /** True while a POST/poll cycle is in flight (button disabled). */
  pdfBusy: boolean;
  /** The poll-cap notice, safe to render. */
  pdfNotice: string | null;
  /** True while the fresh-GET + open flow is in flight. */
  isOpening: boolean;
  /** The open/prepare failure, safe to render above the button. */
  openError: string | null;
};

function transportMessage(err: ApiError, fallback: string): string {
  if (err.code === 'NETWORK_ERROR' || err.code === 'TIMEOUT') {
    return fallback;
  }
  return err.message || fallback;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export function usePayslipDetail(month: string) {
  const [state, setState] = useState<PayslipDetailState>({
    payslip: null,
    isLoading: true,
    error: null,
    pdfBusy: false,
    pdfNotice: null,
    isOpening: false,
    openError: null,
  });

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The tap handlers must branch on the pdf status the user is LOOKING
  // at, so they read through a ref that tracks the latest state (a
  // closure would freeze the render-time value).
  const latest = useRef(state);
  latest.current = state;

  const patch = useCallback((next: Partial<PayslipDetailState>) => {
    if (!mounted.current) return;
    setState(prev => {
      const merged = { ...prev, ...next };
      latest.current = merged;
      return merged;
    });
  }, []);

  // --- Detail reads: one seq for mount/focus/poll GETs (latest-wins). ------
  const seq = useRef(0);
  const inFlight = useRef(false);
  const fetchDetail = useCallback((): Promise<PayslipView | null> => {
    if (inFlight.current) return Promise.resolve(null);
    inFlight.current = true;
    const requestSeq = ++seq.current;
    return payslipsService
      .getMyPayslip(month)
      .then(payslip => {
        if (requestSeq !== seq.current || !mounted.current) return null;
        patch({ payslip, isLoading: false, error: null });
        return payslip;
      })
      .catch((err: ApiError) => {
        if (requestSeq !== seq.current || !mounted.current) return null;
        // The BE's branched 404 copy IS the message (not run / not
        // locked / not yours) — render it verbatim, never reworded.
        patch({
          isLoading: false,
          error: transportMessage(err, "Couldn't load the payslip. Try again."),
        });
        return null;
      })
      .finally(() => {
        if (requestSeq === seq.current) inFlight.current = false;
      });
  }, [month, patch]);

  useEffect(() => {
    // The screen's first paint: a spinner until the GET lands.
    patch({ isLoading: true, error: null });
    void fetchDetail();
  }, [fetchDetail, patch]);

  // --- The poll: a token loop (cancel + latest-wins), not setInterval. -----
  const pollToken = useRef(0);
  const runPoll = useCallback(() => {
    const token = ++pollToken.current;
    patch({ pdfBusy: true, pdfNotice: null, openError: null });
    const tick = async (n: number) => {
      if (!mounted.current || token !== pollToken.current) return;
      const payslip = await fetchDetail();
      if (!mounted.current || token !== pollToken.current) return;
      // A null read is a SKIPPED tick, not a settled one: fetchDetail
      // resolves null when a colliding mount/focus GET holds the lane, and
      // settling on that would flip the button while the PDF is still
      // generating. Only a REAL read settles — `none` on a real payslip
      // means the generation vanished (back to the request state).
      const status = payslip?.pdf.status ?? null;
      if (status === 'ready' || status === 'failed' || status === 'none') {
        // Terminal: the button flips (Open PDF / Try again) — no toast.
        patch({ pdfBusy: false, pdfNotice: null });
        return;
      }
      if (n + 1 >= PAYSLIP_POLL_MAX_TICKS) {
        patch({ pdfBusy: false, pdfNotice: PDF_STILL_GENERATING });
        return;
      }
      await sleep(PAYSLIP_POLL_MS);
      void tick(n + 1);
    };
    void tick(0);
  }, [fetchDetail, patch]);

  useEffect(
    () => () => {
      pollToken.current += 1; // unmount / month change kills the loop
    },
    [month],
  );

  // --- The open flow: fresh GET (fresh presign) → system viewer. -----------
  const openPdf = useCallback(() => {
    patch({ isOpening: true, openError: null });
    fetchDetail()
      .then(payslip => {
        if (!mounted.current) return;
        const url = payslip?.pdf.status === 'ready' ? payslip.pdf.url : undefined;
        if (!url) {
          patch({ isOpening: false, openError: PDF_LINK_ERROR });
          return;
        }
        openUrl(url)
          .then(() => patch({ isOpening: false }))
          .catch(() => patch({ isOpening: false, openError: PDF_OPEN_ERROR }));
      })
      .catch(() => {
        if (!mounted.current) return;
        patch({ isOpening: false, openError: PDF_LINK_ERROR });
      });
  }, [fetchDetail, patch]);

  // --- The three-state tap (plan review P1). -------------------------------
  const downloadPdf = useCallback(() => {
    const status = latest.current.payslip?.pdf.status ?? 'none';
    if (status === 'ready') {
      openPdf(); // fresh GET → open — never a re-POST of a finished PDF
      return;
    }
    if (status === 'queued' || status === 'running') {
      runPoll(); // resume watching — the request already exists
      return;
    }
    // none | failed → queue a fresh generation (failed never blocks).
    patch({ pdfBusy: true, pdfNotice: null, openError: null });
    payslipsService
      .requestMyPayslipPdf(month, generateIdempotencyKey())
      .then(() => {
        if (!mounted.current) return;
        runPoll();
      })
      .catch((err: ApiError) => {
        if (!mounted.current) return;
        patch({
          pdfBusy: false,
          openError: transportMessage(err, PDF_REQUEST_ERROR),
        });
      });
  }, [month, openPdf, patch, runPoll]);

  return {
    ...state,
    loadDetail: fetchDetail,
    downloadPdf,
  };
}
