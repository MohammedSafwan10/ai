export class TurnRegistry {
  private startingThreads = new Set<string>();

  begin(threadId: string, isBusy: () => boolean) {
    if (this.startingThreads.has(threadId) || isBusy()) {
      throw new Error("This chat is already running. Stop it before starting another turn.");
    }
    this.startingThreads.add(threadId);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.startingThreads.delete(threadId);
    };
  }

  isStarting(threadId: string) {
    return this.startingThreads.has(threadId);
  }
}
