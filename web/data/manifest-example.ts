export const manifestExample = `[[service]]
name = "web"
command = ["bun", "run", "dev"]
working_dir = "."
restart_policy = "on-failure"

[[service]]
name = "queue"
command = ["php", "artisan", "queue:work"]
working_dir = "."
depends_on = ["web"]`;
