/** Stop waiting for read-only work without discarding late promise rejections. */
export const waitWithAbort = <T>(work: Promise<T>, signal?: AbortSignal): Promise<T> => {
  if (!signal) return work;
  return new Promise<T>((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); reject(signal.reason ?? new DOMException("Stopped.", "AbortError")); };
    work.then((value) => { signal.removeEventListener("abort", abort); resolve(value); }, (error) => { signal.removeEventListener("abort", abort); reject(error); });
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
};
