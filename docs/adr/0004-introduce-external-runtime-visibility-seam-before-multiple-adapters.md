# Introduce external runtime visibility seam before multiple adapters

Stasium will introduce a generic **External Runtime Visibility** seam before multiple external runtime Adapters exist. Although one Adapter is usually only a hypothetical seam, non-Docker external runtimes are an intended product direction, so Workspace-facing polling, snapshots, action forwarding, and **Process Output** shape should not be Docker-specific. Docker Compose remains the first Adapter behind this seam, while future external runtimes should add Adapters without reshaping the Workspace flow.
