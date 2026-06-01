# Block startup dependents when dependencies fail

Stasium will not start a **Managed Process** during **Startup** when one of its **Startup Dependencies** failed to become available. The dependent process should report a **Process State** that explains it was blocked, and that state is cleared or recomputed only when Startup or a manual start is attempted again. This favors clear failure locality over best-effort startup that can cascade noisy downstream failures.
