export const detectedStacks = [
  {
    title: "Laravel",
    body: "Looks for artisan and composer.json, then shows app, queue, scheduler, and Reverb commands with local-safe defaults.",
    detail: "Optional package clues can also show Octane, Horizon, and Pulse check commands.",
  },
  {
    title: "Rails",
    body: "Looks for Gemfile and modern Rails entrypoints, then shows bin/dev or a Rails server command.",
    detail: "Projects with bin/dev get that command; other Rails apps can use bin/rails server.",
  },
  {
    title: "Modern JS frameworks",
    body: "Looks for package clues for Next.js, Astro, SvelteKit, Nuxt, Vite, Remix, React Router, Vue, Angular, Qwik, SolidStart, TanStack Start, RedwoodJS, Expo, NestJS, and Hono.",
    detail:
      "Framework proposals use the first matching package script name, such as dev, start, or start:dev, with the detected package manager.",
  },
  {
    title: "Django",
    body: "Looks for manage.py plus common Python dependency files, then shows the development server.",
    detail: "The proposed command uses python manage.py runserver.",
  },
  {
    title: "FastAPI",
    body: "Looks for FastAPI() in main.py or app/main.py, then shows a reloadable uvicorn command.",
    detail: "The proposed command targets main:app or app.main:app.",
  },
  {
    title: "Phoenix",
    body: "Looks for Phoenix in mix.exs, then shows the Phoenix development server.",
    detail: "The proposed command uses mix phx.server.",
  },
  {
    title: "Node package scripts",
    body: "Looks for package.json scripts and shows the first available dev, start, watch, or serve command.",
    detail:
      "Worker-like scripts named worker, queue, jobs, or background can appear as optional proposals.",
  },
  {
    title: "Go",
    body: "Looks for go.mod and either .air.toml or a main.go entrypoint.",
    detail: "Projects with air get air; other entrypoint projects can show go run .",
  },
  {
    title: "Make",
    body: "Looks for a Makefile with a dev target.",
    detail: "The proposed command is make dev.",
  },
];

export const packageManagers = ["npm", "pnpm", "yarn", "bun"];

export const dockerComposeVisibility = {
  title: "Docker Compose",
  body: "Compose services are shown through External Runtime Visibility. Docker keeps process ownership; Stasium does not turn them into Direct Managed Processes with Stasium Process Ownership.",
};
